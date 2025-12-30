import { describe, it, expect } from 'vitest';
import { probe, detectImageFormat } from './probe';

describe('Image Probe', () => {
  describe('detectImageFormat', () => {
    it('detects JPEG from magic bytes', () => {
      // JPEG starts with FF D8 FF - needs at least 12 bytes
      const jpeg = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      expect(detectImageFormat(jpeg)).toBe('jpeg');
    });

    it('detects PNG from magic bytes', () => {
      // PNG starts with 89 50 4E 47 0D 0A 1A 0A - needs at least 12 bytes
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      expect(detectImageFormat(png)).toBe('png');
    });

    it('detects WebP from magic bytes', () => {
      // WebP: RIFF....WEBP - needs at least 12 bytes
      const webp = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // file size (placeholder)
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      expect(detectImageFormat(webp)).toBe('webp');
    });

    it('detects AVIF from magic bytes', () => {
      // AVIF: ftypavif or ftypavis - needs at least 12 bytes
      const avif = new Uint8Array([
        0x00, 0x00, 0x00, 0x1c, // size
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x61, 0x76, 0x69, 0x66, // avif
      ]);
      expect(detectImageFormat(avif)).toBe('avif');
    });

    it('returns unknown for unrecognized formats', () => {
      const unknown = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      expect(detectImageFormat(unknown)).toBe('unknown');
    });

    it('returns unknown for data shorter than 12 bytes', () => {
      const short = new Uint8Array([0xff, 0xd8, 0xff]);
      expect(detectImageFormat(short)).toBe('unknown');
    });
  });

  describe('probe', () => {
    it('extracts JPEG dimensions from SOF marker', () => {
      // Minimal JPEG with SOF0 marker containing 100x50 dimensions
      const jpeg = createMinimalJpeg(100, 50);
      const result = probe(jpeg);

      expect(result.format).toBe('jpeg');
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
      expect(result.hasAlpha).toBe(false);
    });

    it('extracts PNG dimensions from IHDR', () => {
      // Minimal PNG with IHDR containing 200x100 dimensions
      const png = createMinimalPng(200, 100);
      const result = probe(png);

      expect(result.format).toBe('png');
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });
  });
});

// Helper to create minimal JPEG with specific dimensions
function createMinimalJpeg(width: number, height: number): Uint8Array {
  const bytes: number[] = [
    // SOI marker
    0xff, 0xd8,
    // APP0 JFIF header
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, // JFIF\0
    0x01, 0x01, // version
    0x00, // units
    0x00, 0x01, // X density
    0x00, 0x01, // Y density
    0x00, 0x00, // thumbnail
    // SOF0 marker (baseline DCT)
    0xff, 0xc0, 0x00, 0x0b,
    0x08, // precision
    (height >> 8) & 0xff, height & 0xff, // height (big endian)
    (width >> 8) & 0xff, width & 0xff, // width (big endian)
    0x01, // components
    0x01, 0x11, 0x00, // component data
    // EOI marker
    0xff, 0xd9,
  ];
  return new Uint8Array(bytes);
}

// Helper to create minimal PNG with specific dimensions
function createMinimalPng(width: number, height: number): Uint8Array {
  const bytes: number[] = [
    // PNG signature
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR chunk
    0x00, 0x00, 0x00, 0x0d, // chunk length (13)
    0x49, 0x48, 0x44, 0x52, // IHDR
    // width (big endian)
    (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff,
    // height (big endian)
    (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff,
    0x08, // bit depth
    0x02, // color type (RGB)
    0x00, // compression
    0x00, // filter
    0x00, // interlace
    0x00, 0x00, 0x00, 0x00, // CRC (placeholder)
  ];
  return new Uint8Array(bytes);
}
