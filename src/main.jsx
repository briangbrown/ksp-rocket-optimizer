import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import KSPMissionPlanner from "./ui/app.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <KSPMissionPlanner />
  </StrictMode>,
);
