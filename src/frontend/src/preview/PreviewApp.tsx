import WorkspaceCardsDemo from "./WorkspaceCardsDemo";
import AgentDemo from "./AgentDemo";
import WorkspaceDesignDemo from "./WorkspaceDesignDemo";
import ConversationPreview from "./ConversationPreview";
import SkillCenter from "../features/skills/SkillCenter";

export default function PreviewApp() {
  const params = new URLSearchParams(location.search);
  if (params.get("ui") === "skills") return <SkillCenter page={location.hash === "#models" ? "models" : "skills"} />;
  switch (params.get("preview")) {
    case "workspace-cards": return <WorkspaceCardsDemo />;
    case "workspace": return <WorkspaceDesignDemo />;
    case "workflows": return <SkillCenter page="workflows" />;
    case "agent": return <AgentDemo />;
    case "conversation": return <ConversationPreview />;
    default: return <SkillCenter />;
  }
}
