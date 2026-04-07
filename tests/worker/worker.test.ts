import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

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

async function postFixture(path: string, contentType: string, options: {
  width?: number;
  height?: number;
  quality?: number;
  stream?: boolean;
}) {
  const response = await SELF.fetch(`https://example.com/${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const url = new URL(options.stream ? 'https://example.com/stream' : 'https://example.com/transform');

  if (options.width) url.searchParams.set('width', String(options.width));
  if (options.height) url.searchParams.set('height', String(options.height));
  if (options.quality) url.searchParams.set('quality', String(options.quality));

  return SELF.fetch(
    new Request(url, {
      method: 'POST',
      headers: {
        'content-type': contentType,
      },
      body: path.endsWith('.jpg') ? chunkStream(bytes) : bytes,
    })
  );
}

describe('worker integration', () => {
  it('processes a chunked JPEG request body in the worker', async () => {
    const response = await postFixture('large.jpg', 'image/jpeg', {
      width: 1024,
      height: 1024,
      quality: 80,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('x-original-format')).toBe('jpeg');
    expect(Number(response.headers.get('x-output-width'))).toBe(1024);
    expect(Number(response.headers.get('x-peak-buffered-input-bytes'))).toBeGreaterThan(0);

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it('processes representative color JPEG variants in the worker', async () => {
    const cases = [
      'color-baseline.jpg',
      'color-progressive.jpg',
      'color-restart.jpg',
      'color-extraneous.jpg',
    ];

    for (const path of cases) {
      const response = await postFixture(path, 'image/jpeg', {
        width: 1024,
        height: 1024,
        quality: 82,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      expect(Number(response.headers.get('x-peak-buffered-input-bytes'))).toBeLessThanOrEqual(64 * 1024);
      expect(Number(response.headers.get('x-peak-pipeline-bytes'))).toBeLessThan(256 * 1024);

      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(bytes.byteLength).toBeGreaterThan(0);
    }
  });

  it('preserves exif orientation in worker jpeg output', async () => {
    const fixture = await SELF.fetch('https://example.com/large.jpg');
    const bytes = new Uint8Array(await fixture.arrayBuffer());
    const oriented = injectOrientation(bytes, 6);

    const response = await SELF.fetch(new Request('https://example.com/transform?width=1024&height=1024&quality=80', {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
      },
      body: chunkStream(oriented),
    }));

    expect(response.status).toBe(200);
    const output = new Uint8Array(await response.arrayBuffer());
    expect(readJpegOrientation(output)).toBe(6);
  });

  it('processes PNG, WebP, and AVIF bodies in the worker', async () => {
    const png = await postFixture('sample.png', 'image/png', { width: 800, height: 800, quality: 85 });
    const webp = await postFixture('sample.webp', 'image/webp', { width: 800, height: 800, quality: 85 });
    const avif = await postFixture('sample.avif', 'image/avif', { width: 800, height: 800, quality: 85 });

    for (const response of [png, webp, avif]) {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      expect(Number(response.headers.get('x-bytes-out'))).toBeGreaterThan(0);
      expect((response.headers.get('x-notes') ?? '').length).toBeGreaterThan(0);
    }
  });

  it('supports the streaming response helper in the worker', async () => {
    const response = await postFixture('large.jpg', 'image/jpeg', {
      width: 512,
      height: 512,
      quality: 80,
      stream: true,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('x-test-mode')).toBe('stream');

    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
