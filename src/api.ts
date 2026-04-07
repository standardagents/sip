import { createDecoder } from './decoders/simple';
import { asArrayBuffer, collectSourceBytes, inspect, inspectSource, prepareInputSource } from './input';
import { probe } from './probe';
import {
  calculateTargetDimensions,
  createResizeState,
  flushResize,
  processScanline,
} from './resize';
import type {
  ByteInput,
  EncodedImage,
  EncodedImageInfo,
  ImageInfo,
  InputSource,
  PixelStream,
  Scanline,
  TransformOptions,
  TransformStats,
} from './types';
import {
  WasmJpegDecoder,
  WasmJpegEncoder,
  WasmPngDecoder,
  calculateOptimalScale,
  initWithWasmModule,
  loadWasm,
} from './wasm';

const DEFAULT_QUALITY = 85;

type StatsResolver = {
  resolve: (value: TransformStats) => void;
  reject: (reason?: unknown) => void;
  promise: Promise<TransformStats>;
};

type InfoResolver<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  promise: Promise<T>;
};

type PreparedSource = Awaited<ReturnType<typeof prepareInputSource>>;

function createDeferred<T>(): InfoResolver<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { resolve, reject, promise };
}

function makeEmptyStats(): TransformStats {
  return {
    peakPipelineBytes: 0,
    peakCodecBytes: 0,
    peakBufferedInputBytes: 0,
    peakBufferedOutputBytes: 0,
    bytesIn: 0,
    bytesOut: 0,
    notes: [],
  };
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.byteLength;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function readJpegOrientation(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    while (offset < bytes.byteLength && bytes[offset] === 0xff) {
      offset++;
    }

    if (offset >= bytes.byteLength) {
      break;
    }

    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > bytes.byteLength) {
      break;
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      break;
    }

    const segmentStart = offset + 2;
    const payloadLength = segmentLength - 2;
    if (
      marker === 0xe1 &&
      payloadLength >= 14 &&
      bytes[segmentStart] === 0x45 &&
      bytes[segmentStart + 1] === 0x78 &&
      bytes[segmentStart + 2] === 0x69 &&
      bytes[segmentStart + 3] === 0x66 &&
      bytes[segmentStart + 4] === 0x00 &&
      bytes[segmentStart + 5] === 0x00
    ) {
      const tiff = segmentStart + 6;
      if (tiff + 8 > bytes.byteLength) {
        return null;
      }

      const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
      const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
      if (!littleEndian && !bigEndian) {
        return null;
      }

      const read16 = (index: number) => (
        littleEndian
          ? bytes[index] | (bytes[index + 1] << 8)
          : (bytes[index] << 8) | bytes[index + 1]
      );
      const read32 = (index: number) => (
        littleEndian
          ? (bytes[index] |
            (bytes[index + 1] << 8) |
            (bytes[index + 2] << 16) |
            (bytes[index + 3] << 24)) >>> 0
          : ((bytes[index] << 24) |
            (bytes[index + 1] << 16) |
            (bytes[index + 2] << 8) |
            bytes[index + 3]) >>> 0
      );

      const ifdOffset = read32(tiff + 4);
      const ifdStart = tiff + ifdOffset;
      if (ifdStart + 2 > bytes.byteLength) {
        return null;
      }

      const entryCount = read16(ifdStart);
      for (let i = 0; i < entryCount; i++) {
        const entry = ifdStart + 2 + (i * 12);
        if (entry + 12 > bytes.byteLength) {
          return null;
        }

        const tag = read16(entry);
        if (tag !== 0x0112) {
          continue;
        }

        const type = read16(entry + 2);
        const count = read32(entry + 4);
        if (type !== 3 || count !== 1) {
          return null;
        }

        const valueOffset = entry + 8;
        return littleEndian
          ? bytes[valueOffset] | (bytes[valueOffset + 1] << 8)
          : (bytes[valueOffset] << 8) | bytes[valueOffset + 1];
      }
    }

    offset += segmentLength;
  }

  return null;
}

function buildExifOrientationSegment(orientation: number): Uint8Array | null {
  if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) {
    return null;
  }

  const payload = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01,
    0x03, 0x00,
    0x01, 0x00, 0x00, 0x00,
    orientation & 0xff, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const length = payload.byteLength + 2;
  const segment = new Uint8Array(payload.byteLength + 4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (length >> 8) & 0xff;
  segment[3] = length & 0xff;
  segment.set(payload, 4);
  return segment;
}

function injectJpegApp1Segment(chunk: Uint8Array, segment: Uint8Array): Uint8Array {
  if (chunk.byteLength < 2 || chunk[0] !== 0xff || chunk[1] !== 0xd8) {
    return concatUint8Arrays([chunk, segment]);
  }

  const merged = new Uint8Array(chunk.byteLength + segment.byteLength);
  merged[0] = 0xff;
  merged[1] = 0xd8;
  merged.set(segment, 2);
  merged.set(chunk.subarray(2), 2 + segment.byteLength);
  return merged;
}

async function readJpegOrientationFromSource(source: {
  headerBytes: Uint8Array;
  ensureHeaderBytes(target: number): Promise<Uint8Array>;
}): Promise<number | null> {
  const direct = readJpegOrientation(source.headerBytes);
  if (direct !== null) {
    return direct;
  }

  const extended = await source.ensureHeaderBytes(262_144);
  return readJpegOrientation(extended);
}

class StatsTracker {
  readonly stats = makeEmptyStats();

  constructor(note?: string) {
    if (note) {
      this.note(note);
    }
  }

  note(message: string): void {
    if (!this.stats.notes.includes(message)) {
      this.stats.notes.push(message);
    }
  }

  addBytesIn(bytes: number): void {
    this.stats.bytesIn += bytes;
  }

  addBytesOut(bytes: number): void {
    this.stats.bytesOut += bytes;
  }

  update(bufferedInput: number, bufferedOutput: number, codecBytes: number, pipelineBytes: number): void {
    this.stats.peakBufferedInputBytes = Math.max(this.stats.peakBufferedInputBytes, bufferedInput);
    this.stats.peakBufferedOutputBytes = Math.max(this.stats.peakBufferedOutputBytes, bufferedOutput);
    this.stats.peakCodecBytes = Math.max(this.stats.peakCodecBytes, codecBytes);
    this.stats.peakPipelineBytes = Math.max(this.stats.peakPipelineBytes, pipelineBytes);
  }

  snapshot(): TransformStats {
    return { ...this.stats, notes: [...this.stats.notes] };
  }
}

function normalizeBox(options: TransformOptions, width: number, height: number) {
  return calculateTargetDimensions(
    width,
    height,
    options.width ?? width,
    options.height ?? height
  );
}

function createPixelStream(
  iteratorFactory: () => AsyncIterable<Scanline>,
  info: Promise<{ width: number; height: number; originalFormat: Exclude<ImageInfo['format'], 'unknown'> }>,
  stats: Promise<TransformStats> = Promise.resolve(makeEmptyStats())
): PixelStream {
  return {
    info,
    stats,
    [Symbol.asyncIterator]() {
      return iteratorFactory()[Symbol.asyncIterator]();
    },
  };
}

function createEncodedImage(
  iteratorFactory: () => AsyncIterable<Uint8Array>,
  info: Promise<EncodedImageInfo>,
  stats: Promise<TransformStats>
): EncodedImage {
  return {
    info,
    stats,
    [Symbol.asyncIterator]() {
      return iteratorFactory()[Symbol.asyncIterator]();
    },
  };
}

async function* iterateUint8ArrayRows(
  pixels: Uint8Array,
  width: number,
  height: number
): AsyncIterable<Scanline> {
  const rowSize = width * 3;
  for (let y = 0; y < height; y++) {
    yield {
      data: pixels.subarray(y * rowSize, (y + 1) * rowSize),
      width,
      y,
    };
  }
}

async function* iterateInputChunks(source: InputSource): AsyncIterable<{
  chunk: Uint8Array;
  isFinal: boolean;
}> {
  const iterator = source.open()[Symbol.asyncIterator]();
  let current = await iterator.next();

  if (current.done) {
    return;
  }

  while (true) {
    const next = await iterator.next();
    yield {
      chunk: current.value,
      isFinal: next.done === true,
    };

    if (next.done === true) {
      return;
    }

    current = next;
  }
}

async function* decodeSourceInternal(
  input: ByteInput | InputSource
): AsyncIterable<Scanline> {
  const prepared = await prepareInputSource(input);
  const info = await inspectSource(prepared);
  if (info.format === 'unknown') {
    throw new Error('Unsupported image format');
  }

  await loadWasm();

  if (info.format === 'jpeg') {
    const decoder = new WasmJpegDecoder();
    try {
      let headerReady = false;
      let started = false;

      for await (const { chunk, isFinal } of iterateInputChunks(prepared)) {
        decoder.pushInput(chunk, isFinal);

        if (!headerReady) {
          const headerStep = decoder.readHeaderStep();
          if (headerStep === 'ready') {
            headerReady = true;
          } else {
            continue;
          }
        }

        if (!started) {
          const startStep = decoder.startStep();
          if (startStep === 'ready') {
            started = true;
          } else {
            continue;
          }
        }

        while (true) {
          const scanline = decoder.readScanlineStep();
          if (scanline === 'needMore') {
            break;
          }
          if (scanline === null) {
            if (decoder.finishStep() !== 'ready') {
              throw new Error('Unexpected end of JPEG input while finishing');
            }
            return;
          }
          yield scanline;
        }
      }

      if (!headerReady) {
        if (decoder.readHeaderStep() !== 'ready') {
          throw new Error('Incomplete JPEG image');
        }
        headerReady = true;
      }

      if (!started) {
        if (decoder.startStep() !== 'ready') {
          throw new Error('Incomplete JPEG image');
        }
        started = true;
      }

      while (true) {
        const scanline = decoder.readScanlineStep();
        if (scanline === 'needMore') {
          throw new Error('Unexpected end of JPEG input');
        }
        if (scanline === null) {
          break;
        }
        yield scanline;
      }

      if (decoder.finishStep() !== 'ready') {
        throw new Error('Unexpected end of JPEG input while finishing');
      }
      return;
    } finally {
      decoder.dispose();
    }
  }

  const bytes = await collectSourceBytes(prepared);
  const buffer = asArrayBuffer(bytes);

  if (info.format === 'png') {
    const decoder = new WasmPngDecoder();
    try {
      decoder.init(buffer);
      decoder.start();
      for (const scanline of decoder.readAllScanlines()) {
        yield scanline;
      }
    } finally {
      decoder.dispose();
    }
    return;
  }

  const decoder = await createDecoder(info.format, buffer);
  try {
    const decoded = await decoder.decode();
    yield* iterateUint8ArrayRows(decoded.pixels, decoded.width, decoded.height);
  } finally {
    decoder.dispose();
  }
}

export function decode(input: ByteInput | InputSource): PixelStream {
  const infoDeferred = createDeferred<{ width: number; height: number; originalFormat: Exclude<ImageInfo['format'], 'unknown'> }>();

  const iteratorFactory = () => (async function* decodeIterator() {
    const prepared = await prepareInputSource(input);
    const info = await inspectSource(prepared);
    if (info.format === 'unknown') {
      throw new Error('Unsupported image format');
    }

    infoDeferred.resolve({
      width: info.width,
      height: info.height,
      originalFormat: info.format,
    });

    yield* decodeSourceInternal(prepared);
  })();

  return createPixelStream(iteratorFactory, infoDeferred.promise);
}

export function resize(stream: PixelStream, options: TransformOptions): PixelStream {
  const infoPromise = stream.info.then((info) => {
    const target = normalizeBox(options, info.width, info.height);
    return {
      width: target.width,
      height: target.height,
      originalFormat: info.originalFormat,
    };
  });

  const iteratorFactory = () => (async function* resizeIterator() {
    const sourceInfo = await stream.info;
    const target = normalizeBox(options, sourceInfo.width, sourceInfo.height);
    const state = createResizeState(
      sourceInfo.width,
      sourceInfo.height,
      target.width,
      target.height
    );

    for await (const scanline of stream) {
      const output = processScanline(state, scanline.data, scanline.y);
      for (const next of output) {
        yield next;
      }
    }

    for (const next of flushResize(state)) {
      yield next;
    }
  })();

  return createPixelStream(iteratorFactory, infoPromise, stream.stats ?? Promise.resolve(makeEmptyStats()));
}

export function encodeJpeg(stream: PixelStream, options: TransformOptions = {}): EncodedImage {
  const quality = options.quality ?? DEFAULT_QUALITY;
  const infoPromise = stream.info.then((info) => ({
    width: info.width,
    height: info.height,
    mimeType: 'image/jpeg' as const,
    originalFormat: info.originalFormat,
  }));

  const statsPromise = stream.stats ?? Promise.resolve(makeEmptyStats());

  const iteratorFactory = () => (async function* encodeIterator() {
    await loadWasm();
    const info = await stream.info;
    const encoder = new WasmJpegEncoder();

    try {
      encoder.init(info.width, info.height, quality);
      encoder.start();

      for await (const scanline of stream) {
        encoder.writeScanline(scanline);
        for (const chunk of encoder.drainChunks()) {
          yield chunk;
        }
      }

      for (const chunk of encoder.finish()) {
        yield chunk;
      }
    } finally {
      encoder.dispose();
    }
  })();

  return createEncodedImage(iteratorFactory, infoPromise, statsPromise);
}

async function* runJpegTransform(
  source: PreparedSource,
  info: ImageInfo,
  options: TransformOptions,
  infoDeferred: InfoResolver<EncodedImageInfo>,
  stats: StatsTracker
): AsyncIterable<Uint8Array> {
  await loadWasm();

  const orientation = await readJpegOrientationFromSource(source);
  const orientationSegment = orientation ? buildExifOrientationSegment(orientation) : null;
  const target = normalizeBox(options, info.width, info.height);
  const decoder = new WasmJpegDecoder();
  const encoder = new WasmJpegEncoder();
  let resizeState = createResizeState(1, 1, target.width, target.height);
  let decodeWidth = info.width;
  let decodeHeight = info.height;
  const scale = calculateOptimalScale(info.width, info.height, target.width, target.height);
  let headerReady = false;
  let started = false;
  let emittedFirstChunk = false;

  const refresh = () => {
    const resizeBytes =
      (resizeState.bufferA?.byteLength ?? 0) +
      (resizeState.bufferB?.byteLength ?? 0);
    const codecBytes =
      decoder.getBufferedInputSize() +
      decoder.getRowBufferSize() +
      encoder.getBufferedOutputSize() +
      encoder.getRowBufferSize();
    const pipelineBytes = codecBytes + resizeBytes;
    stats.update(decoder.getBufferedInputSize(), encoder.getBufferedOutputSize(), codecBytes, pipelineBytes);
  };

  try {
    if (orientationSegment) {
      stats.note(`jpeg-orientation=${orientation}`);
    }

    for await (const { chunk, isFinal } of iterateInputChunks(source)) {
      stats.addBytesIn(chunk.byteLength);
      decoder.pushInput(chunk, isFinal);
      refresh();

      if (!headerReady) {
        const headerStep = decoder.readHeaderStep();
        if (headerStep === 'needMore') {
          continue;
        }

        headerReady = true;
        const output = decoder.setScale(scale);
        decodeWidth = output.width;
        decodeHeight = output.height;
        resizeState = createResizeState(output.width, output.height, target.width, target.height);
        encoder.init(target.width, target.height, options.quality ?? DEFAULT_QUALITY);
        encoder.start();
        infoDeferred.resolve({
          width: target.width,
          height: target.height,
          mimeType: 'image/jpeg',
          originalFormat: 'jpeg',
        });
        stats.note(`jpeg-dct-scale=1/${scale}`);
        stats.note(`jpeg-decoded=${decodeWidth}x${decodeHeight}`);
        refresh();
      }

      if (!started) {
        const startStep = decoder.startStep();
        if (startStep === 'needMore') {
          continue;
        }

        started = true;
        refresh();
      }

      while (true) {
        const scanline = decoder.readScanlineStep();
        if (scanline === 'needMore') {
          break;
        }
        if (scanline === null) {
          break;
        }

        const outputScanlines = processScanline(resizeState, scanline.data, scanline.y);
        refresh();

        for (const outScanline of outputScanlines) {
          encoder.writeScanline(outScanline);
          refresh();
          for (const jpegChunk of encoder.drainChunks()) {
            const nextChunk = !emittedFirstChunk && orientationSegment
              ? injectJpegApp1Segment(jpegChunk, orientationSegment)
              : jpegChunk;
            emittedFirstChunk = true;
            stats.addBytesOut(nextChunk.byteLength);
            refresh();
            yield nextChunk;
          }
        }
      }
    }

    if (!headerReady) {
      if (decoder.readHeaderStep() !== 'ready') {
        throw new Error('Incomplete JPEG header');
      }

      const output = decoder.setScale(scale);
      decodeWidth = output.width;
      decodeHeight = output.height;
      resizeState = createResizeState(output.width, output.height, target.width, target.height);
      encoder.init(target.width, target.height, options.quality ?? DEFAULT_QUALITY);
      encoder.start();
      infoDeferred.resolve({
        width: target.width,
        height: target.height,
        mimeType: 'image/jpeg',
        originalFormat: 'jpeg',
      });
      stats.note(`jpeg-dct-scale=1/${scale}`);
      stats.note(`jpeg-decoded=${decodeWidth}x${decodeHeight}`);
      headerReady = true;
      refresh();
    }

    if (!started) {
      if (decoder.startStep() !== 'ready') {
        throw new Error('Unexpected end of JPEG input before decode start');
      }
      started = true;
      refresh();
    }

    while (true) {
      const scanline = decoder.readScanlineStep();
      if (scanline === 'needMore') {
        throw new Error('Unexpected end of JPEG input');
      }
      if (scanline === null) {
        break;
      }

      const outputScanlines = processScanline(resizeState, scanline.data, scanline.y);
      refresh();

      for (const outScanline of outputScanlines) {
        encoder.writeScanline(outScanline);
        refresh();
        for (const jpegChunk of encoder.drainChunks()) {
          const nextChunk = !emittedFirstChunk && orientationSegment
            ? injectJpegApp1Segment(jpegChunk, orientationSegment)
            : jpegChunk;
          emittedFirstChunk = true;
          stats.addBytesOut(nextChunk.byteLength);
          refresh();
          yield nextChunk;
        }
      }
    }

    if (decoder.finishStep() !== 'ready') {
      throw new Error('Unexpected end of JPEG input while finishing');
    }

    for (const outScanline of flushResize(resizeState)) {
      encoder.writeScanline(outScanline);
      refresh();
      for (const jpegChunk of encoder.drainChunks()) {
        const nextChunk = !emittedFirstChunk && orientationSegment
          ? injectJpegApp1Segment(jpegChunk, orientationSegment)
          : jpegChunk;
        emittedFirstChunk = true;
        stats.addBytesOut(nextChunk.byteLength);
        refresh();
        yield nextChunk;
      }
    }

    for (const jpegChunk of encoder.finish()) {
      const nextChunk = !emittedFirstChunk && orientationSegment
        ? injectJpegApp1Segment(jpegChunk, orientationSegment)
        : jpegChunk;
      emittedFirstChunk = true;
      stats.addBytesOut(nextChunk.byteLength);
      refresh();
      yield nextChunk;
    }
  } finally {
    decoder.dispose();
    encoder.dispose();
  }
}

async function* runBufferedTransform(
  source: PreparedSource,
  info: ImageInfo,
  options: TransformOptions,
  infoDeferred: InfoResolver<EncodedImageInfo>,
  stats: StatsTracker
): AsyncIterable<Uint8Array> {
  const bytes = await collectSourceBytes(source);
  stats.addBytesIn(bytes.byteLength);
  stats.update(bytes.byteLength, 0, bytes.byteLength, bytes.byteLength);
  stats.note(`${info.format}-input-buffered`);
  await loadWasm();

  const target = normalizeBox(options, info.width, info.height);
  const encoder = new WasmJpegEncoder();
  let scanlines: AsyncIterable<Scanline>;

  if (info.format === 'png') {
    const decoder = new WasmPngDecoder();
    decoder.init(asArrayBuffer(bytes));
    decoder.start();

    const state = createResizeState(info.width, info.height, target.width, target.height);
    scanlines = (async function* pngRows() {
      try {
        for (const scanline of decoder.readAllScanlines()) {
          for (const outScanline of processScanline(state, scanline.data, scanline.y)) {
            yield outScanline;
          }
        }

        for (const outScanline of flushResize(state)) {
          yield outScanline;
        }
      } finally {
        decoder.dispose();
      }
    })();
  } else {
    const decoder = await createDecoder(info.format, asArrayBuffer(bytes));
    const decoded = await decoder.decode();
    decoder.dispose();

    const state = createResizeState(decoded.width, decoded.height, target.width, target.height);
    scanlines = (async function* bufferedRows() {
      for await (const row of iterateUint8ArrayRows(decoded.pixels, decoded.width, decoded.height)) {
        for (const outScanline of processScanline(state, row.data, row.y)) {
          yield outScanline;
        }
      }

      for (const outScanline of flushResize(state)) {
        yield outScanline;
      }
    })();
  }

  infoDeferred.resolve({
    width: target.width,
    height: target.height,
    mimeType: 'image/jpeg',
    originalFormat: info.format as EncodedImageInfo['originalFormat'],
  });

  try {
    encoder.init(target.width, target.height, options.quality ?? DEFAULT_QUALITY);
    encoder.start();

    for await (const scanline of scanlines) {
      encoder.writeScanline(scanline);
      const codecBytes = bytes.byteLength + encoder.getBufferedOutputSize() + encoder.getRowBufferSize();
      stats.update(bytes.byteLength, encoder.getBufferedOutputSize(), codecBytes, codecBytes);
      for (const chunk of encoder.drainChunks()) {
        stats.addBytesOut(chunk.byteLength);
        stats.update(bytes.byteLength, encoder.getBufferedOutputSize(), codecBytes, codecBytes);
        yield chunk;
      }
    }

    for (const chunk of encoder.finish()) {
      stats.addBytesOut(chunk.byteLength);
      const codecBytes = bytes.byteLength + encoder.getBufferedOutputSize() + encoder.getRowBufferSize();
      stats.update(bytes.byteLength, encoder.getBufferedOutputSize(), codecBytes, codecBytes);
      yield chunk;
    }
  } finally {
    encoder.dispose();
  }
}

export function transform(input: ByteInput | InputSource, options: TransformOptions = {}): EncodedImage {
  const infoDeferred = createDeferred<EncodedImageInfo>();
  const statsDeferred = createDeferred<TransformStats>();

  const iteratorFactory = () => (async function* transformIterator() {
    const prepared = await prepareInputSource(input);
    const info = await inspectSource(prepared);
    if (info.format === 'unknown') {
      throw new Error('Unsupported image format');
    }

    const stats = new StatsTracker(
      prepared.kind === 'stream' ? 'streaming-input' : 'byte-input'
    );

    try {
      if (info.format === 'jpeg') {
        yield* runJpegTransform(prepared, info, options, infoDeferred, stats);
      } else {
        yield* runBufferedTransform(prepared, info, options, infoDeferred, stats);
      }

      statsDeferred.resolve(stats.snapshot());
    } catch (error) {
      infoDeferred.reject(error);
      statsDeferred.reject(error);
      throw error;
    }
  })();

  return createEncodedImage(iteratorFactory, infoDeferred.promise, statsDeferred.promise);
}

export async function ready(options: { wasm?: WebAssembly.Module | ArrayBuffer } = {}): Promise<void> {
  if (options.wasm instanceof WebAssembly.Module) {
    await initWithWasmModule(options.wasm);
    return;
  }

  if (options.wasm instanceof ArrayBuffer) {
    const compiled = await WebAssembly.compile(options.wasm);
    await initWithWasmModule(compiled);
    return;
  }

  await loadWasm();
}

export async function collect(image: EncodedImage): Promise<{
  data: ArrayBuffer;
  info: EncodedImageInfo;
  stats: TransformStats;
}> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of image) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    data: merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength),
    info: await image.info,
    stats: await image.stats,
  };
}

export function toReadableStream(image: EncodedImage): ReadableStream<Uint8Array> {
  const iterator = image[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      if (typeof iterator.return === 'function') {
        await iterator.return(reason);
      }
    },
  });
}

export function toResponse(image: EncodedImage, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'image/jpeg');

  return new Response(toReadableStream(image), {
    ...init,
    headers,
  });
}

export { inspect };
