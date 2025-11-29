#!/usr/bin/env node

/**
 * Build script to bundle the validator and tasks app into single JS files for the browser
 */

import * as esbuild from 'esbuild';

// Build validator bundle
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

// Build tasks bundle
await esbuild.build({
  entryPoints: ['src/tasks-app.ts'],
  bundle: true,
  outfile: 'public/tasks.bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  loader: {
    '.json': 'json',
  },
  sourcemap: true,
  minify: false, // Set to true for production
});

console.log('✅ Bundle created: public/tasks.bundle.js');
