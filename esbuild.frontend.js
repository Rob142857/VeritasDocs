// esbuild configuration for frontend bundle with Maatara WASM support
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  try {
    // Build the frontend JavaScript with Maatara SDK
    await esbuild.build({
      entryPoints: ['src/frontend/app.ts'],
      bundle: true,
      outfile: 'public/app.bundle.js',
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      loader: {
        '.wasm': 'file'
      },
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });

    // Copy WASM file to public directory
    const wasmSource = path.join(__dirname, 'node_modules', '@maatara', 'core-pqc-wasm', 'core_pqc_wasm_bg.wasm');
    const wasmDest = path.join(__dirname, 'public', 'core_pqc_wasm_bg.wasm');
    
    if (fs.existsSync(wasmSource)) {
      fs.copyFileSync(wasmSource, wasmDest);
      console.log('✓ Copied WASM file to public/');
    }

    console.log('✓ Frontend bundle built successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
