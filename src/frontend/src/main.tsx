import React from "react";
import { createRoot } from "react-dom/client";
import App from "./AgentApp";
import AgentDemo from "./preview/AgentDemo";
import ConversationPreview from "./preview/ConversationPreview";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("preview") === "agent" ? (
      <AgentDemo />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "conversation" ? (
      <ConversationPreview />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
