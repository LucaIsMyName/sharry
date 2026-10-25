import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { RouterProvider } from "react-router";
import { router } from "./router.tsx";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
createRoot(root).render(
  <StrictMode>
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>
  </StrictMode>,
);
