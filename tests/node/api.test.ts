import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { collect, inspect, ready, toReadableStream, transform } from '../../src';
import { probe } from '../../src/probe';

const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');

let largeJpeg: Uint8Array;
let colorBaselineJpeg: Uint8Array;
let colorProgressiveJpeg: Uint8Array;
let colorRestartJpeg: Uint8Array;
let colorExtraneousJpeg: Uint8Array;
let samplePng: Uint8Array;
let sampleWebp: Uint8Array;
let sampleAvif: Uint8Array;

function buildExifOrientationSegment(orientation: number): Uint8Array {
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

function injectOrientation(bytes: Uint8Array, orientation: number): Uint8Array {
  const segment = buildExifOrientationSegment(orientation);
  const merged = new Uint8Array(bytes.byteLength + segment.byteLength);
  merged.set(bytes.subarray(0, 2), 0);
  merged.set(segment, 2);
  merged.set(bytes.subarray(2), 2 + segment.byteLength);
  return merged;
}

function readJpegOrientation(bytes: Uint8Array): number | null {
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
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    const segmentStart = offset + 2;
    if (
      marker === 0xe1 &&
      bytes[segmentStart] === 0x45 &&
      bytes[segmentStart + 1] === 0x78 &&
      bytes[segmentStart + 2] === 0x69 &&
      bytes[segmentStart + 3] === 0x66
    ) {
      const tiff = segmentStart + 6;
      const read16 = (index: number) => bytes[index] | (bytes[index + 1] << 8);
      const read32 = (index: number) => (
        (bytes[index] |
        (bytes[index + 1] << 8) |
        (bytes[index + 2] << 16) |
        (bytes[index + 3] << 24)) >>> 0
      );
      const ifd = tiff + read32(tiff + 4);
      const entries = read16(ifd);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + (i * 12);
        if (read16(entry) === 0x0112) {
          return read16(entry + 8);
        }
      }
    }
    offset += segmentLength;
  }
  return null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function chunkStream(bytes: Uint8Array, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        controller.enqueue(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)));
      }
      controller.close();
    },
  });
}

beforeAll(async () => {
  [
    largeJpeg,
    colorBaselineJpeg,
    colorProgressiveJpeg,
    colorRestartJpeg,
    colorExtraneousJpeg,
    samplePng,
    sampleWebp,
    sampleAvif,
  ] = await Promise.all([
    readFile(join(FIXTURES, 'large.jpg')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'color-baseline.jpg')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'color-progressive.jpg')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'color-restart.jpg')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'color-extraneous.jpg')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'sample.png')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'sample.webp')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
    readFile(join(FIXTURES, 'sample.avif')).then((buffer) => new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))),
  ]);

  const builtWasmLoaderPath = join(ROOT, 'dist', 'sip.js');
  const builtWasmBinaryPath = join(ROOT, 'dist', 'sip.wasm');

  if (existsSync(builtWasmLoaderPath)) {
    (globalThis as typeof globalThis & {
      __SIP_WASM_LOADER__?: () => Promise<unknown>;
    }).__SIP_WASM_LOADER__ = async () => {
      const { default: createSipModule } = await import(pathToFileURL(builtWasmLoaderPath).href);
      const wasmBinary = await readFile(builtWasmBinaryPath);
      return createSipModule({ wasmBinary });
    };
  }

  await ready();
});

describe('new API surface', () => {
  it('inspects each supported format', async () => {
    const jpeg = await inspect(toArrayBuffer(largeJpeg));
    const png = await inspect(toArrayBuffer(samplePng));
    const webp = await inspect(toArrayBuffer(sampleWebp));
    const avif = await inspect(toArrayBuffer(sampleAvif));

    expect(jpeg.info.format).toBe('jpeg');
    expect(png.info.format).toBe('png');
    expect(webp.info.format).toBe('webp');
    expect(avif.info.format).toBe('avif');
  });

  it('transforms a large JPEG from a chunked stream with bounded buffered input', async () => {
    const streamed = await collect(
      transform(chunkStream(largeJpeg), {
        width: 1024,
        height: 1024,
        quality: 80,
      })
    );
    const buffered = await collect(
      transform(toArrayBuffer(largeJpeg), {
        width: 1024,
        height: 1024,
        quality: 80,
      })
    );

    expect(streamed.info.originalFormat).toBe('jpeg');
    expect(streamed.info.width).toBe(1024);
    expect(streamed.info.height).toBe(809);
    expect(streamed.stats.peakBufferedInputBytes).toBeLessThanOrEqual(64 * 1024);
    expect(streamed.stats.bytesOut).toBe(streamed.data.byteLength);
    expect(Buffer.from(streamed.data)).toEqual(Buffer.from(buffered.data));

    const outputProbe = probe(streamed.data);
    expect(outputProbe.format).toBe('jpeg');
    expect(outputProbe.width).toBe(1024);
    expect(outputProbe.height).toBe(809);
  });

  it('matches buffered output for representative streamed JPEG variants', async () => {
    const cases = [
      ['baseline', colorBaselineJpeg],
      ['progressive', colorProgressiveJpeg],
      ['restart', colorRestartJpeg],
      ['extraneous', colorExtraneousJpeg],
    ] as const;

    for (const [label, bytes] of cases) {
      const streamed = await collect(
        transform(chunkStream(bytes), {
          width: 1024,
          height: 1024,
          quality: 82,
        })
      );
      const buffered = await collect(
        transform(toArrayBuffer(bytes), {
          width: 1024,
          height: 1024,
          quality: 82,
        })
      );

      expect(Buffer.from(streamed.data), `${label} streamed JPEG should match buffered output`)
        .toEqual(Buffer.from(buffered.data));
      expect(streamed.stats.peakBufferedInputBytes, `${label} should keep buffered compressed input bounded`)
        .toBeLessThanOrEqual(64 * 1024);
      expect(streamed.stats.peakPipelineBytes, `${label} should keep JPEG pipeline memory low`)
        .toBeLessThan(256 * 1024);
    }
  });

  it('preserves jpeg exif orientation in the output', async () => {
    const oriented = injectOrientation(largeJpeg, 6);
    const result = await collect(
      transform(oriented.buffer.slice(oriented.byteOffset, oriented.byteOffset + oriented.byteLength), {
        width: 1024,
        height: 1024,
        quality: 80,
      })
    );

    expect(readJpegOrientation(new Uint8Array(result.data))).toBe(6);
    expect(result.stats.notes).toContain('jpeg-orientation=6');
  });

  it('transforms PNG, WebP, and AVIF samples to JPEG', async () => {
    const png = await collect(transform(toArrayBuffer(samplePng), { width: 800, height: 800, quality: 85 }));
    const webp = await collect(transform(toArrayBuffer(sampleWebp), { width: 800, height: 800, quality: 85 }));
    const avif = await collect(transform(toArrayBuffer(sampleAvif), { width: 800, height: 800, quality: 85 }));

    for (const result of [png, webp, avif]) {
      const outputProbe = probe(result.data);
      expect(outputProbe.format).toBe('jpeg');
      expect(result.data.byteLength).toBeGreaterThan(0);
      expect(result.stats.bytesIn).toBeGreaterThan(0);
      expect(result.stats.bytesOut).toBe(result.data.byteLength);
    }

    expect(png.info.originalFormat).toBe('png');
    expect(webp.info.originalFormat).toBe('webp');
    expect(avif.info.originalFormat).toBe('avif');
  });

  it('exposes a readable stream helper', async () => {
    const image = transform(toArrayBuffer(samplePng), { width: 320, height: 320, quality: 80 });
    const readable = toReadableStream(image);
    const reader = readable.getReader();
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
    }

    expect(total).toBeGreaterThan(0);
  });
});
