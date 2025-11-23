#!/usr/bin/env node

/**
 * Build script to bundle the validator into a single JS file for the browser
 */

import * as esbuild from 'esbuild';

const result = await esbuild.build({
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
