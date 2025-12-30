import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadWasm, isWasmAvailable, getWasmModule } from './loader';

describe('WASM Loader', () => {
  describe('isWasmAvailable', () => {
    it('returns false before loading', () => {
      // Fresh state - no module loaded
      expect(isWasmAvailable()).toBe(false);
    });
  });

  describe('getWasmModule', () => {
    it('throws when module not loaded', () => {
      expect(() => getWasmModule()).toThrow('WASM module not loaded');
    });
  });

  describe('loadWasm', () => {
    it('throws helpful error when WASM not available', async () => {
      // Without the actual WASM built, this should throw an error
      await expect(loadWasm()).rejects.toThrow('SIP WASM module not available');
    });
  });
});
