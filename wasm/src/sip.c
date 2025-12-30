/**
 * SIP WASM Bindings for libjpeg-turbo and libspng
 *
 * Provides memory-efficient image processing with:
 * - Scaled DCT decoding (1/1, 1/2, 1/4, 1/8) for JPEG
 * - Row-by-row PNG decoding
 * - Scanline-by-scanline processing
 * - Streaming JPEG encoding
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <jpeglib.h>
#include <spng.h>
#include <emscripten.h>

// ============================================================================
// Decoder State
// ============================================================================

typedef struct {
    struct jpeg_decompress_struct cinfo;
    struct jpeg_error_mgr jerr;
    JSAMPROW row_buffer;
    int initialized;
    int header_read;
    int decompressing;
} SipDecoder;

// ============================================================================
// Encoder State
// ============================================================================

typedef struct {
    struct jpeg_compress_struct cinfo;
    struct jpeg_error_mgr jerr;
    unsigned char *output_buffer;
    unsigned long output_size;
    JSAMPROW row_buffer;
    int initialized;
    int compressing;
} SipEncoder;

// ============================================================================
// Error Handling
// ============================================================================

static char last_error[256] = "";

static void sip_error_exit(j_common_ptr cinfo) {
    (*cinfo->err->format_message)(cinfo, last_error);
    // Don't call exit() in WASM - return error code instead
}

EMSCRIPTEN_KEEPALIVE
const char* sip_get_error() {
    return last_error;
}

// ============================================================================
// Decoder Functions
// ============================================================================

/**
 * Create a new decoder instance
 */
EMSCRIPTEN_KEEPALIVE
SipDecoder* sip_decoder_create() {
    SipDecoder* dec = (SipDecoder*)calloc(1, sizeof(SipDecoder));
    if (!dec) return NULL;

    dec->cinfo.err = jpeg_std_error(&dec->jerr);
    dec->jerr.error_exit = sip_error_exit;

    jpeg_create_decompress(&dec->cinfo);
    dec->initialized = 1;

    return dec;
}

/**
 * Set input data for decoder
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_set_source(SipDecoder* dec, const uint8_t* data, uint32_t size) {
    if (!dec || !dec->initialized) return -1;

    jpeg_mem_src(&dec->cinfo, data, size);
    return 0;
}

/**
 * Read JPEG header and return dimensions
 * Returns: 0 on success, -1 on error
 * After success, use sip_decoder_get_width/height to get dimensions
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_read_header(SipDecoder* dec) {
    if (!dec || !dec->initialized) return -1;

    if (jpeg_read_header(&dec->cinfo, TRUE) != JPEG_HEADER_OK) {
        return -1;
    }

    dec->header_read = 1;
    return 0;
}

/**
 * Get original image width
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_width(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.image_width;
}

/**
 * Get original image height
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_height(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.image_height;
}

/**
 * Set scale factor for DCT-based scaling during decode
 * scale_denom: 1, 2, 4, or 8 (1/1, 1/2, 1/4, 1/8 scale)
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_set_scale(SipDecoder* dec, uint32_t scale_denom) {
    if (!dec || !dec->header_read) return -1;
    if (scale_denom != 1 && scale_denom != 2 && scale_denom != 4 && scale_denom != 8) {
        return -1;
    }

    dec->cinfo.scale_num = 1;
    dec->cinfo.scale_denom = scale_denom;

    // Calculate output dimensions with scaling
    jpeg_calc_output_dimensions(&dec->cinfo);

    return 0;
}

/**
 * Get scaled output width (after set_scale)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_output_width(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.output_width;
}

/**
 * Get scaled output height (after set_scale)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_output_height(SipDecoder* dec) {
    if (!dec || !dec->header_read) return 0;
    return dec->cinfo.output_height;
}

/**
 * Start decompression
 * Must be called after set_scale (or will use 1:1)
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_start(SipDecoder* dec) {
    if (!dec || !dec->header_read) return -1;

    // Force RGB output
    dec->cinfo.out_color_space = JCS_RGB;

    if (!jpeg_start_decompress(&dec->cinfo)) {
        return -1;
    }

    // Allocate row buffer
    int row_stride = dec->cinfo.output_width * dec->cinfo.output_components;
    dec->row_buffer = (JSAMPROW)malloc(row_stride);
    if (!dec->row_buffer) {
        return -1;
    }

    dec->decompressing = 1;
    return 0;
}

/**
 * Get pointer to internal row buffer
 * Buffer contains RGB data for one scanline after read_scanline
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_decoder_get_row_buffer(SipDecoder* dec) {
    if (!dec || !dec->decompressing) return NULL;
    return dec->row_buffer;
}

/**
 * Read one scanline into internal buffer
 * Returns: 1 if scanline was read, 0 if done, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_read_scanline(SipDecoder* dec) {
    if (!dec || !dec->decompressing) return -1;

    if (dec->cinfo.output_scanline >= dec->cinfo.output_height) {
        return 0; // Done
    }

    JSAMPROW rows[1] = { dec->row_buffer };
    int lines = jpeg_read_scanlines(&dec->cinfo, rows, 1);

    return lines > 0 ? 1 : 0;
}

/**
 * Get current scanline number (0-indexed)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_decoder_get_scanline(SipDecoder* dec) {
    if (!dec || !dec->decompressing) return 0;
    return dec->cinfo.output_scanline;
}

/**
 * Finish decompression and clean up
 */
EMSCRIPTEN_KEEPALIVE
int sip_decoder_finish(SipDecoder* dec) {
    if (!dec) return -1;

    if (dec->decompressing) {
        jpeg_finish_decompress(&dec->cinfo);
        dec->decompressing = 0;
    }

    if (dec->row_buffer) {
        free(dec->row_buffer);
        dec->row_buffer = NULL;
    }

    return 0;
}

/**
 * Destroy decoder and free all resources
 */
EMSCRIPTEN_KEEPALIVE
void sip_decoder_destroy(SipDecoder* dec) {
    if (!dec) return;

    sip_decoder_finish(dec);

    if (dec->initialized) {
        jpeg_destroy_decompress(&dec->cinfo);
        dec->initialized = 0;
    }

    free(dec);
}

// ============================================================================
// PNG Decoder State
// ============================================================================

typedef struct {
    spng_ctx *ctx;
    uint8_t *row_buffer;
    uint32_t width;
    uint32_t height;
    uint8_t bit_depth;
    uint8_t color_type;
    uint8_t has_alpha;
    uint32_t row_stride;
    uint32_t current_row;
    int initialized;
    int decoding;
} SipPngDecoder;

// ============================================================================
// PNG Decoder Functions
// ============================================================================

/**
 * Create a new PNG decoder instance
 */
EMSCRIPTEN_KEEPALIVE
SipPngDecoder* sip_png_decoder_create() {
    SipPngDecoder* dec = (SipPngDecoder*)calloc(1, sizeof(SipPngDecoder));
    if (!dec) return NULL;

    dec->ctx = spng_ctx_new(0);
    if (!dec->ctx) {
        free(dec);
        return NULL;
    }

    dec->initialized = 1;
    return dec;
}

/**
 * Set input data for PNG decoder
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_set_source(SipPngDecoder* dec, const uint8_t* data, uint32_t size) {
    if (!dec || !dec->initialized) return -1;

    int ret = spng_set_png_buffer(dec->ctx, data, size);
    if (ret != 0) {
        snprintf(last_error, sizeof(last_error), "spng_set_png_buffer failed: %d", ret);
        return -1;
    }

    return 0;
}

/**
 * Read PNG header and parse dimensions
 * Returns: 0 on success, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_read_header(SipPngDecoder* dec) {
    if (!dec || !dec->initialized) return -1;

    struct spng_ihdr ihdr;
    int ret = spng_get_ihdr(dec->ctx, &ihdr);
    if (ret != 0) {
        snprintf(last_error, sizeof(last_error), "spng_get_ihdr failed: %d", ret);
        return -1;
    }

    dec->width = ihdr.width;
    dec->height = ihdr.height;
    dec->bit_depth = ihdr.bit_depth;
    dec->color_type = ihdr.color_type;

    // Determine if image has alpha
    dec->has_alpha = (ihdr.color_type == SPNG_COLOR_TYPE_GRAYSCALE_ALPHA ||
                      ihdr.color_type == SPNG_COLOR_TYPE_TRUECOLOR_ALPHA);

    return 0;
}

/**
 * Get PNG image width
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_png_decoder_get_width(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->width;
}

/**
 * Get PNG image height
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_png_decoder_get_height(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->height;
}

/**
 * Check if PNG has alpha channel
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_has_alpha(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->has_alpha;
}

/**
 * Start PNG decoding (progressive row-by-row mode)
 * Output format is always RGB (3 bytes per pixel)
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_start(SipPngDecoder* dec) {
    if (!dec || !dec->initialized) return -1;

    // We decode to RGB format (SPNG_FMT_RGB8)
    int ret = spng_decode_image(dec->ctx, NULL, 0, SPNG_FMT_RGB8, SPNG_DECODE_PROGRESSIVE);
    if (ret != 0 && ret != SPNG_EOI) {
        snprintf(last_error, sizeof(last_error), "spng_decode_image init failed: %d", ret);
        return -1;
    }

    // Calculate row stride (RGB = 3 bytes per pixel)
    dec->row_stride = dec->width * 3;

    // Allocate row buffer
    dec->row_buffer = (uint8_t*)malloc(dec->row_stride);
    if (!dec->row_buffer) {
        snprintf(last_error, sizeof(last_error), "Failed to allocate row buffer");
        return -1;
    }

    dec->current_row = 0;
    dec->decoding = 1;

    return 0;
}

/**
 * Get pointer to internal row buffer
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_png_decoder_get_row_buffer(SipPngDecoder* dec) {
    if (!dec || !dec->decoding) return NULL;
    return dec->row_buffer;
}

/**
 * Read one row of PNG data into internal buffer
 * Returns: 1 if row was read, 0 if done, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_read_row(SipPngDecoder* dec) {
    if (!dec || !dec->decoding) return -1;

    if (dec->current_row >= dec->height) {
        return 0; // Done
    }

    struct spng_row_info row_info;
    int ret = spng_get_row_info(dec->ctx, &row_info);
    if (ret != 0 && ret != SPNG_EOI) {
        snprintf(last_error, sizeof(last_error), "spng_get_row_info failed: %d", ret);
        return -1;
    }

    ret = spng_decode_row(dec->ctx, dec->row_buffer, dec->row_stride);
    if (ret != 0 && ret != SPNG_EOI) {
        snprintf(last_error, sizeof(last_error), "spng_decode_row failed: %d", ret);
        return -1;
    }

    dec->current_row++;

    // Return 0 if we've read all rows
    if (dec->current_row >= dec->height || ret == SPNG_EOI) {
        return 0;
    }

    return 1;
}

/**
 * Get current row number (0-indexed)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_png_decoder_get_row(SipPngDecoder* dec) {
    if (!dec) return 0;
    return dec->current_row;
}

/**
 * Finish PNG decoding
 */
EMSCRIPTEN_KEEPALIVE
int sip_png_decoder_finish(SipPngDecoder* dec) {
    if (!dec) return -1;

    if (dec->row_buffer) {
        free(dec->row_buffer);
        dec->row_buffer = NULL;
    }

    dec->decoding = 0;
    return 0;
}

/**
 * Destroy PNG decoder and free all resources
 */
EMSCRIPTEN_KEEPALIVE
void sip_png_decoder_destroy(SipPngDecoder* dec) {
    if (!dec) return;

    sip_png_decoder_finish(dec);

    if (dec->ctx) {
        spng_ctx_free(dec->ctx);
        dec->ctx = NULL;
    }

    dec->initialized = 0;
    free(dec);
}

// ============================================================================
// Encoder Functions
// ============================================================================

/**
 * Create a new encoder instance
 */
EMSCRIPTEN_KEEPALIVE
SipEncoder* sip_encoder_create() {
    SipEncoder* enc = (SipEncoder*)calloc(1, sizeof(SipEncoder));
    if (!enc) return NULL;

    enc->cinfo.err = jpeg_std_error(&enc->jerr);
    enc->jerr.error_exit = sip_error_exit;

    jpeg_create_compress(&enc->cinfo);
    enc->initialized = 1;

    return enc;
}

/**
 * Initialize encoder with dimensions and quality
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_init(SipEncoder* enc, uint32_t width, uint32_t height, int quality) {
    if (!enc || !enc->initialized) return -1;

    // Set up memory destination
    enc->output_buffer = NULL;
    enc->output_size = 0;
    jpeg_mem_dest(&enc->cinfo, &enc->output_buffer, &enc->output_size);

    // Set image parameters
    enc->cinfo.image_width = width;
    enc->cinfo.image_height = height;
    enc->cinfo.input_components = 3;  // RGB
    enc->cinfo.in_color_space = JCS_RGB;

    jpeg_set_defaults(&enc->cinfo);
    jpeg_set_quality(&enc->cinfo, quality, TRUE);

    // Allocate row buffer
    enc->row_buffer = (JSAMPROW)malloc(width * 3);
    if (!enc->row_buffer) {
        return -1;
    }

    return 0;
}

/**
 * Start compression
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_start(SipEncoder* enc) {
    if (!enc || !enc->initialized) return -1;

    jpeg_start_compress(&enc->cinfo, TRUE);
    enc->compressing = 1;

    return 0;
}

/**
 * Get pointer to internal row buffer for writing
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_encoder_get_row_buffer(SipEncoder* enc) {
    if (!enc || !enc->compressing) return NULL;
    return enc->row_buffer;
}

/**
 * Write one scanline from internal buffer
 * Returns: number of lines written (1), or -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_write_scanline(SipEncoder* enc) {
    if (!enc || !enc->compressing) return -1;

    JSAMPROW rows[1] = { enc->row_buffer };
    return jpeg_write_scanlines(&enc->cinfo, rows, 1);
}

/**
 * Write scanline from provided buffer
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_write_scanline_from(SipEncoder* enc, const uint8_t* data) {
    if (!enc || !enc->compressing) return -1;

    JSAMPROW rows[1] = { (JSAMPROW)data };
    return jpeg_write_scanlines(&enc->cinfo, rows, 1);
}

/**
 * Get current scanline number
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_encoder_get_scanline(SipEncoder* enc) {
    if (!enc || !enc->compressing) return 0;
    return enc->cinfo.next_scanline;
}

/**
 * Finish compression
 */
EMSCRIPTEN_KEEPALIVE
int sip_encoder_finish(SipEncoder* enc) {
    if (!enc || !enc->compressing) return -1;

    jpeg_finish_compress(&enc->cinfo);
    enc->compressing = 0;

    return 0;
}

/**
 * Get pointer to output JPEG data
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* sip_encoder_get_output(SipEncoder* enc) {
    if (!enc) return NULL;
    return enc->output_buffer;
}

/**
 * Get size of output JPEG data
 */
EMSCRIPTEN_KEEPALIVE
uint32_t sip_encoder_get_output_size(SipEncoder* enc) {
    if (!enc) return 0;
    return (uint32_t)enc->output_size;
}

/**
 * Destroy encoder and free all resources
 */
EMSCRIPTEN_KEEPALIVE
void sip_encoder_destroy(SipEncoder* enc) {
    if (!enc) return;

    if (enc->compressing) {
        // Don't call finish if we're aborting
        enc->compressing = 0;
    }

    if (enc->row_buffer) {
        free(enc->row_buffer);
        enc->row_buffer = NULL;
    }

    if (enc->output_buffer) {
        free(enc->output_buffer);
        enc->output_buffer = NULL;
    }

    if (enc->initialized) {
        jpeg_destroy_compress(&enc->cinfo);
        enc->initialized = 0;
    }

    free(enc);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Allocate memory that can be accessed from JS
 */
EMSCRIPTEN_KEEPALIVE
void* sip_malloc(uint32_t size) {
    return malloc(size);
}

/**
 * Free memory allocated with sip_malloc
 */
EMSCRIPTEN_KEEPALIVE
void sip_free(void* ptr) {
    free(ptr);
}
