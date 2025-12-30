/**
 * Integration tests for @standardagents/sip
 *
 * These tests process real images through the full pipeline
 * and verify the results are valid.
 *
 * Note: JPEG and PNG processing tests require the native WASM module to be built.
 * Run `pnpm build:wasm` before running these tests for full coverage.
 * WebP and AVIF tests use @jsquash decoders and work without native WASM.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { probe, sip, initStreaming } from '../src';

const FIXTURES_DIR = join(__dirname, 'fixtures');

// Test image buffers loaded once
let largeJpeg: ArrayBuffer;
let samplePng: ArrayBuffer;
let sampleWebp: ArrayBuffer;
let sampleAvif: ArrayBuffer;

// Track if WASM is available
let wasmAvailable = false;

beforeAll(async () => {
  // Load all test images
  [largeJpeg, samplePng, sampleWebp, sampleAvif] = await Promise.all([
    readFile(join(FIXTURES_DIR, 'large.jpg')).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
    readFile(join(FIXTURES_DIR, 'sample.png')).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
    readFile(join(FIXTURES_DIR, 'sample.webp')).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
    readFile(join(FIXTURES_DIR, 'sample.avif')).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
  ]);

  // Check if WASM is available
  wasmAvailable = await initStreaming();
  if (!wasmAvailable) {
    console.log('\n⚠️  WASM module not built. JPEG/PNG processing tests will be skipped.');
    console.log('   Run `pnpm build:wasm` to enable full test coverage.\n');
  }
});

describe('Image Probe - Real Images', () => {
  it('probes large JPEG correctly', () => {
    const result = probe(largeJpeg);

    expect(result.format).toBe('jpeg');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.hasAlpha).toBe(false);

    // Verify it's actually a large image
    expect(result.width * result.height).toBeGreaterThan(1_000_000); // > 1MP

    console.log(`large.jpg: ${result.width}x${result.height} (${((result.width * result.height) / 1_000_000).toFixed(1)}MP)`);
  });

  it('probes PNG correctly', () => {
    const result = probe(samplePng);

    expect(result.format).toBe('png');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    console.log(`sample.png: ${result.width}x${result.height}, hasAlpha: ${result.hasAlpha}`);
  });

  it('probes WebP correctly', () => {
    const result = probe(sampleWebp);

    expect(result.format).toBe('webp');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    console.log(`sample.webp: ${result.width}x${result.height}, hasAlpha: ${result.hasAlpha}`);
  });

  it('probes AVIF correctly', () => {
    const result = probe(sampleAvif);

    expect(result.format).toBe('avif');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    console.log(`sample.avif: ${result.width}x${result.height}`);
  });

  it('returns correct file sizes', () => {
    // Verify buffer sizes match what we expect
    expect(largeJpeg.byteLength).toBeGreaterThan(1_000_000); // > 1MB
    expect(samplePng.byteLength).toBeGreaterThan(100_000); // > 100KB
    expect(sampleWebp.byteLength).toBeGreaterThan(10_000); // > 10KB
    expect(sampleAvif.byteLength).toBeGreaterThan(10_000); // > 10KB

    console.log(`File sizes: JPEG=${(largeJpeg.byteLength / 1024 / 1024).toFixed(2)}MB, PNG=${(samplePng.byteLength / 1024).toFixed(0)}KB, WebP=${(sampleWebp.byteLength / 1024).toFixed(0)}KB, AVIF=${(sampleAvif.byteLength / 1024).toFixed(0)}KB`);
  });
});

describe('WASM Streaming Mode', () => {
  it('checks if streaming is available', async () => {
    const available = await initStreaming();
    console.log(`WASM streaming available: ${available}`);
    expect(typeof available).toBe('boolean');
  });
});

/**
 * Full processing tests
 * JPEG and PNG require native WASM module to be built.
 * WebP and AVIF use @jsquash decoders + WASM encoder.
 */
describe('Image Processing - Full Pipeline', () => {
  it('processes large JPEG and outputs smaller JPEG', async () => {
    if (!wasmAvailable) {
      console.log('Skipping JPEG test - WASM not available');
      return;
    }

    const inputInfo = probe(largeJpeg);
    console.log(`Input: ${inputInfo.width}x${inputInfo.height}, ${(largeJpeg.byteLength / 1024 / 1024).toFixed(2)}MB`);

    const result = await sip.process(largeJpeg, {
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 80,
    });

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBeLessThanOrEqual(1024);
    expect(result.height).toBeLessThanOrEqual(1024);
    expect(result.data.byteLength).toBeGreaterThan(0);
    expect(result.data.byteLength).toBeLessThan(largeJpeg.byteLength);

    // Verify aspect ratio is preserved
    const inputAspect = inputInfo.width / inputInfo.height;
    const outputAspect = result.width / result.height;
    expect(outputAspect).toBeCloseTo(inputAspect, 1);

    // Verify output is valid JPEG
    const outputInfo = probe(result.data);
    expect(outputInfo.format).toBe('jpeg');
    expect(outputInfo.width).toBe(result.width);
    expect(outputInfo.height).toBe(result.height);

    console.log(`Output: ${result.width}x${result.height}, ${(result.data.byteLength / 1024).toFixed(2)}KB`);
  });

  it('processes PNG to JPEG', async () => {
    if (!wasmAvailable) {
      console.log('Skipping PNG test - WASM not available');
      return;
    }

    const inputInfo = probe(samplePng);
    console.log(`Input PNG: ${inputInfo.width}x${inputInfo.height}`);

    const result = await sip.process(samplePng, {
      maxWidth: 800,
      maxHeight: 800,
      quality: 85,
    });

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.originalFormat).toBe('png');
    expect(result.width).toBeLessThanOrEqual(800);
    expect(result.height).toBeLessThanOrEqual(800);

    const outputInfo = probe(result.data);
    expect(outputInfo.format).toBe('jpeg');

    console.log(`Output: ${result.width}x${result.height}, ${(result.data.byteLength / 1024).toFixed(2)}KB`);
  });

  it('processes WebP to JPEG', async () => {
    if (!wasmAvailable) {
      console.log('Skipping WebP test - WASM not available (needed for encoder)');
      return;
    }

    const inputInfo = probe(sampleWebp);
    console.log(`Input WebP: ${inputInfo.width}x${inputInfo.height}`);

    const result = await sip.process(sampleWebp, {
      maxWidth: 800,
      maxHeight: 800,
      quality: 85,
    });

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.originalFormat).toBe('webp');

    const outputInfo = probe(result.data);
    expect(outputInfo.format).toBe('jpeg');

    console.log(`Output: ${result.width}x${result.height}, ${(result.data.byteLength / 1024).toFixed(2)}KB`);
  });

  it('respects maxBytes constraint', async () => {
    if (!wasmAvailable) {
      console.log('Skipping maxBytes test - WASM not available');
      return;
    }

    const maxBytes = 100 * 1024; // 100KB target

    const result = await sip.process(largeJpeg, {
      maxWidth: 2048,
      maxHeight: 2048,
      maxBytes,
      quality: 85,
    });

    // Output should be at or under maxBytes (allow some tolerance)
    expect(result.data.byteLength).toBeLessThan(maxBytes * 1.5);

    console.log(`Target: ${maxBytes / 1024}KB, Actual: ${(result.data.byteLength / 1024).toFixed(2)}KB`);
  });
});

describe('Memory Efficiency', () => {
  it('measures memory usage while processing 102MP image', async () => {
    if (!wasmAvailable) {
      console.log('Skipping memory test - WASM not available');
      return;
    }

    const inputInfo = probe(largeJpeg);
    const megapixels = (inputInfo.width * inputInfo.height) / 1_000_000;

    console.log(`\n=== Memory Test: ${megapixels.toFixed(1)}MP Image ===`);
    console.log(`Input: ${inputInfo.width}x${inputInfo.height} (${(largeJpeg.byteLength / 1024 / 1024).toFixed(2)}MB file)`);

    // Force GC if available
    if (global.gc) {
      global.gc();
    }

    const memBefore = process.memoryUsage();
    console.log(`Memory before: ${(memBefore.heapUsed / 1024 / 1024).toFixed(2)}MB heap`);

    // Process the image
    const startTime = Date.now();
    const result = await sip.process(largeJpeg, {
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 85,
    });
    const duration = Date.now() - startTime;

    const memAfter = process.memoryUsage();
    const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

    console.log(`Memory after: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB heap`);
    console.log(`Heap delta: ${heapDelta.toFixed(2)}MB`);
    console.log(`Peak RSS: ${(memAfter.rss / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Output: ${result.width}x${result.height} (${(result.data.byteLength / 1024).toFixed(2)}KB)`);

    // The full uncompressed image would be: 11375 * 8992 * 3 bytes = ~306MB
    // With scanline processing, we should use much less
    const fullImageSize = inputInfo.width * inputInfo.height * 3;
    console.log(`Full uncompressed would be: ${(fullImageSize / 1024 / 1024).toFixed(2)}MB`);

    // Verify the output is valid
    expect(result.data.byteLength).toBeGreaterThan(0);
    const outputInfo = probe(result.data);
    expect(outputInfo.format).toBe('jpeg');

    console.log('=== Memory Test Complete ===\n');
  });
});

describe('Probe Edge Cases', () => {
  it('handles corrupt/invalid data gracefully', () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    const result = probe(garbage);

    expect(result.format).toBe('unknown');
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('handles empty buffer', () => {
    const empty = new Uint8Array(0);
    const result = probe(empty);

    expect(result.format).toBe('unknown');
  });

  it('handles truncated JPEG header', () => {
    // JPEG magic bytes with APP0 marker but no SOF
    // When dimensions can't be parsed, probe returns 'unknown' format
    // This is intentional - we can't process a file without knowing dimensions
    const truncated = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // More APP0 data, no SOF
    ]);
    const result = probe(truncated);

    // Without valid dimensions, we return 'unknown'
    expect(result.format).toBe('unknown');
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});
