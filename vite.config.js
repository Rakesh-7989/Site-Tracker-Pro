import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Path aliases mirrored from tsconfig.json. Vite + Vitest read these so that
// new TypeScript code can use @/auth/* @/components/* etc. without breaking
// existing relative-path JS imports.
const r = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          // Split first-party roadmap views off the main bundle — only loaded
          // when a user navigates to a Batch 2/3 view (hierarchy / kiosks /
          // material-prices / etc.). Saves ~50 kB on the dashboard cold path.
          if (normalized.includes('/src/features/roadmap/')) return 'roadmap'
          // Split super-admin views — most tenant users never open these.
          if (normalized.includes('/src/features/admin/')) return 'admin'
          // Mid-size tenant views (Calendar / Vendors / POs / Analytics etc.)
          // — Recharts is heavy and only AnalyticsView needs it, so isolating
          // these into their own chunk shrinks the dashboard cold path further.
          if (normalized.includes('/src/features/views/')) return 'views'
          // DetailView satellites (MarkupModal, ClientShareView, etc.) —
          // only loaded when a user enters project detail or clicks a share link.
          if (normalized.includes('/src/features/detail/')) return 'detail'
          // Org Admin tier (Production Phase 1) — 8 panels only the org owner sees.
          if (normalized.includes('/src/features/org/')) return 'org'
          if (!normalized.includes('/node_modules/')) return undefined
          if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/') || normalized.includes('/node_modules/scheduler/')) return 'react'
          if (normalized.includes('/node_modules/recharts/') || normalized.includes('/node_modules/react-smooth/') || normalized.includes('/node_modules/react-transition-group/')) return 'recharts'
          if (normalized.includes('/node_modules/d3-')) return 'd3'
          return undefined
        }
      }
    }
  }
})
