import React from "react";
import { createRoot } from "react-dom/client";
import "@fungi.computer/caps/styles.css";
import { GasHeatLabLoader } from "./GasHeatLab.jsx";

const host = document.querySelector("#gas-heat-lab");
if (!host) throw new Error("Gas heat lab requires #gas-heat-lab");
createRoot(host).render(<GasHeatLabLoader />);
