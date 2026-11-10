import WorkflowLibrary from "./WorkflowLibrary";
import { migrateWorkflows, isWorkflowLibrary } from "./workflow-state";
import { useLocalState, readLocal } from "../skills/local-state";
import type { Skill } from "../skills/skill-state";

// Legacy workflow persistence stays isolated until the workflow module migration.
export default function WorkflowLibraryPage({ skills }: { skills: Skill[] }) {
  const [workflows, setWorkflows] = useLocalState(
    "workflow-library", () => migrateWorkflows(readLocal("workflows", () => [])), isWorkflowLibrary,
  );
  return <WorkflowLibrary skills={skills} workflows={workflows} setWorkflows={setWorkflows} />;
}
