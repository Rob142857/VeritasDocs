"use strict";
(() => {
  // node_modules/@maatara/core-pqc-wasm/core_pqc_wasm.js
  var import_meta = {};
  var wasm;
  function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_2.set(idx, obj);
    return idx;
  }
  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      const idx = addToExternrefTable0(e);
      wasm.__wbindgen_exn_store(idx);
    }
  }
  var cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }
  var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
    throw Error("TextDecoder not available");
  } };
  if (typeof TextDecoder !== "undefined") {
    cachedTextDecoder.decode();
  }
  var MAX_SAFARI_DECODE_BYTES = 2146435072;
  var numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
      cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
        throw Error("TextDecoder not available");
      } };
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }
  function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
  }
  function isLikeNone(x) {
    return x === void 0 || x === null;
  }
  function kyber_keygen() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.kyber_keygen();
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  var WASM_VECTOR_LEN = 0;
  var cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
    throw Error("TextEncoder not available");
  } };
  var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
  } : function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === void 0) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr2 = malloc(buf.length, 1) >>> 0;
      getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr2;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 127) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      const ret = encodeString(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }
  function kyber_encaps(public_b64u) {
    let deferred2_0;
    let deferred2_1;
    try {
      const ptr0 = passStringToWasm0(public_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.kyber_encaps(ptr0, len0);
      deferred2_0 = ret[0];
      deferred2_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
  function kyber_decaps(secret_b64u, kem_ct_b64u) {
    let deferred3_0;
    let deferred3_1;
    try {
      const ptr0 = passStringToWasm0(secret_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(kem_ct_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ret = wasm.kyber_decaps(ptr0, len0, ptr1, len1);
      deferred3_0 = ret[0];
      deferred3_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
  }
  function hkdf_sha256(secret_b64u, info_b64u, salt_b64u, len) {
    let deferred4_0;
    let deferred4_1;
    try {
      const ptr0 = passStringToWasm0(secret_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(info_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      var ptr2 = isLikeNone(salt_b64u) ? 0 : passStringToWasm0(salt_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len2 = WASM_VECTOR_LEN;
      const ret = wasm.hkdf_sha256(ptr0, len0, ptr1, len1, ptr2, len2, len);
      deferred4_0 = ret[0];
      deferred4_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
  }
  function aes_gcm_wrap(key_b64u, dek_b64u, aad_b64u) {
    let deferred4_0;
    let deferred4_1;
    try {
      const ptr0 = passStringToWasm0(key_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(dek_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(aad_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len2 = WASM_VECTOR_LEN;
      const ret = wasm.aes_gcm_wrap(ptr0, len0, ptr1, len1, ptr2, len2);
      deferred4_0 = ret[0];
      deferred4_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
  }
  function aes_gcm_unwrap(key_b64u, iv_b64u, ct_b64u, aad_b64u) {
    let deferred5_0;
    let deferred5_1;
    try {
      const ptr0 = passStringToWasm0(key_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(iv_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(ct_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len2 = WASM_VECTOR_LEN;
      const ptr3 = passStringToWasm0(aad_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len3 = WASM_VECTOR_LEN;
      const ret = wasm.aes_gcm_unwrap(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
      deferred5_0 = ret[0];
      deferred5_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
  }
  function dilithium_keygen() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.dilithium_keygen();
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  function dilithium_sign(message_b64u, secret_b64u) {
    let deferred3_0;
    let deferred3_1;
    try {
      const ptr0 = passStringToWasm0(message_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(secret_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ret = wasm.dilithium_sign(ptr0, len0, ptr1, len1);
      deferred3_0 = ret[0];
      deferred3_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
  }
  function dilithium_verify(message_b64u, signature_b64u, public_b64u) {
    let deferred4_0;
    let deferred4_1;
    try {
      const ptr0 = passStringToWasm0(message_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(signature_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(public_b64u, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len2 = WASM_VECTOR_LEN;
      const ret = wasm.dilithium_verify(ptr0, len0, ptr1, len1, ptr2, len2);
      deferred4_0 = ret[0];
      deferred4_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
  }
  var EXPECTED_RESPONSE_TYPES = /* @__PURE__ */ new Set(["basic", "cors", "default"]);
  async function __wbg_load(module2, imports) {
    if (typeof Response === "function" && module2 instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === "function") {
        try {
          return await WebAssembly.instantiateStreaming(module2, imports);
        } catch (e) {
          const validResponse = module2.ok && EXPECTED_RESPONSE_TYPES.has(module2.type);
          if (validResponse && module2.headers.get("Content-Type") !== "application/wasm") {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
          } else {
            throw e;
          }
        }
      }
      const bytes = await module2.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      const instance = await WebAssembly.instantiate(module2, imports);
      if (instance instanceof WebAssembly.Instance) {
        return { instance, module: module2 };
      } else {
        return instance;
      }
    }
  }
  function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_buffer_a1a27a0dfa70165d = function(arg0) {
      const ret = arg0.buffer;
      return ret;
    };
    imports.wbg.__wbg_call_f2db6205e5c51dc8 = function() {
      return handleError(function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
      }, arguments);
    };
    imports.wbg.__wbg_call_fbe8be8bf6436ce5 = function() {
      return handleError(function(arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
      }, arguments);
    };
    imports.wbg.__wbg_crypto_574e78ad8b13b65f = function(arg0) {
      const ret = arg0.crypto;
      return ret;
    };
    imports.wbg.__wbg_getRandomValues_b8f5dbd5f3995a9e = function() {
      return handleError(function(arg0, arg1) {
        arg0.getRandomValues(arg1);
      }, arguments);
    };
    imports.wbg.__wbg_log_ea49c7a7eb7689d1 = function(arg0, arg1) {
      console.log(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_msCrypto_a61aeb35a24c1329 = function(arg0) {
      const ret = arg0.msCrypto;
      return ret;
    };
    imports.wbg.__wbg_new_e52b3efaaa774f96 = function(arg0) {
      const ret = new Uint8Array(arg0);
      return ret;
    };
    imports.wbg.__wbg_newnoargs_ff528e72d35de39a = function(arg0, arg1) {
      const ret = new Function(getStringFromWasm0(arg0, arg1));
      return ret;
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_3b01ecda099177e8 = function(arg0, arg1, arg2) {
      const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
      return ret;
    };
    imports.wbg.__wbg_newwithlength_08f872dc1e3ada2e = function(arg0) {
      const ret = new Uint8Array(arg0 >>> 0);
      return ret;
    };
    imports.wbg.__wbg_node_905d3e251edff8a2 = function(arg0) {
      const ret = arg0.node;
      return ret;
    };
    imports.wbg.__wbg_process_dc0fbacc7c1c06f7 = function(arg0) {
      const ret = arg0.process;
      return ret;
    };
    imports.wbg.__wbg_randomFillSync_ac0988aba3254290 = function() {
      return handleError(function(arg0, arg1) {
        arg0.randomFillSync(arg1);
      }, arguments);
    };
    imports.wbg.__wbg_require_60cc747a6bc5215a = function() {
      return handleError(function() {
        const ret = module.require;
        return ret;
      }, arguments);
    };
    imports.wbg.__wbg_set_fe4e79d1ed3b0e9b = function(arg0, arg1, arg2) {
      arg0.set(arg1, arg2 >>> 0);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_487c52c58d65314d = function() {
      const ret = typeof global === "undefined" ? null : global;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_ee9704f328b6b291 = function() {
      const ret = typeof globalThis === "undefined" ? null : globalThis;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_78c9e3071b912620 = function() {
      const ret = typeof self === "undefined" ? null : self;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_a093d21393777366 = function() {
      const ret = typeof window === "undefined" ? null : window;
      return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_subarray_dd4ade7d53bd8e26 = function(arg0, arg1, arg2) {
      const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
      return ret;
    };
    imports.wbg.__wbg_versions_c01dfd4722a88165 = function(arg0) {
      const ret = arg0.versions;
      return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
      const table = wasm.__wbindgen_export_2;
      const offset = table.grow(4);
      table.set(0, void 0);
      table.set(offset + 0, void 0);
      table.set(offset + 1, null);
      table.set(offset + 2, true);
      table.set(offset + 3, false);
      ;
    };
    imports.wbg.__wbindgen_is_function = function(arg0) {
      const ret = typeof arg0 === "function";
      return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
      const val = arg0;
      const ret = typeof val === "object" && val !== null;
      return ret;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
      const ret = typeof arg0 === "string";
      return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
      const ret = arg0 === void 0;
      return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
      const ret = wasm.memory;
      return ret;
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
      const ret = getStringFromWasm0(arg0, arg1);
      return ret;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    };
    return imports;
  }
  function __wbg_init_memory(imports, memory) {
  }
  function __wbg_finalize_init(instance, module2) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module2;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
  }
  async function __wbg_init(module_or_path) {
    if (wasm !== void 0) return wasm;
    if (typeof module_or_path !== "undefined") {
      if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
        ({ module_or_path } = module_or_path);
      } else {
        console.warn("using deprecated parameters for the initialization function; pass a single object instead");
      }
    }
    if (typeof module_or_path === "undefined") {
      module_or_path = new URL("core_pqc_wasm_bg.wasm", import_meta.url);
    }
    const imports = __wbg_get_imports();
    if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
      module_or_path = fetch(module_or_path);
    }
    __wbg_init_memory(imports);
    const { instance, module: module2 } = await __wbg_load(await module_or_path, imports);
    return __wbg_finalize_init(instance, module2);
  }
  var core_pqc_wasm_default = __wbg_init;

  // node_modules/@maatara/core-pqc/dist/index.mjs
  var wasm_kyber_keygen = kyber_keygen;
  var wasm_kyber_encaps = kyber_encaps;
  var wasm_kyber_decaps = kyber_decaps;
  var wasm_hkdf_sha256 = hkdf_sha256;
  var wasm_aes_gcm_wrap = aes_gcm_wrap;
  var wasm_aes_gcm_unwrap = aes_gcm_unwrap;
  var wasm_dilithium_keygen = dilithium_keygen;
  var wasm_dilithium_sign = dilithium_sign;
  var wasm_dilithium_verify = dilithium_verify;
  var wasmReady = false;
  async function initWasm(wasmInput) {
    if (wasmReady)
      return;
    const maybeInit = core_pqc_wasm_default;
    if (typeof maybeInit === "function") {
      if (wasmInput !== void 0) {
        await maybeInit(wasmInput);
      } else {
        await maybeInit();
      }
    }
    wasmReady = true;
  }
  async function kyberKeygen() {
    await initWasm();
    const result = JSON.parse(wasm_kyber_keygen());
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function kyberEncaps(publicB64u) {
    await initWasm();
    const result = JSON.parse(wasm_kyber_encaps(publicB64u));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function kyberDecaps(secretB64u, kemCtB64u) {
    await initWasm();
    const result = JSON.parse(wasm_kyber_decaps(secretB64u, kemCtB64u));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function hkdfSha256(secretB64u, infoB64u, saltB64u, len = 32) {
    await initWasm();
    const result = JSON.parse(wasm_hkdf_sha256(secretB64u, infoB64u, saltB64u, len));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function aesGcmWrap(keyB64u, dekB64u, aadB64u) {
    await initWasm();
    const result = JSON.parse(wasm_aes_gcm_wrap(keyB64u, dekB64u, aadB64u));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function aesGcmUnwrap(keyB64u, ivB64u, ctB64u, aadB64u) {
    await initWasm();
    const result = JSON.parse(wasm_aes_gcm_unwrap(keyB64u, ivB64u, ctB64u, aadB64u));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function dilithiumKeygen() {
    await initWasm();
    const result = JSON.parse(wasm_dilithium_keygen());
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function dilithiumSign(messageB64u, secretB64u) {
    await initWasm();
    const result = JSON.parse(wasm_dilithium_sign(messageB64u, secretB64u));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  async function dilithiumVerify(messageB64u, signatureB64u, publicB64u) {
    await initWasm();
    const result = JSON.parse(wasm_dilithium_verify(messageB64u, signatureB64u, publicB64u));
    if (result.error)
      throw new Error(result.error);
    return result;
  }
  function _fromByteArray(bytes) {
    if (typeof btoa === "function") {
      let s = "";
      for (let i = 0; i < bytes.length; i++)
        s += String.fromCharCode(bytes[i]);
      return btoa(s);
    }
    return Buffer.from(bytes).toString("base64");
  }
  function _toByteArray(b64) {
    if (typeof atob === "function") {
      const binary = atob(b64);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++)
        out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  function b64uEncode(data) {
    return _fromByteArray(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");
  }
  function b64uDecode(str) {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
    return _toByteArray(b64);
  }

  // src/frontend/app.ts
  var wasmInitialized = false;
  async function ensureCryptoReady() {
    if (wasmInitialized) return;
    try {
      const wasmUrl = "/static/core_pqc_wasm_bg.wasm";
      const wasmResponse = await fetch(wasmUrl);
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM file: ${wasmResponse.statusText}`);
      }
      await initWasm(wasmResponse);
      wasmInitialized = true;
      console.log("\u2713 Post-quantum cryptography initialized");
    } catch (error) {
      console.error("Failed to initialize WASM:", error);
      throw new Error("Cryptography initialization failed");
    }
  }
  async function encryptDocumentData(data, publicKeyB64u) {
    await ensureCryptoReady();
    async function gzipCompress(bytes) {
      try {
        if (typeof window.CompressionStream === "function") {
          const cs = new window.CompressionStream("gzip");
          const body = new Response(bytes).body;
          const stream = body.pipeThrough(cs);
          const compressed = await new Response(stream).arrayBuffer();
          return new Uint8Array(compressed);
        }
      } catch {
      }
      return bytes;
    }
    const encapsResult = await kyberEncaps(publicKeyB64u);
    if (encapsResult.error) throw new Error(encapsResult.error);
    const sharedSecret = encapsResult.shared_b64u;
    const kemCt = encapsResult.kem_ct_b64u;
    const infoB64u = b64uEncode(new TextEncoder().encode("veritas-aes"));
    const kdfResult = await hkdfSha256(sharedSecret, infoB64u, "", 32);
    if (kdfResult.error) throw new Error(kdfResult.error);
    const aesKey = kdfResult.key_b64u;
    const rawBytes = new TextEncoder().encode(data);
    const compressedBytes = await gzipCompress(rawBytes);
    const usedCompression = compressedBytes !== void 0 && compressedBytes.length < rawBytes.length ? "gzip" : "none";
    const dekB64u = b64uEncode(usedCompression === "gzip" ? compressedBytes : rawBytes);
    const aadB64u = b64uEncode(new TextEncoder().encode("veritas-documents"));
    const aesResult = await aesGcmWrap(aesKey, dekB64u, aadB64u);
    if (aesResult.error) throw new Error(aesResult.error);
    return JSON.stringify({
      version: "1.0",
      algorithm: "kyber768-aes256gcm",
      kem_ct: kemCt,
      iv: aesResult.iv_b64u,
      ciphertext: aesResult.ct_b64u,
      compression: usedCompression
    });
  }
  async function decryptDocumentData(encryptedData, privateKeyB64u) {
    await ensureCryptoReady();
    const encData = JSON.parse(encryptedData);
    const decapsResult = await kyberDecaps(privateKeyB64u, encData.kem_ct);
    if (decapsResult.error) throw new Error(decapsResult.error);
    const sharedSecret = decapsResult.shared_b64u;
    const infoB64u = b64uEncode(new TextEncoder().encode("veritas-aes"));
    const kdfResult = await hkdfSha256(sharedSecret, infoB64u, "", 32);
    if (kdfResult.error) throw new Error(kdfResult.error);
    const aesKey = kdfResult.key_b64u;
    const aadB64u = b64uEncode(new TextEncoder().encode("veritas-documents"));
    const aesResult = await aesGcmUnwrap(aesKey, encData.iv, encData.ciphertext, aadB64u);
    if (aesResult.error) throw new Error(aesResult.error);
    async function gzipDecompress(bytes) {
      try {
        if (typeof window.DecompressionStream === "function") {
          const ds = new window.DecompressionStream("gzip");
          const body = new Response(bytes).body;
          const stream = body.pipeThrough(ds);
          const decompressed = await new Response(stream).arrayBuffer();
          return new Uint8Array(decompressed);
        }
      } catch {
      }
      return bytes;
    }
    const decryptedBytes = b64uDecode(aesResult.dek_b64u);
    const needsDecompress = encData && encData.compression === "gzip";
    const outputBytes = needsDecompress ? await gzipDecompress(decryptedBytes) : decryptedBytes;
    return new TextDecoder().decode(outputBytes);
  }
  async function generateClientKeypair() {
    await ensureCryptoReady();
    try {
      const kyberResult = await kyberKeygen();
      console.log("Kyber keygen result:", kyberResult);
      if (kyberResult.error) throw new Error(kyberResult.error);
      const dilithiumResult = await dilithiumKeygen();
      console.log("Dilithium keygen result:", dilithiumResult);
      if (dilithiumResult.error) throw new Error(dilithiumResult.error);
      console.log("Testing Dilithium keys...");
      const testMessage = "test message for dilithium";
      const testMessageB64u = b64uEncode(new TextEncoder().encode(testMessage));
      try {
        const testSignResult = await dilithiumSign(testMessageB64u, dilithiumResult.secret_b64u);
        console.log("Dilithium test sign result:", testSignResult);
        if (testSignResult.error) {
          console.error("Dilithium test sign failed:", testSignResult.error);
          throw new Error("Dilithium key test failed: " + testSignResult.error);
        }
        const testVerifyResult = await dilithiumVerify(testMessageB64u, testSignResult.signature_b64u, dilithiumResult.public_b64u);
        console.log("Dilithium test verify result:", testVerifyResult);
        if (testVerifyResult.error || !testVerifyResult.is_valid) {
          console.error("Dilithium test verify failed:", testVerifyResult);
          throw new Error("Dilithium key verification test failed");
        }
        console.log("\u2713 Dilithium keys tested successfully");
      } catch (testError) {
        console.error("Dilithium key test error:", testError);
        throw new Error("Generated Dilithium keys are invalid: " + testError.message);
      }
      return {
        kyberPublicKey: kyberResult.public_b64u,
        kyberPrivateKey: kyberResult.secret_b64u,
        dilithiumPublicKey: dilithiumResult.public_b64u,
        // Store ONLY the secret_b64u string, just like Kyber
        dilithiumPrivateKey: dilithiumResult.secret_b64u
      };
    } catch (error) {
      console.error("Key generation error:", error);
      throw error;
    }
  }
  async function signData(data, dilithiumSecretB64u) {
    await ensureCryptoReady();
    const messageB64u = b64uEncode(new TextEncoder().encode(data));
    console.log("Attempting to sign with Dilithium...");
    console.log("Secret key b64u length:", dilithiumSecretB64u.length);
    console.log("Message b64u length:", messageB64u.length);
    console.log("Data preview:", data.substring(0, 100));
    const signResult = await dilithiumSign(messageB64u, dilithiumSecretB64u);
    console.log("Sign result:", signResult);
    if (signResult.error) {
      console.error("Dilithium sign error:", signResult.error);
      throw new Error(signResult.error);
    }
    return signResult.signature_b64u;
  }
  async function verifySignature(data, signature, dilithiumPublicKey) {
    await ensureCryptoReady();
    const messageB64u = b64uEncode(new TextEncoder().encode(data));
    const verifyResult = await dilithiumVerify(messageB64u, signature, dilithiumPublicKey);
    if (verifyResult.error) return false;
    return verifyResult.is_valid === true;
  }
  async function hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function generatePassphrase() {
    const words = [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
      "absurd",
      "abuse",
      "access",
      "accident",
      "account",
      "accuse",
      "achieve",
      "acid",
      "acoustic",
      "acquire",
      "across",
      "act",
      "action",
      "actor",
      "actress",
      "actual",
      "adapt",
      "add",
      "addict",
      "address",
      "adjust",
      "admit",
      "adult",
      "advance",
      "advice",
      "aerobic",
      "affair",
      "afford",
      "afraid",
      "again",
      "age",
      "agent",
      "agree",
      "ahead",
      "aim",
      "air",
      "airport",
      "aisle",
      "alarm",
      "album",
      "alcohol",
      "alert",
      "alien",
      "all",
      "alley",
      "allow",
      "almost",
      "alone",
      "alpha",
      "already",
      "also",
      "alter",
      "always",
      "amateur",
      "amazing",
      "among",
      "amount",
      "amused",
      "analyst",
      "anchor",
      "ancient",
      "anger",
      "angle",
      "angry",
      "animal",
      "ankle",
      "announce",
      "annual",
      "another",
      "answer",
      "antenna",
      "antique",
      "anxiety",
      "any",
      "apart",
      "apology",
      "appear",
      "apple",
      "approve",
      "april",
      "arch",
      "arctic",
      "area",
      "arena",
      "argue",
      "arm",
      "armed",
      "armor",
      "army",
      "around",
      "arrange",
      "arrest",
      "arrive",
      "arrow",
      "art",
      "artefact",
      "artist",
      "artwork",
      "ask",
      "aspect",
      "assault",
      "asset",
      "assist",
      "assume",
      "asthma",
      "athlete",
      "atom",
      "attack",
      "attend",
      "attitude",
      "attract",
      "auction",
      "audit",
      "august",
      "aunt",
      "author",
      "auto",
      "autumn",
      "average",
      "avocado",
      "avoid",
      "awake",
      "aware",
      "away",
      "awesome",
      "awful",
      "awkward",
      "axis",
      "baby",
      "bachelor",
      "bacon",
      "badge",
      "bag",
      "balance",
      "balcony",
      "ball",
      "bamboo",
      "banana",
      "banner",
      "bar",
      "barely",
      "bargain",
      "barrel",
      "base"
    ];
    const mnemonic = [];
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < 12; i++) {
      const randomIndex = randomBytes[i] % words.length;
      mnemonic.push(words[randomIndex]);
    }
    return mnemonic.join(" ");
  }
  async function deriveKeyFromPassphrase(passphrase, salt) {
    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      passphraseBytes,
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1e5,
        // High iteration count for security
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return aesKey;
  }
  async function encryptKeypack(keypack, passphrase) {
    await ensureCryptoReady();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
    const keypackJson = JSON.stringify(keypack);
    const plaintext = new TextEncoder().encode(keypackJson);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128
        // 128-bit auth tag
      },
      aesKey,
      plaintext
    );
    return {
      salt: b64uEncode(salt),
      iv: b64uEncode(iv),
      ciphertext: b64uEncode(new Uint8Array(ciphertext))
    };
  }
  async function decryptKeypack(encrypted, passphrase) {
    await ensureCryptoReady();
    try {
      const salt = b64uDecode(encrypted.salt);
      const iv = b64uDecode(encrypted.iv);
      const ciphertext = b64uDecode(encrypted.ciphertext);
      console.log("Decrypting keypack:", {
        saltLength: salt.byteLength,
        ivLength: iv.byteLength,
        ciphertextLength: ciphertext.byteLength
      });
      const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
          tagLength: 128
        },
        aesKey,
        ciphertext
      );
      const keypackJson = new TextDecoder().decode(plaintext);
      console.log("Keypack decrypted successfully");
      return JSON.parse(keypackJson);
    } catch (error) {
      console.error("Keypack decryption failed:", error);
      throw new Error("Incorrect passphrase or corrupted keypack file");
    }
  }
  function downloadKeypack(email, encrypted) {
    const keypackData = {
      format: "veritas-keypack-v1",
      created: (/* @__PURE__ */ new Date()).toISOString(),
      email,
      encrypted
    };
    const blob = new Blob([JSON.stringify(keypackData, null, 2)], {
      type: "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veritas-${email.replace("@", "-at-").replace(/[^a-z0-9-]/gi, "")}.keypack`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  window.VeritasCrypto = {
    encryptDocumentData,
    decryptDocumentData,
    generateClientKeypair,
    signData,
    verifySignature,
    ensureCryptoReady,
    hashData,
    // New keypack functions
    generatePassphrase,
    encryptKeypack,
    decryptKeypack,
    downloadKeypack
  };
  console.log("Veritas Crypto module loaded");
})();
//# sourceMappingURL=app.bundle.js.map
