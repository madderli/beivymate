import {
  statusLabels,
  type Board,
  type Session,
  type Artifact,
  type Message,
} from "./model";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
let csrf: string | undefined;
function object(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    if (init.method && init.method !== "GET") {
      if (!csrf && path !== "/session")
        throw new ApiError("登录会话缺少操作凭证，请重新登录。", 401);
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    const response = await fetch("/api/v1" + path, {
      ...init,
      headers,
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError(
        "后端 API 未接通或返回格式不正确，操作没有被确认完成。",
        response.status,
      );
    const data: unknown = await response.json();
    if (!response.ok)
      throw new ApiError(
        object(data) && typeof data.message === "string"
          ? data.message
          : `请求失败（${response.status}）`,
        response.status,
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "无法连接后台服务或请求超时。结果未知，请刷新核实；不会自动重试写操作。",
    );
  } finally {
    clearTimeout(timer);
  }
}
function session(v: Session): Session {
  if (
    !object(v) ||
    typeof v.authenticated !== "boolean" ||
    !Array.isArray(v.capabilities) ||
    v.capabilities.some((c) => typeof c !== "string") ||
    (v.authenticated && (!v.user?.id || !v.user?.name || !v.csrfToken))
  )
    throw new ApiError("会话接口契约不匹配。");
  csrf = v.csrfToken;
  return v;
}
function board(v: Board): Board {
  if (
    !object(v) ||
    !Array.isArray(v.workspaces) ||
    !Array.isArray(v.tasks) ||
    !Array.isArray(v.workflows) ||
    !Array.isArray(v.models)
  )
    throw new ApiError("工作台接口契约不匹配。");
  for (const t of v.tasks)
    if (
      !t.id ||
      !t.revision ||
      !(t.status in statusLabels) ||
      !Array.isArray(t.steps) ||
      !Array.isArray(t.history) ||
      !Array.isArray(t.allowedActions) ||
      t.steps.some((s) => !(s.status in statusLabels))
    )
      throw new ApiError("任务数据不完整或状态不受支持，已停止显示旧状态。");
  return v;
}
const key = (id: string) => encodeURIComponent(id);
export const api = {
  session: async () => session(await request<Session>("/session")),
  login: async (username: string, password: string) =>
    session(
      await request<Session>("/session", {
        method: "POST",
        body: JSON.stringify({ username, password, role: "tester" }),
      }),
    ),
  logout: async () => {
    await request("/session", { method: "DELETE" });
    csrf = undefined;
  },
  board: async () => board(await request<Board>("/workbench")),
  createTask: (data: FormData, idempotencyKey: string) =>
    request<{ id: string }>("/tasks", {
      method: "POST",
      body: data,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  saveWorkspace: (body: object, id?: string) =>
    request("/workspaces" + (id ? "/" + key(id) : ""), {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(body),
    }),
  action: (
    id: string,
    action: string,
    revision: string,
    idempotencyKey: string,
  ) =>
    request(`/tasks/${key(id)}/actions`, {
      method: "POST",
      body: JSON.stringify({ action, expectedRevision: revision }),
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  artifact: (task: string, step: string, runId?: string) =>
    request<Artifact>(
      `/tasks/${key(task)}/steps/${key(step)}/artifact${runId ? `?runId=${key(runId)}` : ""}`,
    ),
  review: (
    task: string,
    step: string,
    artifact: Artifact,
    decision: string,
    comment: string,
    runId?: string,
  ) =>
    request(`/tasks/${key(task)}/steps/${key(step)}/review`, {
      method: "POST",
      body: JSON.stringify({
        runId,
        artifactId: artifact.id,
        revision: artifact.revision,
        expectedSubjectHash: artifact.subjectHash,
        decision,
        comment,
      }),
    }),
  messages: (context: string) =>
    request<Message[]>(`/conversations/${key(context)}/messages`),
  message: (
    context: string,
    text: string,
    model: string,
    idempotencyKey: string,
  ) =>
    request(`/conversations/${key(context)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, model: model || null }),
      headers: { "Idempotency-Key": idempotencyKey },
    }),
};
