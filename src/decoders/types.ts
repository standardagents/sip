import type { ImageFormat, Scanline } from '../types';

/**
 * Decoder interface for different image formats
 *
 * Decoders can operate in two modes:
 * 1. Full decode - decode entire image to pixel buffer (higher memory)
 * 2. Scanline decode - decode one row at a time (lower memory)
 *
 * Not all formats support scanline decoding efficiently.
 */
export interface Decoder {
  /**
   * The format this decoder handles
   */
  readonly format: ImageFormat;

  /**
   * Whether this decoder supports scanline-by-scanline decoding
   */
  readonly supportsScanline: boolean;

  /**
   * Whether this decoder supports scaled DCT decoding (JPEG only)
   */
  readonly supportsScaledDecode: boolean;

  /**
   * Initialize decoder with image data
   * Returns dimensions and other metadata
   */
  init(data: ArrayBuffer): Promise<{
    width: number;
    height: number;
    hasAlpha: boolean;
  }>;

  /**
   * Decode entire image to RGB pixel buffer
   * Returns flat Uint8Array of RGB values (width * height * 3 bytes)
   *
   * @param scaleFactor - For JPEG, decode at 1/scaleFactor size (1, 2, 4, or 8)
   */
  decode(scaleFactor?: number): Promise<{
    pixels: Uint8Array;
    width: number;
    height: number;
  }>;

  /**
   * Start scanline decoding (only if supportsScanline is true)
   *
   * @param scaleFactor - For JPEG, decode at 1/scaleFactor size
   */
  startScanline?(scaleFactor?: number): Promise<{
    width: number;
    height: number;
  }>;

  /**
   * Get next scanline (only if supportsScanline is true)
   * Returns null when all scanlines have been read
   */
  nextScanline?(): Promise<Scanline | null>;

  /**
   * Clean up decoder resources
   */
  dispose(): void;
}

/**
 * Encoder interface for JPEG output
 */
export interface Encoder {
  /**
   * Initialize encoder with output dimensions and quality
   */
  init(width: number, height: number, quality: number): Promise<void>;

  /**
   * Whether this encoder supports scanline-by-scanline encoding
   */
  readonly supportsScanline: boolean;

  /**
   * Encode entire RGB pixel buffer to JPEG
   */
  encode(pixels: Uint8Array): Promise<ArrayBuffer>;

  /**
   * Start scanline encoding (only if supportsScanline is true)
   */
  startScanline?(): Promise<void>;

  /**
   * Write a scanline (only if supportsScanline is true)
   */
  writeScanline?(scanline: Uint8Array): Promise<void>;

  /**
   * Finish encoding and get output (only if supportsScanline is true)
   */
  finish?(): Promise<ArrayBuffer>;

  /**
   * Clean up encoder resources
   */
  dispose(): void;
}

/**
 * Factory function type for creating decoders
 */
export type DecoderFactory = (data: ArrayBuffer) => Promise<Decoder>;

/**
 * Factory function type for creating encoders
 */
export type EncoderFactory = () => Promise<Encoder>;
