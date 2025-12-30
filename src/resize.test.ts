import { describe, it, expect } from 'vitest';
import {
  calculateTargetDimensions,
  calculateDctScaleFactor,
  createResizeState,
  processScanline,
  flushResize,
} from './resize';

describe('Resize Functions', () => {
  describe('calculateTargetDimensions', () => {
    it('returns original dimensions if within limits', () => {
      const result = calculateTargetDimensions(800, 600, 1920, 1080);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.scale).toBe(1);
    });

    it('scales down width-constrained images', () => {
      const result = calculateTargetDimensions(4000, 2000, 2000, 2000);
      expect(result.width).toBe(2000);
      expect(result.height).toBe(1000);
      expect(result.scale).toBe(0.5);
    });

    it('scales down height-constrained images', () => {
      const result = calculateTargetDimensions(2000, 4000, 2000, 2000);
      expect(result.width).toBe(1000);
      expect(result.height).toBe(2000);
      expect(result.scale).toBe(0.5);
    });

    it('handles square images', () => {
      const result = calculateTargetDimensions(3000, 3000, 2000, 2000);
      expect(result.width).toBe(2000);
      expect(result.height).toBe(2000);
      expect(result.scale).toBeCloseTo(2 / 3);
    });

    it('maintains aspect ratio', () => {
      const result = calculateTargetDimensions(1920, 1080, 960, 540);
      expect(result.width / result.height).toBeCloseTo(1920 / 1080, 1);
    });

    it('never upscales images', () => {
      const result = calculateTargetDimensions(500, 300, 1000, 1000);
      expect(result.width).toBe(500);
      expect(result.height).toBe(300);
      expect(result.scale).toBe(1);
    });
  });

  describe('calculateDctScaleFactor', () => {
    // calculateDctScaleFactor(srcWidth, srcHeight, targetWidth, targetHeight)
    // Returns the largest scale that still results in >= target dimensions

    it('returns 1 for small downscale', () => {
      // 1000 -> 800, ratio 0.8, needs at least 800px, so 1000/1 = 1000 >= 800
      expect(calculateDctScaleFactor(1000, 1000, 800, 800)).toBe(1);
    });

    it('returns 2 when 1/2 scale is sufficient', () => {
      // 2000 -> 800, 2000/2 = 1000 >= 800, 2000/4 = 500 < 800
      expect(calculateDctScaleFactor(2000, 2000, 800, 800)).toBe(2);
    });

    it('returns 4 when 1/4 scale is sufficient', () => {
      // 4000 -> 800, 4000/4 = 1000 >= 800, 4000/8 = 500 < 800
      expect(calculateDctScaleFactor(4000, 4000, 800, 800)).toBe(4);
    });

    it('returns 8 for large downscale', () => {
      // 8000 -> 800, 8000/8 = 1000 >= 800
      expect(calculateDctScaleFactor(8000, 8000, 800, 800)).toBe(8);
    });

    it('considers both width and height constraints', () => {
      // 4000x2000 -> 800x800
      // Width: 4000/4 = 1000 >= 800 OK, 4000/8 = 500 < 800 NO
      // Height: 2000/4 = 500 < 800 NO
      // So scale 2 should be selected (2000/2 = 1000 >= 800)
      expect(calculateDctScaleFactor(4000, 2000, 800, 800)).toBe(2);
    });
  });

  describe('scanline processing', () => {
    it('creates resize state with correct dimensions', () => {
      const state = createResizeState(100, 100, 50, 50);
      expect(state.srcWidth).toBe(100);
      expect(state.srcHeight).toBe(100);
      expect(state.dstWidth).toBe(50);
      expect(state.dstHeight).toBe(50);
    });

    it('processes scanlines and produces output', () => {
      const state = createResizeState(10, 10, 5, 5);

      // Feed all source scanlines
      const allOutputs: Uint8Array[] = [];
      for (let y = 0; y < 10; y++) {
        // Create a simple gradient row (RGB)
        const row = new Uint8Array(10 * 3);
        for (let x = 0; x < 10; x++) {
          row[x * 3] = y * 25; // R
          row[x * 3 + 1] = x * 25; // G
          row[x * 3 + 2] = 128; // B
        }

        const outputs = processScanline(state, row, y);
        allOutputs.push(...outputs.map((s) => s.data));
      }

      // Flush remaining
      const remaining = flushResize(state);
      allOutputs.push(...remaining.map((s) => s.data));

      // Should have 5 output rows
      expect(allOutputs.length).toBe(5);

      // Each output row should have correct width
      for (const row of allOutputs) {
        expect(row.length).toBe(5 * 3); // 5 pixels * 3 channels
      }
    });

    it('handles 1:1 resize (no scaling)', () => {
      const state = createResizeState(10, 10, 10, 10);

      const allOutputs: Uint8Array[] = [];
      for (let y = 0; y < 10; y++) {
        const row = new Uint8Array(10 * 3).fill(y * 10);
        const outputs = processScanline(state, row, y);
        allOutputs.push(...outputs.map((s) => s.data));
      }

      const remaining = flushResize(state);
      allOutputs.push(...remaining.map((s) => s.data));

      expect(allOutputs.length).toBe(10);
    });
  });
});
