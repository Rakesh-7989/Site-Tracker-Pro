import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { fileURLToPath, URL } from 'node:url'

// Path aliases mirrored from tsconfig.json. Vite + Vitest read these so that
// new TypeScript code can use @/auth/* @/components/* etc. without breaking
// existing relative-path JS imports.
const r = (p) => fileURLToPath(new URL(p, import.meta.url))

const isAnalyze = process.env.ANALYZE === 'true'

export default defineConfig({
  plugins: [
    react(),
    ...(isAnalyze ? [visualizer({ open: true, gzipSize: true, brotliSize: true })] : []),
  ],
  resolve: {
    alias: {
      '@/auth':       r('./src/auth'),
      '@/components': r('./src/components'),
      '@/features':   r('./src/features'),
      '@/hooks':      r('./src/hooks'),
      '@/lib':        r('./src/lib'),
      '@/data':       r('./src/data'),
      '@':            r('./src'),
    },
  },
  server: { port: 5173, open: true },
  build: {
    // The legacy detail shell remains available only through ?shell=legacy and
    // still carries several old tab implementations. Keep the warning budget
    // aligned with that temporary fallback while v3 uses smaller route chunks.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          // Supabase is used by both static legacy imports and dynamic v3 calls.
          // Give it a stable shared chunk so dynamic imports do not get folded
          // into whichever route references it first.
          if (normalized.includes('/src/lib/supabase/supabase')) return 'supabase'
          // Split first-party roadmap views off the main bundle — only loaded
          // when a user navigates to a Batch 2/3 view (hierarchy / kiosks /
          // material-prices / etc.). Saves ~50 kB on the dashboard cold path.
          if (normalized.includes('/src/features/roadmap/')) return 'roadmap'
          // Split super-admin views — most tenant users never open these.
          if (normalized.includes('/src/features/admin/')) return 'admin'
          // Mid-size tenant views (Calendar / Vendors / POs / Analytics etc.)
          // — split these into their own chunk so the dashboard cold path stays
          // small. Analytics charts are dependency-free SVG (no chart lib).
          if (normalized.includes('/src/features/views/')) return 'views'
          // DetailView satellites (MarkupModal, ClientShareView, etc.) —
          // only loaded when a user enters project detail or clicks a share link.
          if (normalized.includes('/src/features/detail/')) return 'detail'
          // Org Admin tier (Production Phase 1) — 8 panels only the org owner sees.
          if (normalized.includes('/src/features/org/')) return 'org'
          if (!normalized.includes('/node_modules/')) return undefined
          if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/') || normalized.includes('/node_modules/scheduler/')) return 'react'
          if (normalized.includes('/node_modules/d3-')) return 'd3'
          return undefined
        }
      }
    }
  }
})
