import { defineConfig } from 'tsup'

export default defineConfig([
  // Main library
  {
    entry: {
      index: 'src/index.ts',
      'generators/index': 'src/generators/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    target: 'node18',
    outDir: 'dist',
  },
  // CLI (with shebang)
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    target: 'node18',
    outDir: 'dist',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
