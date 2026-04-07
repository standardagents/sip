#!/bin/bash
set -e

# SIP WASM Build Script
# Builds libjpeg-turbo, libspng and sip bindings to WASM using Emscripten

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
DIST_DIR="$SCRIPT_DIR/../dist"
LIBS_DIR="$SCRIPT_DIR/libs"

# Library versions
LIBJPEG_VERSION="3.1.4.1"
LIBJPEG_URL="https://github.com/libjpeg-turbo/libjpeg-turbo/archive/refs/tags/${LIBJPEG_VERSION}.tar.gz"

LIBSPNG_VERSION="0.7.4"
LIBSPNG_URL="https://github.com/randy408/libspng/archive/refs/tags/v${LIBSPNG_VERSION}.tar.gz"

# miniz 2.2.0 for zlib replacement - need to include multiple source files
MINIZ_VERSION="2.2.0"
MINIZ_URL="https://github.com/richgel999/miniz/archive/refs/tags/${MINIZ_VERSION}.tar.gz"

# Check for Emscripten - try local emsdk first, then PATH
EMSDK_DIR="$SCRIPT_DIR/emsdk"
if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    echo "Using local emsdk..."
    source "$EMSDK_DIR/emsdk_env.sh" > /dev/null 2>&1
fi

if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten (emcc) not found"
    echo ""
    echo "Install locally in wasm/emsdk:"
    echo "  cd wasm && git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
fi

echo "Using Emscripten: $(emcc --version | head -1)"

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$DIST_DIR"
mkdir -p "$LIBS_DIR"

# Download and extract libjpeg-turbo if not present
LIBJPEG_DIR="$LIBS_DIR/libjpeg-turbo-${LIBJPEG_VERSION}"
if [ ! -d "$LIBJPEG_DIR" ]; then
    echo "Downloading libjpeg-turbo ${LIBJPEG_VERSION}..."
    curl -L "$LIBJPEG_URL" -o "$LIBS_DIR/libjpeg-turbo.tar.gz"
    tar -xzf "$LIBS_DIR/libjpeg-turbo.tar.gz" -C "$LIBS_DIR"
    rm "$LIBS_DIR/libjpeg-turbo.tar.gz"
fi

# Download and extract miniz if not present (zlib replacement for libspng)
MINIZ_DIR="$LIBS_DIR/miniz-${MINIZ_VERSION}"
if [ ! -d "$MINIZ_DIR" ]; then
    echo "Downloading miniz ${MINIZ_VERSION}..."
    curl -L "$MINIZ_URL" -o "$LIBS_DIR/miniz.tar.gz"
    tar -xzf "$LIBS_DIR/miniz.tar.gz" -C "$LIBS_DIR"
    rm "$LIBS_DIR/miniz.tar.gz"
fi

# Download and extract libspng if not present
LIBSPNG_DIR="$LIBS_DIR/libspng-${LIBSPNG_VERSION}"
if [ ! -d "$LIBSPNG_DIR" ]; then
    echo "Downloading libspng ${LIBSPNG_VERSION}..."
    curl -L "$LIBSPNG_URL" -o "$LIBS_DIR/libspng.tar.gz"
    tar -xzf "$LIBS_DIR/libspng.tar.gz" -C "$LIBS_DIR"
    rm "$LIBS_DIR/libspng.tar.gz"
fi

# Build libjpeg-turbo for WASM
LIBJPEG_BUILD="$BUILD_DIR/libjpeg-turbo-${LIBJPEG_VERSION}"
if [ ! -f "$LIBJPEG_BUILD/libjpeg.a" ]; then
    echo "Building libjpeg-turbo for WASM..."
    mkdir -p "$LIBJPEG_BUILD"
    cd "$LIBJPEG_BUILD"

    # Configure with CMake for Emscripten
    emcmake cmake "$LIBJPEG_DIR" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
        -DENABLE_SHARED=OFF \
        -DENABLE_STATIC=ON \
        -DWITH_SIMD=OFF \
        -DWITH_TURBOJPEG=OFF \
        -DWITH_ARITH_ENC=ON \
        -DWITH_ARITH_DEC=ON

    # Build
    emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
fi

echo "Building sip.wasm..."
cd "$SCRIPT_DIR"

# Create miniz_export.h if missing (required by miniz but not included in tarball)
if [ ! -f "$MINIZ_DIR/miniz_export.h" ]; then
    echo "Creating miniz_export.h..."
    cat > "$MINIZ_DIR/miniz_export.h" << 'EOF'
#ifndef MINIZ_EXPORT_H
#define MINIZ_EXPORT_H
#define MINIZ_EXPORT
#endif
EOF
fi

# Compile sip bindings with libjpeg and libspng
# libspng uses miniz as zlib replacement (SPNG_USE_MINIZ)
# Cloudflare Workers require static WASM imports, not dynamic instantiation
# We output separate .wasm file and handle loading in TypeScript
emcc \
    -O3 \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME="createSipModule" \
    -s ENVIRONMENT='web,worker' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=2097152 \
    -s MAXIMUM_MEMORY=134217728 \
    -s STACK_SIZE=65536 \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF8ToString","HEAPU8","HEAP8","HEAP16","HEAP32","HEAPU16","HEAPU32"]' \
    -s EXPORTED_FUNCTIONS='["_malloc","_free"]' \
    -s NO_EXIT_RUNTIME=1 \
    -s FILESYSTEM=0 \
    -s ASSERTIONS=0 \
    -DSPNG_USE_MINIZ \
    -I"$LIBJPEG_DIR"/src \
    -I"$LIBJPEG_BUILD" \
    -I"$LIBSPNG_DIR"/spng \
    -I"$MINIZ_DIR" \
    -L"$LIBJPEG_BUILD" \
    src/sip.c \
    "$LIBSPNG_DIR"/spng/spng.c \
    "$MINIZ_DIR"/miniz.c \
    "$MINIZ_DIR"/miniz_tinfl.c \
    "$MINIZ_DIR"/miniz_tdef.c \
    -ljpeg \
    -o "$DIST_DIR/sip.js"

echo "Build complete!"
echo "Output files:"
echo "  $DIST_DIR/sip.js"
echo "  $DIST_DIR/sip.wasm"

# Calculate sizes
JS_SIZE=$(wc -c < "$DIST_DIR/sip.js" | tr -d ' ')
WASM_SIZE=$(wc -c < "$DIST_DIR/sip.wasm" | tr -d ' ')
echo ""
echo "Size:"
echo "  sip.js:   $(echo "scale=2; $JS_SIZE/1024" | bc) KB"
echo "  sip.wasm: $(echo "scale=2; $WASM_SIZE/1024" | bc) KB"
