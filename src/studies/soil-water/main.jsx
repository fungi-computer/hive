import React from "react";
import { createRoot } from "react-dom/client";
import "@fungi.computer/caps/styles.css";
import { SoilWaterLabLoader } from "./SoilWaterLab.jsx";

const host = document.querySelector("#soil-water-lab");
if (!host) throw new Error("Soil water lab requires #soil-water-lab");
createRoot(host).render(<SoilWaterLabLoader />);
