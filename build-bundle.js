#!/usr/bin/env node

/**
 * Build script to bundle the validator and browser apps into JS files
 */

import * as esbuild from 'esbuild';

// Build validator bundle (used by app.ts as global ModValidator object)
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'public/validator.bundle.js',
  format: 'iife',
  globalName: 'ModValidator',
  platform: 'browser',
  target: 'es2020',
  loader: {
    '.json': 'json',
  },
  sourcemap: true,
  minify: false, // Set to true for production
});

console.log('✅ Bundle created: public/validator.bundle.js');

// Build main app bundle (includes all page modules)
await esbuild.build({
  entryPoints: ['src/pages/index.ts'],
  bundle: true,
  outfile: 'public/app.bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  loader: {
    '.json': 'json',
  },
  sourcemap: true,
  minify: false, // Set to true for production
});

console.log('✅ Bundle created: public/app.bundle.js');
