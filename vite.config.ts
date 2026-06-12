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
  },
});
