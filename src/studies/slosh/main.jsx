import React from "react";
import { createRoot } from "react-dom/client";
import { SloshLabLoader } from "./SloshLab.jsx";

const host = document.querySelector("#slosh-lab");
if (!host) throw new Error("Slosh lab requires #slosh-lab");
createRoot(host).render(<SloshLabLoader />);
