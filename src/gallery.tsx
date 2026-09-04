import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EngineGallery from "./ui/components/gallery.jsx";

/* A second page, not linked from the application: every engine in the
   catalogue drawn under a tank, for looking at the shapes in
   src/data/engine-shapes.json against the parts they stand for. #85 */
const root = document.getElementById("root");
if (!root) throw new Error("gallery.html has no #root to mount into");

createRoot(root).render(
  <StrictMode>
    <EngineGallery />
  </StrictMode>,
);
