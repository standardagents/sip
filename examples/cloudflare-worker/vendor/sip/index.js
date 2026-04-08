// src/decoders/simple.ts
function isCloudflareWorker() {
  const cacheStorage = globalThis.caches;
  return typeof cacheStorage !== "undefined" && typeof cacheStorage.default !== "undefined";
}
function getPreloadedCodecBinary(format) {
  const globalValue = globalThis.__SIP_CODEC_WASM__;
  if (!globalValue || typeof globalValue !== "object") {
    return null;
  }
  const formatValue = globalValue[format];
  if (formatValue instanceof ArrayBuffer || formatValue instanceof Uint8Array || formatValue instanceof WebAssembly.Module) {
    return formatValue;
  }
  return null;
}
function isNode() {
  if (isCloudflareWorker()) {
    return false;
  }
  return typeof process !== "undefined" && process.versions != null && process.versions.node != null;
}
async function initCodecWithBinary(initFn, wasmSource) {
  if (wasmSource instanceof WebAssembly.Module) {
    await initFn(wasmSource);
    return;
  }
  let buffer;
  if (wasmSource instanceof Uint8Array) {
    const copy = new Uint8Array(wasmSource.byteLength);
    copy.set(wasmSource);
    buffer = copy.buffer;
  } else {
    buffer = wasmSource;
  }
  const wasmModule2 = await WebAssembly.compile(buffer);
  await initFn(wasmModule2);
}
async function initCodecForNode(initFn, wasmPath) {
  const { readFile } = await import('fs/promises');
  const { createRequire } = await import('module');
  const require2 = createRequire(import.meta.url);
  const resolvedPath = require2.resolve(wasmPath);
  const wasmBuffer = await readFile(resolvedPath);
  const wasmModule2 = await WebAssembly.compile(wasmBuffer);
  await initFn(wasmModule2);
}
var SimpleDecoder = class {
  format;
  supportsScanline = false;
  supportsScaledDecode = false;
  data;
  width = 0;
  height = 0;
  hasAlpha = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decodeFn = null;
  constructor(format, data) {
    this.format = format;
    this.data = data;
  }
  async init(data) {
    this.data = data;
    switch (this.format) {
      case "avif": {
        const { default: decode2, init } = await import('@jsquash/avif/decode.js');
        const preloaded = getPreloadedCodecBinary("avif");
        if (preloaded) {
          await initCodecWithBinary(init, preloaded);
        } else if (isNode()) {
          await initCodecForNode(init, "@jsquash/avif/codec/dec/avif_dec.wasm");
        }
        this.decodeFn = decode2;
        this.hasAlpha = true;
        break;
      }
      case "webp": {
        const { default: decode2, init } = await import('@jsquash/webp/decode.js');
        const preloaded = getPreloadedCodecBinary("webp");
        if (preloaded) {
          await initCodecWithBinary(init, preloaded);
        } else if (isNode()) {
          await initCodecForNode(init, "@jsquash/webp/codec/dec/webp_dec.wasm");
        }
        this.decodeFn = decode2;
        this.hasAlpha = true;
        break;
      }
      case "jpeg":
      case "png":
        throw new Error(
          `${this.format.toUpperCase()} requires native WASM decoder. Build the WASM module with \`pnpm build:wasm\` in the @standardagents/sip repo root.`
        );
      default:
        throw new Error(`Unsupported format for SimpleDecoder: ${this.format}`);
    }
    const imageData = await this.decodeFn(this.data);
    if (!imageData) {
      throw new Error(`Failed to decode ${this.format} image`);
    }
    this.width = imageData.width;
    this.height = imageData.height;
    return {
      width: this.width,
      height: this.height,
      hasAlpha: this.hasAlpha
    };
  }
  async decode(_scaleFactor) {
    if (!this.decodeFn) {
      throw new Error("Decoder not initialized. Call init() first.");
    }
    const imageData = await this.decodeFn(this.data);
    this.width = imageData.width;
    this.height = imageData.height;
    const rgba = new Uint8Array(imageData.data.buffer);
    const rgb = new Uint8Array(this.width * this.height * 3);
    let srcIdx = 0;
    let dstIdx = 0;
    const pixelCount = this.width * this.height;
    for (let i = 0; i < pixelCount; i++) {
      rgb[dstIdx++] = rgba[srcIdx++];
      rgb[dstIdx++] = rgba[srcIdx++];
      rgb[dstIdx++] = rgba[srcIdx++];
      srcIdx++;
    }
    return {
      pixels: rgb,
      width: this.width,
      height: this.height
    };
  }
  dispose() {
    this.decodeFn = null;
  }
};
async function createDecoder(format, data) {
  const decoder = new SimpleDecoder(format, data);
  await decoder.init(data);
  return decoder;
}

// src/probe.ts
var MAGIC = {
  // JPEG: FFD8FF
  JPEG: [255, 216, 255],
  // PNG: 89504E47 0D0A1A0A
  PNG: [137, 80, 78, 71, 13, 10, 26, 10],
  // WebP: RIFF....WEBP
  RIFF: [82, 73, 70, 70],
  // "RIFF"
  WEBP: [87, 69, 66, 80],
  // "WEBP"
  // AVIF: ....ftypavif or ....ftypavis
  FTYP: [102, 116, 121, 112]
  // "ftyp"
};
function detectFormat(data) {
  if (data.length < 12) return "unknown";
  if (data[0] === MAGIC.JPEG[0] && data[1] === MAGIC.JPEG[1] && data[2] === MAGIC.JPEG[2]) {
    return "jpeg";
  }
  if (data[0] === MAGIC.PNG[0] && data[1] === MAGIC.PNG[1] && data[2] === MAGIC.PNG[2] && data[3] === MAGIC.PNG[3] && data[4] === MAGIC.PNG[4] && data[5] === MAGIC.PNG[5] && data[6] === MAGIC.PNG[6] && data[7] === MAGIC.PNG[7]) {
    return "png";
  }
  if (data[0] === MAGIC.RIFF[0] && data[1] === MAGIC.RIFF[1] && data[2] === MAGIC.RIFF[2] && data[3] === MAGIC.RIFF[3] && data[8] === MAGIC.WEBP[0] && data[9] === MAGIC.WEBP[1] && data[10] === MAGIC.WEBP[2] && data[11] === MAGIC.WEBP[3]) {
    return "webp";
  }
  if (data[4] === MAGIC.FTYP[0] && data[5] === MAGIC.FTYP[1] && data[6] === MAGIC.FTYP[2] && data[7] === MAGIC.FTYP[3]) {
    const brand = String.fromCharCode(data[8], data[9], data[10], data[11]);
    if (brand === "avif" || brand === "avis" || brand === "mif1" || brand === "msf1") {
      return "avif";
    }
  }
  return "unknown";
}
function probeJpeg(data) {
  let offset = 2;
  while (offset < data.length - 1) {
    if (data[offset] !== 255) {
      offset++;
      continue;
    }
    while (offset < data.length && data[offset] === 255) {
      offset++;
    }
    if (offset >= data.length) break;
    const marker = data[offset++];
    const isSOF = marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207;
    if (isSOF) {
      if (offset + 7 > data.length) return null;
      const height = data[offset + 3] << 8 | data[offset + 4];
      const width = data[offset + 5] << 8 | data[offset + 6];
      return { width, height };
    }
    if (marker === 216 || marker === 217 || marker >= 208 && marker <= 215) {
      continue;
    }
    if (offset + 1 >= data.length) break;
    const segmentLength = data[offset] << 8 | data[offset + 1];
    offset += segmentLength;
  }
  return null;
}
function probePng(data) {
  if (data.length < 24) return null;
  const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);
  if (chunkType !== "IHDR") return null;
  const width = data[16] << 24 | data[17] << 16 | data[18] << 8 | data[19];
  const height = data[20] << 24 | data[21] << 16 | data[22] << 8 | data[23];
  const colorType = data[25];
  const hasAlpha = colorType === 4 || colorType === 6;
  return { width, height, hasAlpha };
}
function probeWebp(data) {
  if (data.length < 30) return null;
  const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15]);
  if (chunkType === "VP8 ") {
    if (data.length < 30) return null;
    if (data[23] !== 157 || data[24] !== 1 || data[25] !== 42) return null;
    const width = (data[26] | data[27] << 8) & 16383;
    const height = (data[28] | data[29] << 8) & 16383;
    return { width, height, hasAlpha: false };
  }
  if (chunkType === "VP8L") {
    if (data[20] !== 47) return null;
    const bits = data[21] | data[22] << 8 | data[23] << 16 | data[24] << 24;
    const width = (bits & 16383) + 1;
    const height = (bits >> 14 & 16383) + 1;
    const hasAlpha = (bits >> 28 & 1) === 1;
    return { width, height, hasAlpha };
  }
  if (chunkType === "VP8X") {
    const flags = data[20];
    const hasAlpha = (flags & 16) !== 0;
    const width = (data[24] | data[25] << 8 | data[26] << 16) + 1;
    const height = (data[27] | data[28] << 8 | data[29] << 16) + 1;
    return { width, height, hasAlpha };
  }
  return null;
}
function probeAvif(data) {
  let offset = 0;
  while (offset + 8 <= data.length) {
    const size = data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3];
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7]
    );
    if (size === 0) break;
    if (size < 8) break;
    if (type === "ispe" && offset + 20 <= data.length) {
      const width = data[offset + 12] << 24 | data[offset + 13] << 16 | data[offset + 14] << 8 | data[offset + 15];
      const height = data[offset + 16] << 24 | data[offset + 17] << 16 | data[offset + 18] << 8 | data[offset + 19];
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
    if (type === "meta" || type === "iprp" || type === "ipco") {
      const headerSize = type === "meta" ? 12 : 8;
      offset += headerSize;
      continue;
    }
    offset += size;
  }
  return null;
}
function probe(input) {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  const format = detectFormat(data);
  let result = null;
  switch (format) {
    case "jpeg":
      result = probeJpeg(data);
      break;
    case "png":
      result = probePng(data);
      break;
    case "webp":
      result = probeWebp(data);
      break;
    case "avif":
      result = probeAvif(data);
      break;
  }
  if (!result) {
    return {
      format: "unknown",
      width: 0,
      height: 0,
      hasAlpha: false
    };
  }
  return {
    format,
    width: result.width,
    height: result.height,
    hasAlpha: result.hasAlpha ?? false
  };
}

// src/input.ts
var INSPECT_TARGETS = [64, 512, 4096, 16384, 65536, 262144];
var STREAM_CHUNK_TARGET = 64 * 1024;
function sliceArrayBuffer(view) {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}
function concatChunks(chunks, total) {
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
function normalizeChunk(chunk) {
  if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength) {
    const copy2 = new Uint8Array(chunk.byteLength);
    copy2.set(chunk);
    return copy2;
  }
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy;
}
async function* iterateReadableStream(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      if (value && value.byteLength > 0) {
        yield normalizeChunk(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function* coalesceAsyncIterable(input, target = STREAM_CHUNK_TARGET) {
  let pending = [];
  let total = 0;
  const flush = () => {
    if (total === 0) {
      return null;
    }
    const merged2 = concatChunks(pending, total);
    pending = [];
    total = 0;
    return merged2;
  };
  for await (const rawChunk of input) {
    const chunk = normalizeChunk(rawChunk);
    if (chunk.byteLength >= target && total === 0) {
      yield chunk;
      continue;
    }
    pending.push(chunk);
    total += chunk.byteLength;
    if (total >= target) {
      const merged2 = flush();
      if (merged2) {
        yield merged2;
      }
    }
  }
  const merged = flush();
  if (merged) {
    yield merged;
  }
}
function getAsyncIterable(input) {
  if (typeof ReadableStream !== "undefined" && input instanceof ReadableStream) {
    return coalesceAsyncIterable(iterateReadableStream(input));
  }
  if (typeof input[Symbol.asyncIterator] === "function") {
    return coalesceAsyncIterable(input);
  }
  return coalesceAsyncIterable(input);
}
var BytesInputSource = class {
  constructor(bytes, formatHint) {
    this.bytes = bytes;
    this.byteLength = bytes.byteLength;
    this.headerBytes = bytes.subarray(0, Math.min(bytes.byteLength, INSPECT_TARGETS.at(-1)));
    this.formatHint = formatHint;
  }
  bytes;
  kind = "bytes";
  replayable = true;
  byteLength;
  formatHint;
  headerBytes;
  done = true;
  async ensureHeaderBytes(target) {
    return this.bytes.subarray(0, Math.min(this.bytes.byteLength, target));
  }
  open() {
    const bytes = this.bytes;
    return (async function* openBytes() {
      yield bytes;
    })();
  }
};
var StreamInputSource = class {
  kind = "stream";
  replayable = false;
  byteLength;
  formatHint;
  iterator;
  peekedChunks = [];
  peekedBytes = 0;
  opened = false;
  exhausted = false;
  headerBytes = new Uint8Array(0);
  constructor(input, formatHint, byteLength) {
    this.iterator = input[Symbol.asyncIterator]();
    this.formatHint = formatHint;
    this.byteLength = byteLength;
  }
  get done() {
    return this.exhausted;
  }
  async ensureHeaderBytes(target) {
    while (!this.exhausted && this.peekedBytes < target) {
      const { value, done } = await this.iterator.next();
      if (done) {
        this.exhausted = true;
        break;
      }
      if (value && value.byteLength > 0) {
        const chunk = normalizeChunk(value);
        this.peekedChunks.push(chunk);
        this.peekedBytes += chunk.byteLength;
      }
    }
    this.headerBytes = concatChunks(this.peekedChunks, this.peekedBytes);
    return this.headerBytes;
  }
  open() {
    if (this.opened) {
      throw new Error("Input source can only be opened once");
    }
    this.opened = true;
    const replay = this.peekedChunks.slice();
    const iterator = this.iterator;
    return (async function* openStream() {
      for (const chunk of replay) {
        yield chunk;
      }
      while (true) {
        const { value, done } = await iterator.next();
        if (done) {
          return;
        }
        if (value && value.byteLength > 0) {
          yield normalizeChunk(value);
        }
      }
    })();
  }
};
function isInputSource(value) {
  return typeof value === "object" && value !== null && "open" in value && "headerBytes" in value;
}
function toUint8Array(input) {
  return input instanceof Uint8Array ? normalizeChunk(input) : new Uint8Array(input);
}
async function sourceFromRequestLike(input) {
  const contentType = input.headers.get("content-type") ?? "";
  const hint = contentType.startsWith("image/") ? contentType.slice("image/".length) : void 0;
  const lengthHeader = input.headers.get("content-length");
  const byteLength = lengthHeader ? Number(lengthHeader) : void 0;
  if (input.body) {
    return new StreamInputSource(getAsyncIterable(input.body), hint, Number.isFinite(byteLength) ? byteLength : void 0);
  }
  const bytes = new Uint8Array(await input.arrayBuffer());
  return new BytesInputSource(bytes, hint);
}
async function prepareInputSource(input) {
  if (isInputSource(input)) {
    return input;
  }
  if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    return new BytesInputSource(toUint8Array(input));
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new BytesInputSource(new Uint8Array(await input.arrayBuffer()));
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return sourceFromRequestLike(input);
  }
  if (typeof Response !== "undefined" && input instanceof Response) {
    return sourceFromRequestLike(input);
  }
  if (typeof ReadableStream !== "undefined" && input instanceof ReadableStream) {
    return new StreamInputSource(getAsyncIterable(input));
  }
  return new StreamInputSource(getAsyncIterable(input));
}
async function inspect(input) {
  const source = await prepareInputSource(input);
  const info = await inspectSource(source);
  if (info.format === "unknown") {
    throw new Error("Unsupported image format");
  }
  return { info, source };
}
async function inspectSource(source) {
  let best = probe(source.headerBytes);
  if (best.format !== "unknown") {
    return best;
  }
  for (const target of INSPECT_TARGETS) {
    const bytes = await source.ensureHeaderBytes(target);
    best = probe(bytes);
    if (best.format !== "unknown") {
      return best;
    }
  }
  if (source.headerBytes.byteLength === 0) {
    return { format: "unknown", width: 0, height: 0, hasAlpha: false };
  }
  return probe(source.headerBytes);
}
async function collectSourceBytes(source) {
  const chunks = [];
  let total = 0;
  for await (const chunk of source.open()) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  return concatChunks(chunks, total);
}
function asArrayBuffer(bytes) {
  return sliceArrayBuffer(bytes);
}

// src/resize.ts
function createResizeState(srcWidth, srcHeight, dstWidth, dstHeight) {
  return {
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight,
    bufferA: null,
    bufferB: null,
    bufferAY: -1,
    bufferBY: -1,
    currentOutputY: 0
  };
}
function resizeRowHorizontal(src, srcWidth, dstWidth) {
  const dst = new Uint8Array(dstWidth * 3);
  const xScale = srcWidth / dstWidth;
  for (let dstX = 0; dstX < dstWidth; dstX++) {
    const srcXFloat = dstX * xScale;
    const srcX0 = Math.floor(srcXFloat);
    const srcX1 = Math.min(srcX0 + 1, srcWidth - 1);
    const t = srcXFloat - srcX0;
    const invT = 1 - t;
    const src0 = srcX0 * 3;
    const src1 = srcX1 * 3;
    const dstOffset = dstX * 3;
    dst[dstOffset] = Math.round(src[src0] * invT + src[src1] * t);
    dst[dstOffset + 1] = Math.round(src[src0 + 1] * invT + src[src1 + 1] * t);
    dst[dstOffset + 2] = Math.round(src[src0 + 2] * invT + src[src1 + 2] * t);
  }
  return dst;
}
function blendRows(rowA, rowB, t, width) {
  const result = new Uint8Array(width * 3);
  const invT = 1 - t;
  for (let i = 0; i < width * 3; i++) {
    result[i] = Math.round(rowA[i] * invT + rowB[i] * t);
  }
  return result;
}
function processScanline(state, srcScanline, srcY) {
  const { srcWidth, srcHeight, dstWidth, dstHeight } = state;
  const yScale = srcHeight / dstHeight;
  const output = [];
  const resizedRow = resizeRowHorizontal(srcScanline, srcWidth, dstWidth);
  state.bufferA = state.bufferB;
  state.bufferAY = state.bufferBY;
  state.bufferB = resizedRow;
  state.bufferBY = srcY;
  while (state.currentOutputY < dstHeight) {
    const srcYFloat = state.currentOutputY * yScale;
    const srcYFloor = Math.floor(srcYFloat);
    const srcYCeil = Math.min(srcYFloor + 1, srcHeight - 1);
    if (srcYCeil > srcY) {
      break;
    }
    if (state.bufferA === null) {
      output.push({
        data: state.bufferB,
        width: dstWidth,
        y: state.currentOutputY
      });
      state.currentOutputY++;
      continue;
    }
    const t = srcYFloat - srcYFloor;
    let rowA = state.bufferA;
    let rowB = state.bufferB;
    if (srcYFloor === state.bufferBY) {
      rowA = state.bufferB;
      rowB = state.bufferB;
    } else if (srcYCeil === state.bufferAY) {
      rowA = state.bufferA;
      rowB = state.bufferA;
    }
    const blended = blendRows(rowA, rowB, t, dstWidth);
    output.push({
      data: blended,
      width: dstWidth,
      y: state.currentOutputY
    });
    state.currentOutputY++;
  }
  return output;
}
function flushResize(state) {
  const output = [];
  while (state.currentOutputY < state.dstHeight) {
    if (state.bufferB === null) break;
    output.push({
      data: state.bufferB,
      width: state.dstWidth,
      y: state.currentOutputY
    });
    state.currentOutputY++;
  }
  return output;
}
function calculateTargetDimensions(srcWidth, srcHeight, maxWidth, maxHeight) {
  const scaleX = maxWidth / srcWidth;
  const scaleY = maxHeight / srcHeight;
  const scale = Math.min(scaleX, scaleY, 1);
  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
    scale
  };
}

// src/wasm/loader.ts
var wasmModule = null;
var wasmPromise = null;
var precompiledWasmModule = null;
async function initWithWasmModule(compiledModule) {
  if (wasmModule) {
    return;
  }
  if (compiledModule) {
    precompiledWasmModule = compiledModule;
  }
  await loadWasm();
}
function getWasmModule() {
  if (!wasmModule) {
    throw new Error("WASM module not loaded. Call loadWasm() first.");
  }
  return wasmModule;
}
async function loadWasm() {
  if (wasmModule) {
    return wasmModule;
  }
  if (wasmPromise) {
    return wasmPromise;
  }
  wasmPromise = doLoadWasm();
  try {
    wasmModule = await wasmPromise;
    return wasmModule;
  } catch (err) {
    wasmPromise = null;
    throw err;
  }
}
async function doLoadWasm() {
  if (typeof globalThis !== "undefined" && globalThis.__SIP_WASM_LOADER__) {
    const loader = globalThis.__SIP_WASM_LOADER__;
    return await loader();
  }
  try {
    const createSipModule = (await import('./sip.js')).default;
    const isNode2 = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
    if (isNode2) {
      const { readFile } = await import('fs/promises');
      const wasmBinary = await readFile(new URL("./sip.wasm", import.meta.url));
      const module2 = await createSipModule({ wasmBinary });
      return module2;
    }
    if (precompiledWasmModule) {
      const module2 = await new Promise((resolve, reject) => {
        let resolvedModule = null;
        createSipModule({
          instantiateWasm: (imports, receiveInstance) => {
            WebAssembly.instantiate(precompiledWasmModule, imports).then((instance) => {
              receiveInstance(instance);
            }).catch((err) => {
              reject(err);
            });
            return {};
          },
          onRuntimeInitialized: () => {
            if (resolvedModule && resolvedModule.HEAPU8) {
              resolve(resolvedModule);
            }
          }
        }).then((mod) => {
          resolvedModule = mod;
          if (mod.HEAPU8) {
            resolve(mod);
          }
        }).catch(reject);
      });
      return module2;
    }
    const module = await createSipModule();
    return module;
  } catch (err) {
    throw new Error(
      "SIP WASM module not available. To use streaming processing, build the WASM module with `pnpm build:wasm` in the @standardagents/sip repo root. Error: " + (err instanceof Error ? err.message : String(err))
    );
  }
}
function copyToWasm(module, data) {
  const ptr = module._malloc(data.length);
  if (!ptr) {
    throw new Error("Failed to allocate WASM memory");
  }
  module.HEAPU8.set(data, ptr);
  return ptr;
}
function copyFromWasm(module, ptr, size) {
  return new Uint8Array(module.HEAPU8.buffer, ptr, size).slice();
}

// src/wasm/decoder.ts
var WasmJpegDecoder = class {
  module;
  decoder = 0;
  width = 0;
  height = 0;
  outputWidth = 0;
  outputHeight = 0;
  rowBufferPtr = 0;
  started = false;
  finished = false;
  constructor() {
    this.module = getWasmModule();
    this.decoder = this.module._sip_decoder_create();
    if (!this.decoder) {
      throw new Error("Failed to create JPEG decoder");
    }
  }
  pushInput(data, isFinal = false) {
    if (data.byteLength === 0 && !isFinal) {
      return;
    }
    let ptr = 0;
    try {
      ptr = data.byteLength > 0 ? copyToWasm(this.module, data) : 0;
      if (this.module._sip_decoder_push_input(this.decoder, ptr, data.byteLength, isFinal ? 1 : 0) !== 0) {
        throw new Error("Failed to feed JPEG bytes into decoder");
      }
    } finally {
      if (ptr) {
        this.module._free(ptr);
      }
    }
  }
  /**
   * Compatibility helper for full-buffer callers.
   */
  init(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let ptr = 0;
    try {
      ptr = copyToWasm(this.module, bytes);
      if (this.module._sip_decoder_set_source(this.decoder, ptr, bytes.byteLength) !== 0) {
        throw new Error("Failed to set buffered JPEG source");
      }
    } finally {
      if (ptr) {
        this.module._free(ptr);
      }
    }
    const header = this.readHeaderStep();
    if (header !== "ready") {
      throw new Error("Incomplete JPEG header");
    }
    return { width: this.width, height: this.height };
  }
  readHeaderStep() {
    const result = this.module._sip_decoder_read_header(this.decoder);
    if (result === 1) {
      return "needMore";
    }
    if (result !== 0) {
      throw new Error("Failed to read JPEG header");
    }
    this.width = this.module._sip_decoder_get_width(this.decoder);
    this.height = this.module._sip_decoder_get_height(this.decoder);
    this.outputWidth = this.width;
    this.outputHeight = this.height;
    return "ready";
  }
  getDimensions() {
    return { width: this.width, height: this.height };
  }
  setScale(scaleDenom) {
    if (this.module._sip_decoder_set_scale(this.decoder, scaleDenom) !== 0) {
      throw new Error(`Invalid scale denominator: ${scaleDenom}`);
    }
    this.outputWidth = this.module._sip_decoder_get_output_width(this.decoder);
    this.outputHeight = this.module._sip_decoder_get_output_height(this.decoder);
    return { width: this.outputWidth, height: this.outputHeight };
  }
  getOutputDimensions() {
    return { width: this.outputWidth, height: this.outputHeight };
  }
  start() {
    const step = this.startStep();
    if (step !== "ready") {
      throw new Error("JPEG decoder needs more input before starting");
    }
  }
  startStep() {
    if (this.started) {
      return "ready";
    }
    const result = this.module._sip_decoder_start(this.decoder);
    if (result === 1) {
      return "needMore";
    }
    if (result !== 0) {
      throw new Error("Failed to start JPEG decompression");
    }
    this.rowBufferPtr = this.module._sip_decoder_get_row_buffer(this.decoder);
    if (!this.rowBufferPtr) {
      throw new Error("Failed to get JPEG decoder row buffer");
    }
    this.started = true;
    return "ready";
  }
  readScanline() {
    const result = this.readScanlineStep();
    if (result === "needMore") {
      throw new Error("JPEG decoder needs more input");
    }
    return result;
  }
  readScanlineStep() {
    if (!this.started || this.finished) {
      return null;
    }
    const result = this.module._sip_decoder_read_scanline(this.decoder);
    if (result === 2) {
      return "needMore";
    }
    if (result === 0) {
      this.finished = true;
      return null;
    }
    if (result !== 1) {
      throw new Error("Failed to read JPEG scanline");
    }
    const rowSize = this.outputWidth * 3;
    const data = new Uint8Array(this.module.HEAPU8.buffer, this.rowBufferPtr, rowSize).slice();
    const y = this.module._sip_decoder_get_scanline(this.decoder) - 1;
    return { data, width: this.outputWidth, y };
  }
  finishStep() {
    const result = this.module._sip_decoder_finish(this.decoder);
    if (result === 1) {
      return "needMore";
    }
    if (result !== 0) {
      throw new Error("Failed to finish JPEG decompression");
    }
    return "ready";
  }
  getBufferedInputSize() {
    return this.module._sip_decoder_get_buffered_input_size(this.decoder);
  }
  getRowBufferSize() {
    return this.module._sip_decoder_get_working_size(this.decoder);
  }
  dispose() {
    if (this.decoder) {
      this.module._sip_decoder_destroy(this.decoder);
      this.decoder = 0;
    }
    this.rowBufferPtr = 0;
    this.started = false;
    this.finished = false;
  }
};
function calculateOptimalScale(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scales = [8, 4, 2, 1];
  for (const scale of scales) {
    const scaledWidth = Math.ceil(srcWidth / scale);
    const scaledHeight = Math.ceil(srcHeight / scale);
    if (scaledWidth >= targetWidth && scaledHeight >= targetHeight) {
      return scale;
    }
  }
  return 1;
}

// src/wasm/encoder.ts
var WasmJpegEncoder = class {
  module;
  encoder = 0;
  width = 0;
  height = 0;
  rowBufferPtr = 0;
  started = false;
  finished = false;
  currentLine = 0;
  constructor() {
    this.module = getWasmModule();
    this.encoder = this.module._sip_encoder_create();
    if (!this.encoder) {
      throw new Error("Failed to create JPEG encoder");
    }
  }
  init(width, height, quality = 85) {
    this.width = width;
    this.height = height;
    if (this.module._sip_encoder_init(this.encoder, width, height, quality) !== 0) {
      throw new Error("Failed to initialize JPEG encoder");
    }
  }
  start() {
    if (this.started) {
      return;
    }
    if (this.module._sip_encoder_start(this.encoder) !== 0) {
      throw new Error("Failed to start JPEG compression");
    }
    this.rowBufferPtr = this.module._sip_encoder_get_row_buffer(this.encoder);
    if (!this.rowBufferPtr) {
      throw new Error("Failed to get JPEG encoder row buffer");
    }
    this.started = true;
    this.currentLine = 0;
  }
  writeScanline(scanline) {
    this.writeScanlineData(scanline.data);
  }
  writeScanlineData(data) {
    if (!this.started || this.finished) {
      throw new Error("Encoder is not ready for scanlines");
    }
    const expectedSize = this.width * 3;
    if (data.byteLength !== expectedSize) {
      throw new Error(`Invalid scanline size: expected ${expectedSize}, got ${data.byteLength}`);
    }
    this.module.HEAPU8.set(data, this.rowBufferPtr);
    if (this.module._sip_encoder_write_scanline(this.encoder) !== 1) {
      throw new Error("Failed to write JPEG scanline");
    }
    this.currentLine++;
  }
  drainChunks() {
    const chunks = [];
    while (true) {
      const ptr = this.module._sip_encoder_peek_chunk_data(this.encoder);
      const size = this.module._sip_encoder_peek_chunk_size(this.encoder);
      if (!ptr || !size) {
        break;
      }
      chunks.push(copyFromWasm(this.module, ptr, size));
      this.module._sip_encoder_pop_chunk(this.encoder);
    }
    return chunks;
  }
  finish() {
    if (!this.started) {
      throw new Error("Encoding not started");
    }
    if (this.finished) {
      return [];
    }
    if (this.currentLine !== this.height) {
      throw new Error(`Incomplete image: wrote ${this.currentLine}/${this.height} scanlines`);
    }
    if (this.module._sip_encoder_finish(this.encoder) !== 0) {
      throw new Error("Failed to finish JPEG compression");
    }
    this.finished = true;
    return this.drainChunks();
  }
  encodeAll(pixels) {
    this.start();
    const rowSize = this.width * 3;
    const chunks = [];
    let total = 0;
    for (let y = 0; y < this.height; y++) {
      this.writeScanlineData(pixels.subarray(y * rowSize, (y + 1) * rowSize));
      for (const chunk of this.drainChunks()) {
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    }
    for (const chunk of this.finish()) {
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
  }
  getBufferedOutputSize() {
    return this.module._sip_encoder_get_buffered_output_size(this.encoder);
  }
  getRowBufferSize() {
    return this.width * 3;
  }
  getCurrentLine() {
    return this.currentLine;
  }
  dispose() {
    if (this.encoder) {
      this.module._sip_encoder_destroy(this.encoder);
      this.encoder = 0;
    }
    this.rowBufferPtr = 0;
    this.started = false;
    this.finished = false;
    this.currentLine = 0;
  }
};

// src/wasm/png-decoder.ts
var WasmPngDecoder = class {
  module;
  decoder = 0;
  dataPtr = 0;
  width = 0;
  height = 0;
  hasAlpha = false;
  rowBufferPtr = 0;
  started = false;
  finished = false;
  currentRow = 0;
  constructor() {
    this.module = getWasmModule();
  }
  /**
   * Initialize decoder with PNG data
   */
  init(data) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    this.decoder = this.module._sip_png_decoder_create();
    if (!this.decoder) {
      throw new Error("Failed to create PNG decoder");
    }
    this.dataPtr = copyToWasm(this.module, bytes);
    if (this.module._sip_png_decoder_set_source(this.decoder, this.dataPtr, bytes.length) !== 0) {
      this.dispose();
      throw new Error("Failed to set PNG decoder source");
    }
    if (this.module._sip_png_decoder_read_header(this.decoder) !== 0) {
      this.dispose();
      throw new Error("Failed to read PNG header");
    }
    this.width = this.module._sip_png_decoder_get_width(this.decoder);
    this.height = this.module._sip_png_decoder_get_height(this.decoder);
    this.hasAlpha = this.module._sip_png_decoder_has_alpha(this.decoder) !== 0;
    return { width: this.width, height: this.height, hasAlpha: this.hasAlpha };
  }
  /**
   * Get image dimensions
   */
  getDimensions() {
    return { width: this.width, height: this.height };
  }
  /**
   * Check if image has alpha channel
   */
  getHasAlpha() {
    return this.hasAlpha;
  }
  /**
   * Start decoding
   */
  start() {
    if (!this.decoder) {
      throw new Error("Decoder not initialized");
    }
    if (this.started) {
      throw new Error("Decoding already started");
    }
    if (this.module._sip_png_decoder_start(this.decoder) !== 0) {
      throw new Error("Failed to start PNG decompression");
    }
    this.rowBufferPtr = this.module._sip_png_decoder_get_row_buffer(this.decoder);
    if (!this.rowBufferPtr) {
      throw new Error("Failed to get row buffer");
    }
    this.started = true;
    this.currentRow = 0;
  }
  /**
   * Read next scanline
   *
   * @returns Scanline object or null if no more scanlines
   */
  readScanline() {
    if (!this.started || this.finished) {
      return null;
    }
    if (this.currentRow >= this.height) {
      this.finished = true;
      return null;
    }
    const result = this.module._sip_png_decoder_read_row(this.decoder);
    if (result < 0) {
      throw new Error("Failed to read PNG row");
    }
    const rowSize = this.width * 3;
    const data = new Uint8Array(
      this.module.HEAPU8.buffer,
      this.rowBufferPtr,
      rowSize
    ).slice();
    const y = this.currentRow;
    this.currentRow++;
    if (result === 0 || this.currentRow >= this.height) {
      this.finished = true;
    }
    return {
      data,
      width: this.width,
      y
    };
  }
  /**
   * Read all remaining scanlines
   *
   * @yields Scanline objects
   */
  *readAllScanlines() {
    let scanline;
    while ((scanline = this.readScanline()) !== null) {
      yield scanline;
    }
  }
  /**
   * Decode entire image to RGB buffer
   *
   * @returns Full RGB pixel buffer
   */
  decodeAll() {
    if (!this.started) {
      this.start();
    }
    const pixels = new Uint8Array(this.width * this.height * 3);
    const rowSize = this.width * 3;
    for (const scanline of this.readAllScanlines()) {
      pixels.set(scanline.data, scanline.y * rowSize);
    }
    return {
      pixels,
      width: this.width,
      height: this.height
    };
  }
  /**
   * Clean up resources
   */
  dispose() {
    if (this.decoder) {
      this.module._sip_png_decoder_destroy(this.decoder);
      this.decoder = 0;
    }
    if (this.dataPtr) {
      this.module._free(this.dataPtr);
      this.dataPtr = 0;
    }
    this.started = false;
    this.finished = false;
    this.rowBufferPtr = 0;
    this.currentRow = 0;
  }
};

// src/api.ts
var DEFAULT_QUALITY = 85;
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}
function makeEmptyStats() {
  return {
    peakPipelineBytes: 0,
    peakCodecBytes: 0,
    peakBufferedInputBytes: 0,
    peakBufferedOutputBytes: 0,
    bytesIn: 0,
    bytesOut: 0,
    notes: []
  };
}
function concatUint8Arrays(chunks) {
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
function readJpegOrientation(bytes) {
  if (bytes.byteLength < 4 || bytes[0] !== 255 || bytes[1] !== 216) {
    return null;
  }
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 255) {
      offset++;
      continue;
    }
    while (offset < bytes.byteLength && bytes[offset] === 255) {
      offset++;
    }
    if (offset >= bytes.byteLength) {
      break;
    }
    const marker = bytes[offset++];
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      continue;
    }
    if (marker === 217 || marker === 218) {
      break;
    }
    if (offset + 2 > bytes.byteLength) {
      break;
    }
    const segmentLength = bytes[offset] << 8 | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      break;
    }
    const segmentStart = offset + 2;
    const payloadLength = segmentLength - 2;
    if (marker === 225 && payloadLength >= 14 && bytes[segmentStart] === 69 && bytes[segmentStart + 1] === 120 && bytes[segmentStart + 2] === 105 && bytes[segmentStart + 3] === 102 && bytes[segmentStart + 4] === 0 && bytes[segmentStart + 5] === 0) {
      const tiff = segmentStart + 6;
      if (tiff + 8 > bytes.byteLength) {
        return null;
      }
      const littleEndian = bytes[tiff] === 73 && bytes[tiff + 1] === 73;
      const bigEndian = bytes[tiff] === 77 && bytes[tiff + 1] === 77;
      if (!littleEndian && !bigEndian) {
        return null;
      }
      const read16 = (index) => littleEndian ? bytes[index] | bytes[index + 1] << 8 : bytes[index] << 8 | bytes[index + 1];
      const read32 = (index) => littleEndian ? (bytes[index] | bytes[index + 1] << 8 | bytes[index + 2] << 16 | bytes[index + 3] << 24) >>> 0 : (bytes[index] << 24 | bytes[index + 1] << 16 | bytes[index + 2] << 8 | bytes[index + 3]) >>> 0;
      const ifdOffset = read32(tiff + 4);
      const ifdStart = tiff + ifdOffset;
      if (ifdStart + 2 > bytes.byteLength) {
        return null;
      }
      const entryCount = read16(ifdStart);
      for (let i = 0; i < entryCount; i++) {
        const entry = ifdStart + 2 + i * 12;
        if (entry + 12 > bytes.byteLength) {
          return null;
        }
        const tag = read16(entry);
        if (tag !== 274) {
          continue;
        }
        const type = read16(entry + 2);
        const count = read32(entry + 4);
        if (type !== 3 || count !== 1) {
          return null;
        }
        const valueOffset = entry + 8;
        return littleEndian ? bytes[valueOffset] | bytes[valueOffset + 1] << 8 : bytes[valueOffset] << 8 | bytes[valueOffset + 1];
      }
    }
    offset += segmentLength;
  }
  return null;
}
function buildExifOrientationSegment(orientation) {
  if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) {
    return null;
  }
  const payload = new Uint8Array([
    69,
    120,
    105,
    102,
    0,
    0,
    73,
    73,
    42,
    0,
    8,
    0,
    0,
    0,
    1,
    0,
    18,
    1,
    3,
    0,
    1,
    0,
    0,
    0,
    orientation & 255,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  ]);
  const length = payload.byteLength + 2;
  const segment = new Uint8Array(payload.byteLength + 4);
  segment[0] = 255;
  segment[1] = 225;
  segment[2] = length >> 8 & 255;
  segment[3] = length & 255;
  segment.set(payload, 4);
  return segment;
}
function injectJpegApp1Segment(chunk, segment) {
  if (chunk.byteLength < 2 || chunk[0] !== 255 || chunk[1] !== 216) {
    return concatUint8Arrays([chunk, segment]);
  }
  const merged = new Uint8Array(chunk.byteLength + segment.byteLength);
  merged[0] = 255;
  merged[1] = 216;
  merged.set(segment, 2);
  merged.set(chunk.subarray(2), 2 + segment.byteLength);
  return merged;
}
async function readJpegOrientationFromSource(source) {
  const direct = readJpegOrientation(source.headerBytes);
  if (direct !== null) {
    return direct;
  }
  const extended = await source.ensureHeaderBytes(262144);
  return readJpegOrientation(extended);
}
var StatsTracker = class {
  stats = makeEmptyStats();
  constructor(note) {
    if (note) {
      this.note(note);
    }
  }
  note(message) {
    if (!this.stats.notes.includes(message)) {
      this.stats.notes.push(message);
    }
  }
  addBytesIn(bytes) {
    this.stats.bytesIn += bytes;
  }
  addBytesOut(bytes) {
    this.stats.bytesOut += bytes;
  }
  update(bufferedInput, bufferedOutput, codecBytes, pipelineBytes) {
    this.stats.peakBufferedInputBytes = Math.max(this.stats.peakBufferedInputBytes, bufferedInput);
    this.stats.peakBufferedOutputBytes = Math.max(this.stats.peakBufferedOutputBytes, bufferedOutput);
    this.stats.peakCodecBytes = Math.max(this.stats.peakCodecBytes, codecBytes);
    this.stats.peakPipelineBytes = Math.max(this.stats.peakPipelineBytes, pipelineBytes);
  }
  snapshot() {
    return { ...this.stats, notes: [...this.stats.notes] };
  }
};
function normalizeBox(options, width, height) {
  return calculateTargetDimensions(
    width,
    height,
    options.width ?? width,
    options.height ?? height
  );
}
function createPixelStream(iteratorFactory, info, stats = Promise.resolve(makeEmptyStats())) {
  return {
    info,
    stats,
    [Symbol.asyncIterator]() {
      return iteratorFactory()[Symbol.asyncIterator]();
    }
  };
}
function createEncodedImage(iteratorFactory, info, stats) {
  return {
    info,
    stats,
    [Symbol.asyncIterator]() {
      return iteratorFactory()[Symbol.asyncIterator]();
    }
  };
}
async function* iterateUint8ArrayRows(pixels, width, height) {
  const rowSize = width * 3;
  for (let y = 0; y < height; y++) {
    yield {
      data: pixels.subarray(y * rowSize, (y + 1) * rowSize),
      width,
      y
    };
  }
}
async function* iterateInputChunks(source) {
  const iterator = source.open()[Symbol.asyncIterator]();
  let current = await iterator.next();
  if (current.done) {
    return;
  }
  while (true) {
    const next = await iterator.next();
    yield {
      chunk: current.value,
      isFinal: next.done === true
    };
    if (next.done === true) {
      return;
    }
    current = next;
  }
}
async function* decodeSourceInternal(input) {
  const prepared = await prepareInputSource(input);
  const info = await inspectSource(prepared);
  if (info.format === "unknown") {
    throw new Error("Unsupported image format");
  }
  await loadWasm();
  if (info.format === "jpeg") {
    const decoder2 = new WasmJpegDecoder();
    try {
      if (prepared.kind === "bytes") {
        const bytes2 = await collectSourceBytes(prepared);
        decoder2.init(asArrayBuffer(bytes2));
        decoder2.start();
        while (true) {
          const scanline = decoder2.readScanline();
          if (!scanline) {
            break;
          }
          yield scanline;
        }
        if (decoder2.finishStep() !== "ready") {
          throw new Error("Unexpected end of JPEG input while finishing");
        }
        return;
      }
      let headerReady = false;
      let started = false;
      for await (const { chunk, isFinal } of iterateInputChunks(prepared)) {
        decoder2.pushInput(chunk, isFinal);
        if (!headerReady) {
          const headerStep = decoder2.readHeaderStep();
          if (headerStep === "ready") {
            headerReady = true;
          } else {
            continue;
          }
        }
        if (!started) {
          const startStep = decoder2.startStep();
          if (startStep === "ready") {
            started = true;
          } else {
            continue;
          }
        }
        while (true) {
          const scanline = decoder2.readScanlineStep();
          if (scanline === "needMore") {
            break;
          }
          if (scanline === null) {
            if (decoder2.finishStep() !== "ready") {
              throw new Error("Unexpected end of JPEG input while finishing");
            }
            return;
          }
          yield scanline;
        }
      }
      if (!headerReady) {
        if (decoder2.readHeaderStep() !== "ready") {
          throw new Error("Incomplete JPEG image");
        }
        headerReady = true;
      }
      if (!started) {
        if (decoder2.startStep() !== "ready") {
          throw new Error("Incomplete JPEG image");
        }
        started = true;
      }
      while (true) {
        const scanline = decoder2.readScanlineStep();
        if (scanline === "needMore") {
          throw new Error("Unexpected end of JPEG input");
        }
        if (scanline === null) {
          break;
        }
        yield scanline;
      }
      if (decoder2.finishStep() !== "ready") {
        throw new Error("Unexpected end of JPEG input while finishing");
      }
      return;
    } finally {
      decoder2.dispose();
    }
  }
  const bytes = await collectSourceBytes(prepared);
  const buffer = asArrayBuffer(bytes);
  if (info.format === "png") {
    const decoder2 = new WasmPngDecoder();
    try {
      decoder2.init(buffer);
      decoder2.start();
      for (const scanline of decoder2.readAllScanlines()) {
        yield scanline;
      }
    } finally {
      decoder2.dispose();
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
function decode(input) {
  const infoDeferred = createDeferred();
  const iteratorFactory = () => (async function* decodeIterator() {
    const prepared = await prepareInputSource(input);
    const info = await inspectSource(prepared);
    if (info.format === "unknown") {
      throw new Error("Unsupported image format");
    }
    infoDeferred.resolve({
      width: info.width,
      height: info.height,
      originalFormat: info.format
    });
    yield* decodeSourceInternal(prepared);
  })();
  return createPixelStream(iteratorFactory, infoDeferred.promise);
}
function resize(stream, options) {
  const infoPromise = stream.info.then((info) => {
    const target = normalizeBox(options, info.width, info.height);
    return {
      width: target.width,
      height: target.height,
      originalFormat: info.originalFormat
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
function encodeJpeg(stream, options = {}) {
  const quality = options.quality ?? DEFAULT_QUALITY;
  const infoPromise = stream.info.then((info) => ({
    width: info.width,
    height: info.height,
    mimeType: "image/jpeg",
    originalFormat: info.originalFormat
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
async function* runJpegTransform(source, info, options, infoDeferred, stats) {
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
    const resizeBytes = (resizeState.bufferA?.byteLength ?? 0) + (resizeState.bufferB?.byteLength ?? 0);
    const codecBytes = decoder.getBufferedInputSize() + decoder.getRowBufferSize() + encoder.getBufferedOutputSize() + encoder.getRowBufferSize();
    const pipelineBytes = codecBytes + resizeBytes;
    stats.update(decoder.getBufferedInputSize(), encoder.getBufferedOutputSize(), codecBytes, pipelineBytes);
  };
  try {
    if (source.kind === "bytes") {
      const bytes = await collectSourceBytes(source);
      stats.addBytesIn(bytes.byteLength);
      refresh();
      if (orientationSegment) {
        stats.note(`jpeg-orientation=${orientation}`);
      }
      decoder.init(asArrayBuffer(bytes));
      const output = decoder.setScale(scale);
      decodeWidth = output.width;
      decodeHeight = output.height;
      resizeState = createResizeState(output.width, output.height, target.width, target.height);
      encoder.init(target.width, target.height, options.quality ?? DEFAULT_QUALITY);
      encoder.start();
      decoder.start();
      headerReady = true;
      started = true;
      infoDeferred.resolve({
        width: target.width,
        height: target.height,
        mimeType: "image/jpeg",
        originalFormat: "jpeg"
      });
      stats.note(`jpeg-dct-scale=1/${scale}`);
      stats.note(`jpeg-decoded=${decodeWidth}x${decodeHeight}`);
      refresh();
      while (true) {
        const scanline = decoder.readScanline();
        if (!scanline) {
          break;
        }
        const outputScanlines = processScanline(resizeState, scanline.data, scanline.y);
        refresh();
        for (const outScanline of outputScanlines) {
          encoder.writeScanline(outScanline);
          refresh();
          for (const jpegChunk of encoder.drainChunks()) {
            const nextChunk = !emittedFirstChunk && orientationSegment ? injectJpegApp1Segment(jpegChunk, orientationSegment) : jpegChunk;
            emittedFirstChunk = true;
            stats.addBytesOut(nextChunk.byteLength);
            refresh();
            yield nextChunk;
          }
        }
      }
      if (decoder.finishStep() !== "ready") {
        throw new Error("Unexpected end of JPEG input while finishing");
      }
      for (const outScanline of flushResize(resizeState)) {
        encoder.writeScanline(outScanline);
        refresh();
        for (const jpegChunk of encoder.drainChunks()) {
          const nextChunk = !emittedFirstChunk && orientationSegment ? injectJpegApp1Segment(jpegChunk, orientationSegment) : jpegChunk;
          emittedFirstChunk = true;
          stats.addBytesOut(nextChunk.byteLength);
          refresh();
          yield nextChunk;
        }
      }
      for (const jpegChunk of encoder.finish()) {
        const nextChunk = !emittedFirstChunk && orientationSegment ? injectJpegApp1Segment(jpegChunk, orientationSegment) : jpegChunk;
        emittedFirstChunk = true;
        stats.addBytesOut(nextChunk.byteLength);
        refresh();
        yield nextChunk;
      }
      return;
    }
    if (orientationSegment) {
      stats.note(`jpeg-orientation=${orientation}`);
    }
    for await (const { chunk, isFinal } of iterateInputChunks(source)) {
      stats.addBytesIn(chunk.byteLength);
      decoder.pushInput(chunk, isFinal);
      refresh();
      if (!headerReady) {
        const headerStep = decoder.readHeaderStep();
        if (headerStep === "needMore") {
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
          mimeType: "image/jpeg",
          originalFormat: "jpeg"
        });
        stats.note(`jpeg-dct-scale=1/${scale}`);
        stats.note(`jpeg-decoded=${decodeWidth}x${decodeHeight}`);
        refresh();
      }
      if (!started) {
        const startStep = decoder.startStep();
        if (startStep === "needMore") {
          continue;
        }
        started = true;
        refresh();
      }
      while (true) {
        const scanline = decoder.readScanlineStep();
        if (scanline === "needMore") {
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
            const nextChunk = !emittedFirstChunk && orientationSegment ? injectJpegApp1Segment(jpegChunk, orientationSegment) : jpegChunk;
            emittedFirstChunk = true;
            stats.addBytesOut(nextChunk.byteLength);
            refresh();
            yield nextChunk;
          }
        }
      }
    }
    if (decoder.finishStep() !== "ready") {
      throw new Error("Unexpected end of JPEG input while finishing");
    }
    for (const outScanline of flushResize(resizeState)) {
      encoder.writeScanline(outScanline);
      refresh();
      for (const jpegChunk of encoder.drainChunks()) {
        const nextChunk = !emittedFirstChunk && orientationSegment ? injectJpegApp1Segment(jpegChunk, orientationSegment) : jpegChunk;
        emittedFirstChunk = true;
        stats.addBytesOut(nextChunk.byteLength);
        refresh();
        yield nextChunk;
      }
    }
    for (const jpegChunk of encoder.finish()) {
      const nextChunk = !emittedFirstChunk && orientationSegment ? injectJpegApp1Segment(jpegChunk, orientationSegment) : jpegChunk;
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
async function* runBufferedTransform(source, info, options, infoDeferred, stats) {
  const bytes = await collectSourceBytes(source);
  stats.addBytesIn(bytes.byteLength);
  stats.update(bytes.byteLength, 0, bytes.byteLength, bytes.byteLength);
  stats.note(`${info.format}-input-buffered`);
  await loadWasm();
  const target = normalizeBox(options, info.width, info.height);
  const encoder = new WasmJpegEncoder();
  let scanlines;
  if (info.format === "png") {
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
    mimeType: "image/jpeg",
    originalFormat: info.format
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
function transform(input, options = {}) {
  const infoDeferred = createDeferred();
  const statsDeferred = createDeferred();
  const iteratorFactory = () => (async function* transformIterator() {
    const prepared = await prepareInputSource(input);
    const info = await inspectSource(prepared);
    if (info.format === "unknown") {
      throw new Error("Unsupported image format");
    }
    const stats = new StatsTracker(
      prepared.kind === "stream" ? "streaming-input" : "byte-input"
    );
    try {
      if (info.format === "jpeg") {
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
async function ready(options = {}) {
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
async function collect(image) {
  const chunks = [];
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
    stats: await image.stats
  };
}
function toReadableStream(image) {
  const iterator = image[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      if (typeof iterator.return === "function") {
        await iterator.return(reason);
      }
    }
  });
}
function toResponse(image, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "image/jpeg");
  return new Response(toReadableStream(image), {
    ...init,
    headers
  });
}

export { collect, decode, encodeJpeg, inspect, ready, resize, toReadableStream, toResponse, transform };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map