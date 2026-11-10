import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./AgentApp";
import "./styles.css";
import "./homepage-heading.css";

// Prototype code and data must never ship in the production application.
const PreviewApp = import.meta.env.DEV ? lazy(() => import("./preview/PreviewApp")) : null;
const params = new URLSearchParams(location.search);
const preview = PreviewApp && (params.has("preview") || params.get("ui") === "skills");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {preview && PreviewApp ? <Suspense fallback={<p>正在加载…</p>}><PreviewApp /></Suspense> : <App />}
  </React.StrictMode>,
);
