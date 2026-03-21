import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: './',

  // Entry point configuration
  build: {
    // Output directory for production build
    outDir: 'dist',

    // Asset subdirectory within dist/
    assetsDir: 'assets',

    // Generate source maps for debugging production builds
    sourcemap: true,

    // Minification settings
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console.log in dev/debug scenarios
      },
    },

    // Module format: ESNext (modern)
    target: 'esnext',

    // Rollup options for advanced bundling
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        // Single bundle (not split)
        entryFileNames: 'bundle.js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash][extname]',
      },
    },
  },

  // Development server configuration
  server: {
    port: 8080,
    host: 'localhost',

    // Hot Module Replacement (HMR) settings
    hmr: {
      host: 'localhost',
      port: 8080,
    },

    // File watcher polling (useful for certain file systems)
    watch: {
      usePolling: false, // Set to true if HMR not working on your system
    },
  },

  // Preview server configuration (for testing production build locally)
  preview: {
    port: 4173,
    host: 'localhost',
  },

  // Path aliases (matches tsconfig.json)
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@components': resolve(__dirname, 'src/components'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
    // Extensions to try when resolving
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },

  // Optimization settings
  optimizeDeps: {
    // Explicitly include heavy dependencies for pre-bundling
    include: ['three', 'jszip'],
  },
})
