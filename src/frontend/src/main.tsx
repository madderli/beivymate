import WorkspaceCardsDemo from "./preview/WorkspaceCardsDemo";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./AgentApp";
import SkillCenter from "./features/skills/SkillCenter";
import AgentDemo from "./preview/AgentDemo";
import WorkspaceDesignDemo from "./preview/WorkspaceDesignDemo";
import ConversationPreview from "./preview/ConversationPreview";
import "./styles.css";
import "./homepage-heading.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("ui") === "skills" ? (
      <SkillCenter page={location.hash === "#models" ? "models" : "skills"} />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "workspace-cards" ? (
      <WorkspaceCardsDemo />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "workspace" ? (
      <WorkspaceDesignDemo />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "workflows" ? (
      <SkillCenter page="workflows" />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "skills" ? (
      <SkillCenter />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "agent" ? (
      <AgentDemo />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "conversation" ? (
      <ConversationPreview />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
