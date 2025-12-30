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
  console.log('[sip:initWithWasmModule] Called with module:', compiledModule ? 'provided' : 'none');

  if (wasmModule) {
    console.log('[sip:initWithWasmModule] Already initialized, skipping');
    return; // Already initialized
  }

  // Store the pre-compiled module for use in instantiateWasm callback
  if (compiledModule) {
    precompiledWasmModule = compiledModule;
    console.log('[sip:initWithWasmModule] Stored pre-compiled module');
  }

  console.log('[sip:initWithWasmModule] Calling loadWasm...');
  await loadWasm();
  console.log('[sip:initWithWasmModule] loadWasm completed, wasmModule:', wasmModule ? 'loaded' : 'null');
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
  console.log('[sip:doLoadWasm] Starting...');

  // Check for externally provided loader first
  if (typeof globalThis !== 'undefined' && (globalThis as any).__SIP_WASM_LOADER__) {
    console.log('[sip:doLoadWasm] Using external loader');
    const loader = (globalThis as any).__SIP_WASM_LOADER__;
    return await loader();
  }

  // Try to dynamically import the Emscripten glue code
  try {
    console.log('[sip:doLoadWasm] Importing sip.js...');
    // @ts-ignore - Dynamic import of built WASM module
    const createSipModule = (await import('./sip.js')).default;
    console.log('[sip:doLoadWasm] sip.js imported, createSipModule:', typeof createSipModule);

    // If we have a pre-compiled module, use instantiateWasm callback
    if (precompiledWasmModule) {
      console.log('[sip:doLoadWasm] Using pre-compiled module with instantiateWasm callback');

      const module = await new Promise<SipWasmModule>((resolve, reject) => {
        let resolvedModule: SipWasmModule | null = null;

        createSipModule({
          instantiateWasm: (
            imports: WebAssembly.Imports,
            receiveInstance: (instance: WebAssembly.Instance) => void
          ) => {
            console.log('[sip:instantiateWasm] Called, instantiating with pre-compiled module');

            // Use WebAssembly.instantiate with the pre-compiled module
            WebAssembly.instantiate(precompiledWasmModule!, imports)
              .then((instance) => {
                console.log('[sip:instantiateWasm] Instance created successfully');
                receiveInstance(instance);
              })
              .catch((err) => {
                console.error('[sip:instantiateWasm] Failed:', err);
                reject(err);
              });

            // Return empty exports - Emscripten will get them from receiveInstance
            return {};
          },
          onRuntimeInitialized: () => {
            // Runtime is now fully initialized, HEAPU8 should be available
            console.log('[sip:onRuntimeInitialized] Runtime ready, HEAPU8:', resolvedModule?.HEAPU8 ? 'exists' : 'undefined');
            if (resolvedModule && resolvedModule.HEAPU8) {
              resolve(resolvedModule);
            }
          },
        }).then((mod: SipWasmModule) => {
          console.log('[sip:doLoadWasm] Module promise resolved, HEAPU8:', mod?.HEAPU8 ? 'exists' : 'undefined');
          resolvedModule = mod;
          // If HEAPU8 is already available, resolve immediately
          if (mod.HEAPU8) {
            resolve(mod);
          }
          // Otherwise, wait for onRuntimeInitialized
        }).catch(reject);
      });

      return module;
    }

    // Standard loading (browser environment)
    console.log('[sip:doLoadWasm] Using standard loading');
    const module = await createSipModule();
    console.log('[sip:doLoadWasm] Standard load complete, module.HEAPU8:', module?.HEAPU8 ? 'exists' : 'undefined');
    return module as SipWasmModule;
  } catch (err) {
    console.error('[sip:doLoadWasm] Failed:', err);
    throw new Error(
      'SIP WASM module not available. ' +
      'To use streaming processing, build the WASM module with `pnpm build:wasm` in packages/sip. ' +
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
