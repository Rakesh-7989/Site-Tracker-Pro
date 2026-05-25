import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
