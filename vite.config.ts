import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const rawAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_ANON_KEY =
  (rawAnonKey && !rawAnonKey.includes("YOUR_") && rawAnonKey.startsWith("eyJ"))
    ? rawAnonKey
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udGt4b2pkZXl6aWVtZGh5anZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNTgzNjMsImV4cCI6MjA5NTgzNDM2M30.uVGM-lUw806DyLvQw06vc7Z7Y8C1qUqMvDHqVjlyN3k";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api/supabase": {
        target: "https://nntkxojdeyziemdhyjvg.supabase.co",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/supabase/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("origin", "https://sitetrackpro.in");
            if (!proxyReq.getHeader("apikey")) {
              proxyReq.setHeader("apikey", SUPABASE_ANON_KEY);
            }
            if (!proxyReq.getHeader("authorization")) {
              proxyReq.setHeader("authorization", `Bearer ${SUPABASE_ANON_KEY}`);
            }
          });
        },
      },
      "/api/ef": {
        target: "https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ef/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("origin", "https://sitetrackpro.in");
            if (!proxyReq.getHeader("apikey")) {
              proxyReq.setHeader("apikey", SUPABASE_ANON_KEY);
            }
            if (!proxyReq.getHeader("authorization")) {
              proxyReq.setHeader("authorization", `Bearer ${SUPABASE_ANON_KEY}`);
            }
          });
        },
      },
    },
  },
});
