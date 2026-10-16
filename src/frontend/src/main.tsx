import React from "react";
import { createRoot } from "react-dom/client";
import App from "./AgentApp";
import SkillCenter from "./features/skills/SkillCenter";
import SkillCenterDemo from "./preview/SkillCenterDemo";
import AgentDemo from "./preview/AgentDemo";
import ConversationPreview from "./preview/ConversationPreview";
import "./styles.css";
import "./homepage-heading.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("ui") === "skills" ? (
      <SkillCenter page={location.hash === "#models" ? "models" : "skills"} />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "workflows" ? (
      <SkillCenterDemo workflowDesign />
    ) : new URLSearchParams(window.location.search).get("preview") ===
      "skills" ? (
      <SkillCenterDemo />
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
