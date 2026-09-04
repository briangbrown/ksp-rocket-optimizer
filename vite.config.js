import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  /* Two pages: the application, and the engine gallery at /gallery.html —
     a review page for src/data/engine-shapes.json, not linked from the
     application and carrying nothing it needs. #85 */
  build: {
    rolldownOptions: {
      input: { main: "index.html", gallery: "gallery.html" },
    },
  },
});
