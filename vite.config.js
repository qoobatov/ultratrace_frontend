import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/frames": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/contours": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/audio": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/textgrid": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/study": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/spectrogram": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
