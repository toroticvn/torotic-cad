import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// opencascade.js ships a large .wasm; exclude from dep pre-bundling so it loads at runtime.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["replicad-opencascadejs"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    port: 5173,
    open: true,
    // Forward the AI endpoints to the deployed Cloudflare Functions. The browser
    // talks to localhost (plain http, no TLS inspection), while Node does the
    // HTTPS hop to Cloudflare — which works here with NODE_OPTIONS=--use-system-ca.
    // This makes the AI assistant usable on machines whose browser/AV blocks the
    // direct HTTPS POST to pages.dev. Run: NODE_OPTIONS=--use-system-ca npm run dev
    proxy: {
      "/api": {
        target: "https://torotic-cad.pages.dev",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
