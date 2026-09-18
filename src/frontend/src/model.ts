/** UI-facing API contracts. Business identities and states are owned by the backend. */
export type Status =
  | "running"
  | "review"
  | "blocked"
  | "pending"
  | "completed"
  | "paused"
  | "failed"
  | "queued"
  | "authorization"
  | "uncertain"
  | "stopped";
export const statusLabels: Record<Status, string> = {
  running: "执行中",
  review: "待确认",
  blocked: "被阻塞",
  pending: "待执行",
  completed: "已完成",
  paused: "已暂停",
  failed: "失败",
  queued: "排队中",
  authorization: "待授权",
  uncertain: "状态待核实",
  stopped: "已停止",
};
export type Step = {
  id: string;
  name: string;
  skill: string;
  status: Status;
  detail: string;
  review: boolean;
};
export type Attachment = { id: string; name: string; size: number };
export type Actor = {
  id: string;
  name: string;
  kind: "human" | "agent" | "system";
};
export type RunSummary = {
  id: string;
  status: Status;
  startedAt: string;
  finishedAt?: string;
};
export type Activity = {
  id: string;
  at: string;
  action: string;
  actor: Actor;
  runId?: string;
  artifactId?: string;
  artifactRevision?: string;
};
export type ConversationOperation = {
  id: string;
  context: string;
  status: "queued" | "running" | "completed" | "failed";
  message?: string;
};
export type Task = {
  runId?: string;
  runs?: RunSummary[];
  owner?: Actor;
  activities?: Activity[];
  id: string;
  title: string;
  workspace: string;
  group: string;
  main: boolean;
  status: Status;
  steps: Step[];
  description: string;
  environment: string;
  version: string;
  locale: string;
  workflow: string;
  history: string[];
  revision: string;
  attachments?: Attachment[];
  allowedActions: string[];
};
export type Workspace = {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  paused: boolean;
  knowledge: string;
  revision: string;
};
export type Workflow = {
  id: string;
  name: string;
  steps: { id: string; name: string }[];
};
export type ModelConnection = {
  id: string;
  name: string;
  capabilities: string[];
};
export type Session = {
  authenticated: boolean;
  user?: { id: string; name: string };
  csrfToken?: string;
  capabilities: string[];
};
export type Board = {
  workspaces: Workspace[];
  tasks: Task[];
  workflows: Workflow[];
  models: ModelConnection[];
};
export type Artifact = {
  id: string;
  revision: string;
  subjectHash: string;
  title: string;
  content: string;
  sources: string[];
  reviewable: boolean;
};
export type Message = { id: string; role: "user" | "assistant"; text: string };
export const emptyBoard = (): Board => ({
  workspaces: [],
  tasks: [],
  workflows: [],
  models: [],
});
