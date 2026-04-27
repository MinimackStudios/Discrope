import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/noto-sans";
import AppRouter from "./App";
import "./index.css";
import { applyStoredThemePreference } from "./lib/theme";

applyStoredThemePreference();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRouter />
    </BrowserRouter>
  </React.StrictMode>
);
