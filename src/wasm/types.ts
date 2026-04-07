/**
 * TypeScript types for SIP WASM module
 */

/**
 * Emscripten module interface
 */
export interface SipWasmModule {
  // Memory access
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;

  // Decoder functions
  _sip_decoder_create(): number;
  _sip_decoder_push_input(dec: number, data: number, size: number, isFinal: number): number;
  _sip_decoder_set_source(dec: number, data: number, size: number): number;
  _sip_decoder_read_header(dec: number): number;
  _sip_decoder_get_width(dec: number): number;
  _sip_decoder_get_height(dec: number): number;
  _sip_decoder_set_scale(dec: number, scale_denom: number): number;
  _sip_decoder_get_output_width(dec: number): number;
  _sip_decoder_get_output_height(dec: number): number;
  _sip_decoder_start(dec: number): number;
  _sip_decoder_get_row_buffer(dec: number): number;
  _sip_decoder_read_scanline(dec: number): number;
  _sip_decoder_get_scanline(dec: number): number;
  _sip_decoder_finish(dec: number): number;
  _sip_decoder_get_buffered_input_size(dec: number): number;
  _sip_decoder_get_working_size(dec: number): number;
  _sip_decoder_destroy(dec: number): void;

  // Encoder functions
  _sip_encoder_create(): number;
  _sip_encoder_init(enc: number, width: number, height: number, quality: number): number;
  _sip_encoder_start(enc: number): number;
  _sip_encoder_get_row_buffer(enc: number): number;
  _sip_encoder_write_scanline(enc: number): number;
  _sip_encoder_write_scanline_from(enc: number, data: number): number;
  _sip_encoder_get_scanline(enc: number): number;
  _sip_encoder_finish(enc: number): number;
  _sip_encoder_get_output(enc: number): number;
  _sip_encoder_get_output_size(enc: number): number;
  _sip_encoder_peek_chunk_data(enc: number): number;
  _sip_encoder_peek_chunk_size(enc: number): number;
  _sip_encoder_pop_chunk(enc: number): number;
  _sip_encoder_get_buffered_output_size(enc: number): number;
  _sip_encoder_destroy(enc: number): void;

  // PNG Decoder functions
  _sip_png_decoder_create(): number;
  _sip_png_decoder_set_source(dec: number, data: number, size: number): number;
  _sip_png_decoder_read_header(dec: number): number;
  _sip_png_decoder_get_width(dec: number): number;
  _sip_png_decoder_get_height(dec: number): number;
  _sip_png_decoder_has_alpha(dec: number): number;
  _sip_png_decoder_start(dec: number): number;
  _sip_png_decoder_get_row_buffer(dec: number): number;
  _sip_png_decoder_read_row(dec: number): number;
  _sip_png_decoder_get_row(dec: number): number;
  _sip_png_decoder_finish(dec: number): number;
  _sip_png_decoder_destroy(dec: number): void;

  // Utility functions
  _sip_get_error(): number;
  _sip_malloc(size: number): number;
  _sip_free(ptr: number): void;

  // Emscripten helpers
  UTF8ToString(ptr: number): string;
}

/**
 * Valid DCT scale denominators
 */
export type DctScaleDenom = 1 | 2 | 4 | 8;
