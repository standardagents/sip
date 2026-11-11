/**
 * WASM Module Loader
 *
 * Loads the SIP WASM module with proper initialization.
 * Works in both browser and Cloudflare Workers environments.
 *
 * For Cloudflare Workers, use initWithWasmModule() in the Durable Object
 * constructor, passing the statically imported WASM module.
 */

import type { SipWasmModule } from './types';

let wasmModule: SipWasmModule | null = null;
let wasmPromise: Promise<SipWasmModule> | null = null;
let precompiledWasmModule: WebAssembly.Module | null = null;

function isCloudflareWorker(): boolean {
  const cacheStorage = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return typeof cacheStorage !== 'undefined' && typeof cacheStorage.default !== 'undefined';
}

/**
 * Check if WASM module is available
 */
export function isWasmAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * Initialize with a pre-compiled WebAssembly.Module
 *
 * For Cloudflare Workers, import the WASM file statically and pass it here.
 * This allows workerd to pre-compile the WASM at bundle time.
 *
 * @example
 * ```typescript
 * import sipWasm from '@standardagents/sip/dist/sip.wasm';
 * import { initWithWasmModule } from '@standardagents/sip';
 *
 * // At module top level or in DO constructor
 * await initWithWasmModule(sipWasm);
 * ```
 */
export async function initWithWasmModule(compiledModule?: WebAssembly.Module): Promise<void> {
  if (wasmModule) {
    return; // Already initialized
  }

  // Store the pre-compiled module for use in instantiateWasm callback
  if (compiledModule) {
    precompiledWasmModule = compiledModule;
  }

  await loadWasm();
}

/**
 * Get the WASM module, throwing if not loaded
 */
export function getWasmModule(): SipWasmModule {
  if (!wasmModule) {
    throw new Error('WASM module not loaded. Call loadWasm() first.');
  }
  return wasmModule;
}

/**
 * Load the WASM module
 *
 * This function is idempotent - calling it multiple times returns the same module.
 */
export async function loadWasm(): Promise<SipWasmModule> {
  // Return cached module if already loaded
  if (wasmModule) {
    return wasmModule;
  }

  // Return existing promise if loading in progress
  if (wasmPromise) {
    return wasmPromise;
  }

  wasmPromise = doLoadWasm();

  try {
    wasmModule = await wasmPromise;
    return wasmModule;
  } catch (err) {
    wasmPromise = null;
    throw err;
  }
}

/**
 * Internal function to load the WASM module
 */
async function doLoadWasm(): Promise<SipWasmModule> {
  // Check for externally provided loader first
  if (typeof globalThis !== 'undefined' && (globalThis as any).__SIP_WASM_LOADER__) {
    const loader = (globalThis as any).__SIP_WASM_LOADER__;
    return await loader();
  }

  // Try to dynamically import the Emscripten glue code
  try {
    // @ts-ignore - Dynamic import of built WASM module
    const createSipModule = (await import('./sip.js')).default;

    // Prefer an explicitly provided precompiled module in Workers/bundlers
    // before probing any environment-specific filesystem paths.
    if (precompiledWasmModule) {
      const module = await new Promise<SipWasmModule>((resolve, reject) => {
        let resolvedModule: SipWasmModule | null = null;

        createSipModule({
          instantiateWasm: (
            imports: WebAssembly.Imports,
            receiveInstance: (instance: WebAssembly.Instance) => void
          ) => {
            WebAssembly.instantiate(precompiledWasmModule!, imports)
              .then((instance) => {
                receiveInstance(instance);
              })
              .catch((err) => {
                reject(err);
              });

            return {};
          },
          onRuntimeInitialized: () => {
            if (resolvedModule && resolvedModule.HEAPU8) {
              resolve(resolvedModule);
            }
          },
        }).then((mod: SipWasmModule) => {
          resolvedModule = mod;
          if (mod.HEAPU8) {
            resolve(mod);
          }
        }).catch(reject);
      });

      return module;
    }

    const isNode =
      !isCloudflareWorker() &&
      typeof process !== 'undefined' &&
      process.versions != null &&
      process.versions.node != null;

    if (isNode) {
      // Dynamic module name prevents esbuild/wrangler from resolving this
      // at bundle time. Only Node.js reaches this branch at runtime.
      const fsModule = 'fs/promises';
      const { readFile } = await import(/* @vite-ignore */ fsModule);
      const wasmBinary = await readFile(new URL('./sip.wasm', import.meta.url));
      const module = await createSipModule({ wasmBinary });
      return module as SipWasmModule;
    }

    // Standard loading (browser environment)
    const module = await createSipModule();
    return module as SipWasmModule;
  } catch (err) {
    throw new Error(
      'SIP WASM module not available. ' +
      'To use streaming processing, build the WASM module with `pnpm build:wasm` in the @standardagents/sip repo root. ' +
      'Error: ' + (err instanceof Error ? err.message : String(err))
    );
  }
}

/**
 * Copy data to WASM memory
 */
export function copyToWasm(module: SipWasmModule, data: Uint8Array): number {
  const ptr = module._malloc(data.length);
  if (!ptr) {
    throw new Error('Failed to allocate WASM memory');
  }
  module.HEAPU8.set(data, ptr);
  return ptr;
}

/**
 * Copy data from WASM memory
 */
export function copyFromWasm(module: SipWasmModule, ptr: number, size: number): Uint8Array {
  return new Uint8Array(module.HEAPU8.buffer, ptr, size).slice();
}
