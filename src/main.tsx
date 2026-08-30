import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import KSPMissionPlanner from "./ui/app.jsx";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root to mount into");

createRoot(root).render(
  <StrictMode>
    <KSPMissionPlanner />
  </StrictMode>,
);
