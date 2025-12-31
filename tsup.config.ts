import { defineConfig } from 'tsup'

export default defineConfig([
  // Main library
  {
    entry: {
      index: 'src/index.ts',
      'generators/index': 'src/generators/index.ts',
      'tui/index': 'src/tui/index.ts',
      'runtime/index': 'src/runtime/index.ts',
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
    external: ['react', '@tanstack/react-query'],
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
    external: ['ink', 'react', '@tanstack/react-query', 'chalk'],
  },
])
