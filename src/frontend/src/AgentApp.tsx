import ChatModelPicker from "./ChatModelPicker";
import { WorkspaceCard } from "./WorkspaceCard";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  FileText,
  GitBranch,
  Layers,
  ListTodo,
  Menu,
  Paperclip,
  Pause,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { api, ApiError } from "./api";
import TaskReminder from "./TaskReminder";
import ProductSidebar from "./ProductSidebar";
import { Dialog, Badge } from "./components";
import { PersonalLogin, AccountSettings } from "./Account";
import { TaskForm, WorkspaceForm } from "./forms";
import { TaskEdit } from "./TaskEdit";
import { RunPanel, RunNotifications } from "./RunPanel";
import { RoleSelection } from "./AuthLayout";
import SkillCenter from "./features/skills/SkillCenter";
import { ConfigurationLibrary } from "./ConfigurationLibrary";
import { DocumentLibrary } from "./DocumentLibrary";
import { OutputPreferences } from "./OutputPreferences";
import {
  emptyBoard,
  statusLabels,
  type Board,
  type Session,
  type Task,
  type Workspace,
  type Message,
} from "./model";
import "./preview/agent-demo.css";
import "./agent-app.css";

type Route = { page: string; id?: string };
function readRoute(): Route {
  const [page, encoded] = location.hash.slice(1).split("/");
  try {
    return {
      page: page || "start",
      id: encoded ? decodeURIComponent(encoded) : undefined,
    };
  } catch {
    return { page: "start" };
  }
}
const landingPages = ["home", "workspaces", "skills", "workflows", "analytics"];
const unfinished = (t: Task) => t.status !== "completed";
export default function AgentApp() {
  const [route, setRoute] = useState(readRoute);
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [roleChosen, setRoleChosen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState("");
  const [disableWorkspaceId, setDisableWorkspaceId] = useState("");
  const [disableError, setDisableError] = useState("");
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace>();
  const [draft, setDraft] = useState<Partial<Task>>();
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewFile, setPreviewFile] = useState<File>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatError, setChatError] = useState("");
  const [requestedRun, setRequestedRun] = useState<string>();
  const [period, setPeriod] = useState("all");
  const [metricWs, setMetricWs] = useState("all");
  const generation = useRef(0);
  const flight = useRef<Promise<void> | null>(null);
  const messageKey = useRef<
    { text: string; context: string; key: string } | undefined
  >(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const go = (page: string, id?: string) => {
    location.hash = page + (id ? "/" + encodeURIComponent(id) : "");
    setMobile(false);
  };
  const refresh = useCallback(async () => {
    if (flight.current) return flight.current;
    const token = generation.current;
    const work = (async () => {
      try {
        const s = await api.session();
        const b = s.authenticated ? await api.board() : emptyBoard();
        if (token !== generation.current) return;
        setSession(s);
        setBoard(b);
        setConnected(true);
        setError("");
      } catch (e) {
        if (token !== generation.current) return;
        setConnected(false);
        setError((e as Error).message);
        if (e instanceof ApiError && e.status === 401) {
          setSession(null);
          setBoard(emptyBoard());
        }
      }
    })();
    flight.current = work;
    try {
      await work;
    } finally {
      if (flight.current === work) flight.current = null;
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearInterval(timer);
      generation.current++;
      flight.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    const change = () => {
      setRoute(readRoute());
      setPrompt("");
      setFiles([]);
      setMessages([]);
      setChatError("");
    };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  const can = (permission: string) =>
    connected &&
    !!session?.authenticated &&
    !!session.capabilities.includes(permission);
  const task =
    route.page === "task"
      ? board.tasks.find((t) => t.id === route.id)
      : undefined;
  const workspace = board.workspaces.find(
    (w) =>
      w.id ===
      (task?.workspace || (route.page === "workspace" ? route.id : undefined)),
  );
  const [chatReady, setChatReady] = useState(false);
  const context = task
    ? `task:${task.id}`
    : workspace
      ? `workspace:${workspace.id}`
      : "global";
  const isLanding =
    landingPages.includes(route.page) || route.page === "models";
  const isChat = ["workspace", "task", "start"].includes(route.page);
  const defaultId = board.defaultWorkspace || board.workspaces[0]?.id;
  useEffect(() => {
    if (
      connected &&
      session?.authenticated &&
      roleChosen &&
      route.page === "start" &&
      defaultId
    )
      go("workspace", defaultId);
  }, [connected, session?.authenticated, roleChosen, route.page, defaultId]);
  useEffect(() => {
    let active = true;
    setMessages([]);
    if (can("chat") && isChat)
      api
        .messages(context)
        .then((m) => {
          if (active) setMessages(m);
        })
        .catch((e) => {
          if (active) setChatError(e.message);
        });
    return () => {
      active = false;
    };
  }, [context, connected, session?.authenticated, isChat]);
  async function mutate(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        setBoard(emptyBoard());
      }
    } finally {
      setBusy(false);
    }
  }
  async function newTask(copy?: Task) {
    if (copy) {
      setBusy(true);
      setError("");
      try {
        const copiedFiles = await Promise.all(
          (copy.attachments || []).map(async (attachment) => {
            const response = await fetch(
              `/api/v1/tasks/${encodeURIComponent(copy.id)}/attachments/${encodeURIComponent(attachment.id)}`,
              { credentials: "same-origin" },
            );
            if (!response.ok)
              throw new Error("复制附件失败，请重试。原任务未修改。");
            return new File([await response.blob()], attachment.name);
          }),
        );
        setFiles(copiedFiles);
      } catch (e) {
        setError((e as Error).message);
        return;
      } finally {
        setBusy(false);
      }
    }
    setDraft(
      copy
        ? { ...copy, title: `${copy.title}（副本）` }
        : { title: prompt.slice(0, 200), description: prompt },
    );
    setDialog("task");
  }
  async function send() {
    if (busy || !prompt.trim() || workspace?.paused) return;
    if (!can("chat") || files.length) {
      newTask();
      return;
    }
    const origin = location.hash;
    const text = prompt.trim();
    if (
      messageKey.current?.text !== text ||
      messageKey.current.context !== context
    )
      messageKey.current = { text, context, key: crypto.randomUUID() };
    setBusy(true);
    setChatError("");
    try {
      await api.message(context, text, "", messageKey.current.key);
      const next = await api.messages(context);
      if (location.hash === origin) {
        setMessages(next);
        setPrompt("");
        messageKey.current = undefined;
      }
    } catch (e) {
      if ((e as { status?: number }).status === 422)
        messageKey.current = undefined;
      if (location.hash === origin) setChatError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function chooseFiles(selected: File[]) {
    if (
      files.length + selected.length > 5 ||
      selected.some(
        (f) =>
          f.size > 20 * 1024 * 1024 ||
          !/\.(md|txt|pdf|docx|xlsx|png|jpe?g)$/i.test(f.name),
      )
    ) {
      setChatError(
        "最多 5 个附件，每个不超过 20 MB，支持图片、文本、PDF、Word 和 Excel。",
      );
      return;
    }
    setFiles((old) => [...old, ...selected]);
    setChatError("");
  }
  const tasksIn = (id: string) =>
    board.tasks.filter((t) => t.workspace === id && unfinished(t));
  const rows = (items: Task[]) => (
    <div className="ad-task-list">
      {items.map((t) => (
        <button key={t.id} onClick={() => go("task", t.id)}>
          <span className="ad-task-icon">
            <ListTodo size={17} />
          </span>
          <span>
            <strong>{t.title}</strong>
            <small>
              {t.workspace} ·{" "}
              {board.workflows.find((f) => f.id === t.workflow)?.name ||
                t.workflow}
              {!t.main && (
                <span className="task-relation-label">
                  <GitBranch size={12} aria-hidden="true" />
                  关联任务 · 主任务：
                  {board.tasks.find(
                    (main) => main.group === t.group && main.main,
                  )?.workspace || t.group}
                </span>
              )}
            </small>
          </span>
          {t.configurationIssue ? (
            <span className="ad-badge error">配置失效</span>
          ) : (
            <Badge status={t.status} />
          )}
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
  const filtered = board.tasks.filter(
    (t) =>
      (metricWs === "all" || t.workspace === metricWs) &&
      (period === "all" ||
        (!!t.createdAt &&
          Date.now() - Date.parse(t.createdAt) < Number(period) * 86400000)),
  );
  if (!session?.authenticated)
    return (
      <PersonalLogin
        session={session}
        connected={connected}
        connectionError={error}
        refresh={refresh}
        loggedIn={async (s) => {
          setSession(s);
          setRoleChosen(false);
          go("start");
          await refresh();
        }}
      />
    );
  if (!roleChosen)
    return (
      <RoleSelection
        busy={busy}
        error={error}
        enter={() => {
          setRoleChosen(true);
          go(defaultId ? "workspace" : "start", defaultId);
        }}
        back={() =>
          void mutate(async () => {
            await api.logout();
            setSession(null);
            setRoleChosen(false);
            go("start");
          })
        }
      />
    );
  return (
    <div className="agent-demo production-agent">
      <ProductSidebar
        activePage={route.page}
        workspaceId={workspace?.id}
        workspaces={board.workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          count: tasksIn(w.id).length,
          isDefault: defaultId === w.id,
        }))}
        taskCount={board.tasks.filter(unfinished).length}
        userName={session.user?.name || "用户"}
        mobile={mobile}
        close={() => setMobile(false)}
        navigate={go}
        openWorkspace={(id) => go("workspace", id)}
        canCreate={can("workspace.write")}
        newWorkspace={() => {
          setEditingWorkspace(undefined);
          setDialog("workspace");
        }}
        settings={() => {
          setMobile(false);
          setDialog("settings");
        }}
        account={() => {
          setMobile(false);
          setDialog("account");
        }}
        busy={busy}
        logout={() =>
          void mutate(async () => {
            await api.logout();
            generation.current++;
            flight.current = null;
            setSession(null);
            setBoard(emptyBoard());
            setRoleChosen(false);
            setFiles([]);
            setMessages([]);
            go("start");
          })
        }
      />
      <div className={`ad-shell ${isChat ? "ad-workspace-shell" : ""}`}>
        <header className={`ad-header ${isLanding ? "landing-header" : ""}`}>
          <button
            className="ad-mobile"
            aria-label="打开导航"
            aria-expanded={mobile}
            aria-controls="product-sidebar"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className={isLanding ? "header-title-hidden" : ""}>
            {isChat ? (
              <>
                <Layers size={16} />
                {workspace ? (
                  <>
                    <b className="workspace-header-id">{workspace.id}</b>
                    {workspace.name}
                  </>
                ) : (
                  "欢迎使用"
                )}
              </>
            ) : (
              (
                {
                  home: "我的任务",
                  workspaces: "工作区",
                  skills: "技能中心",
                  models: "模型配置",
                  workflows: "工作流",
                  analytics: "分析统计",
                } as Record<string, string>
              )[route.page]
            )}
          </div>
          {!isLanding && !isChat && (
            <button onClick={() => void refresh()} disabled={busy}>
              刷新
            </button>
          )}
        </header>
        {error && (
          <div className="production-notice" role="alert">
            {error}
            <button onClick={() => void refresh()}>重新连接</button>
          </div>
        )}
        <div className="ad-body">
          <main
            className={
              isChat
                ? `ad-chat-main ${!task && !messages.length ? "ad-chat-start" : ""}`
                : `ad-main ${isLanding ? "homepage-main" : ""}`
            }
          >
            {isChat && (
              <>
                <div className="ad-chat-scroll">
                  {!workspace ? (
                    <div className="ad-welcome">
                      <h1>
                        {board.workspaces.length
                          ? "工作区不可用"
                          : "创建你的第一个工作区"}
                      </h1>
                      <p>
                        {board.workspaces.length
                          ? "请从左侧选择工作区。"
                          : "按产品或项目组织任务。第一个工作区将设为默认工作区。"}
                      </p>
                      <button
                        className="ad-primary"
                        disabled={!can("workspace.write")}
                        onClick={() => {
                          setEditingWorkspace(undefined);
                          setDialog("workspace");
                        }}
                      >
                        创建工作区
                      </button>
                    </div>
                  ) : !task ? (
                    <div className="workspace-conversation-intro">
                      {workspace.paused && (
                        <div className="workspace-state-notice">
                          <Pause size={15} />
                          <span>工作区已停用，启用后可继续开展任务。</span>
                          <button
                            disabled={busy || !can("workspace.write")}
                            onClick={() =>
                              void mutate(() =>
                                api.saveWorkspace(
                                  {
                                    paused: false,
                                    expectedRevision: workspace.revision,
                                  },
                                  workspace.id,
                                ),
                              )
                            }
                          >
                            启用工作区
                          </button>
                        </div>
                      )}
                      <TaskReminder
                        tasks={tasksIn(workspace.id)}
                        workspaceName={workspace.name}
                      >
                        {tasksIn(workspace.id).length > 0 && (
                          <div
                            className="workspace-reminder-tasks"
                            role="region"
                            aria-label="继续工作任务列表"
                          >
                            {rows(tasksIn(workspace.id))}
                          </div>
                        )}
                      </TaskReminder>
                    </div>
                  ) : (
                    <div className="ad-thread">
                      <div className="ad-thread-title">
                        <span className="ad-kicker">TASK CONVERSATION</span>
                        <h1>{task.title}</h1>
                        <Badge status={task.status} />
                      </div>
                      <div className="ad-message user">
                        <span className="ad-message-avatar">你</span>
                        <div>
                          <p>{task.description || "需求见附件。"}</p>
                          {task.attachments?.map((a) => (
                            <a
                              className="production-attachment"
                              key={a.id}
                              href={`/api/v1/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(a.id)}`}
                              download
                            >
                              {a.name}
                            </a>
                          ))}
                        </div>
                      </div>
                      <div className="ad-thread-note">
                        <GitBranch size={17} />
                        {task.status === "completed"
                          ? "任务已完成，可复制配置创建新任务。"
                          : "在右侧查看执行过程、审核产物或准备运行。"}
                      </div>
                    </div>
                  )}
                  {messages.map((m) => (
                    <div className={`ad-message ${m.role}`} key={m.id}>
                      <span className="ad-message-avatar">
                        {m.role === "user" ? "你" : <Sparkles size={17} />}
                      </span>
                      <div className="workspace-message-bubble">
                        <span className="workspace-message-author">
                          {m.role === "user"
                            ? session.user?.name || "你"
                            : "OmniAlba"}
                        </span>
                        <p>{m.text}</p>
                        {m.role === "assistant" && m.model && (
                          <small>模型：{m.model}</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {workspace && (
                  <>
                    <form
                      className="ad-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                      }}
                    >
                      <div className="ad-attachments">
                        {files.map((f, i) => (
                          <div key={i}>
                            <button
                              type="button"
                              onClick={() => setPreviewFile(f)}
                            >
                              <FileText size={16} />
                              <span>{f.name}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`移除 ${f.name}`}
                              onClick={() =>
                                setFiles((fs) => fs.filter((_, j) => i !== j))
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <textarea
                        id="workspace-message-input"
                        aria-label="发送给 Ivy"
                        placeholder="告诉 OmniAlba 你想完成什么？你也可以从点击「新任务」开始…"
                        value={prompt}
                        disabled={busy || !connected || workspace.paused}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing &&
                            can("chat") &&
                            !files.length
                          ) {
                            e.preventDefault();
                            void send();
                          }
                        }}
                      />
                      <div className="ad-composer-tools">
                        {can("chat") && (
                          <ChatModelPicker
                            context={context}
                            busy={busy}
                            ready={setChatReady}
                            onError={setChatError}
                            configure={() => go("models")}
                          />
                        )}

                        <button
                          type="button"
                          disabled={
                            busy || !can("task.create") || workspace.paused
                          }
                          onClick={() => fileInput.current?.click()}
                        >
                          <Paperclip size={16} />
                          上传附件
                        </button>
                        <input
                          ref={fileInput}
                          type="file"
                          hidden
                          multiple
                          aria-label="上传图片或文字附件"
                          accept=".png,.jpg,.jpeg,.md,.txt,.pdf,.docx,.xlsx"
                          onChange={(e) => {
                            chooseFiles(Array.from(e.target.files || []));
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={
                            busy ||
                            workspace.paused ||
                            !can("task.create") ||
                            !board.workflows.length
                          }
                          onClick={() => newTask()}
                        >
                          <Plus size={16} />
                          新任务
                        </button>
                        <button
                          className="ad-send"
                          aria-label={
                            can("chat") && !files.length
                              ? "发送消息"
                              : "根据描述创建任务"
                          }
                          disabled={
                            busy ||
                            !prompt.trim() ||
                            workspace.paused ||
                            (!can("chat") && !can("task.create")) ||
                            (can("chat") && !files.length && !chatReady)
                          }
                        >
                          <ArrowUp size={20} />
                        </button>
                      </div>
                    </form>
                    {chatError && (
                      <p role="alert" className="production-chat-error">
                        {chatError}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            {route.page === "home" && (
              <>
                <div className="task-home-top">
                  <div className="ad-page-title homepage-heading">
                    <span className="ad-kicker">MY TASKS</span>
                    <h1>我的任务</h1>
                    <p>把注意力留给你需要推进的工作。</p>
                  </div>
                  <section
                    className="task-pending-statistics"
                    aria-labelledby="task-pending-statistics-title"
                  >
                    <h2
                      id="task-pending-statistics-title"
                      className="ad-section-label task-home-section-heading"
                    >
                      待完成任务
                    </h2>
                    <div
                      className="ad-status-grid task-status-grid"
                      aria-label="待完成任务状态"
                    >
                      {Object.entries(statusLabels)
                        .filter(
                          ([s]) =>
                            s !== "completed" &&
                            ([
                              "pending",
                              "running",
                              "review",
                              "paused",
                            ].includes(s) ||
                              board.tasks.some((t) => t.status === s)),
                        )
                        .map(([s, label]) => (
                          <div
                            key={s}
                            className={
                              board.tasks.some((t) => t.status === s)
                                ? ""
                                : "task-status-empty"
                            }
                          >
                            <div className="task-status-head">
                              <span>{label}</span>
                              <strong>
                                {
                                  board.tasks.filter((t) => t.status === s)
                                    .length
                                }
                              </strong>
                            </div>
                            <div className="task-status-workspaces">
                              {board.workspaces
                                .filter((w) =>
                                  tasksIn(w.id).some((t) => t.status === s),
                                )
                                .map((w) => (
                                  <button
                                    key={w.id}
                                    onClick={() => go("workspace", w.id)}
                                    title={w.name}
                                  >
                                    {w.id}{" "}
                                    <b>
                                      {
                                        tasksIn(w.id).filter(
                                          (t) => t.status === s,
                                        ).length
                                      }
                                    </b>
                                  </button>
                                ))}
                              {!board.tasks.some((t) => t.status === s) && (
                                <span className="task-status-none">
                                  暂无任务
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                </div>
                <TaskReminder tasks={board.tasks}>
                  <section
                    className="task-pending-section"
                    aria-label="待完成任务"
                  >
                    {board.workspaces
                      .filter((w) => tasksIn(w.id).length)
                      .map((w) => (
                        <details open className="ad-group" key={w.id}>
                          <summary className="task-workspace-heading">
                            <ChevronRight
                              size={14}
                              className="task-workspace-chevron"
                            />
                            <span className="task-workspace-identity">
                              <b className="task-workspace-id">{w.id}</b>
                              <span className="task-workspace-name">
                                {w.name}
                              </span>
                            </span>
                            <span className="task-workspace-count">
                              <b>{tasksIn(w.id).length}</b> 个未完成
                            </span>
                          </summary>
                          {rows(tasksIn(w.id))}
                        </details>
                      ))}
                    {!board.tasks.some(unfinished) && (
                      <div className="task-empty-list">
                        当前没有待完成任务，新的目标随时可以开始。
                      </div>
                    )}
                  </section>
                </TaskReminder>
              </>
            )}
            {route.page === "analytics" && (
              <>
                <div className="ad-page-title homepage-heading">
                  <span className="ad-kicker">ANALYTICS</span>
                  <h1>分析统计</h1>
                  <p>查看任务完成情况，了解各工作区的进展。</p>
                </div>
                <section className="task-statistics" aria-label="任务统计">
                  <div className="ad-section-label">
                    任务统计
                    <div className="ad-filters">
                      <select
                        aria-label="统计时间"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option value="all">全部时间</option>
                        <option value="7">近7天</option>
                        <option value="30">近30天</option>
                      </select>
                      <select
                        aria-label="统计工作区"
                        value={metricWs}
                        onChange={(e) => setMetricWs(e.target.value)}
                      >
                        <option value="all">全部工作区</option>
                        {board.workspaces.map((w) => (
                          <option value={w.id} key={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="ad-metrics">
                    <div>
                      <strong>{filtered.length}</strong>
                      <span>任务总数</span>
                    </div>
                    <div>
                      <strong>
                        {filtered.filter((t) => !unfinished(t)).length}
                      </strong>
                      <span>已完成</span>
                    </div>
                    <div>
                      <strong>{filtered.filter(unfinished).length}</strong>
                      <span>未完成</span>
                    </div>
                  </div>
                </section>
              </>
            )}
            {route.page === "workspaces" && (
              <>
                <div className="ad-page-title homepage-heading">
                  <span className="ad-kicker">WORKSPACES</span>
                  <h1>我的工作区</h1>
                  <p>双击卡片进入您的工作区，与 Agent 一起推进任务。</p>
                  <button
                    className="ad-primary homepage-heading-action"
                    disabled={!can("workspace.write")}
                    onClick={() => {
                      setEditingWorkspace(undefined);
                      setDialog("workspace");
                    }}
                  >
                    <Plus size={16} />
                    新建工作区
                  </button>
                </div>
                <div className="wcd-grid">
                  {board.workspaces.map((w) => (
                    <WorkspaceCard
                      key={w.id}
                      workspace={{
                        id: w.id,
                        name: w.name,
                        description: w.description ?? w.subtitle,
                        products: w.products ?? (w.product ? [w.product] : []),
                        projects: w.projects ?? (w.project ? [w.project] : []),
                        directories:
                          w.knowledgeDirectories ??
                          (w.knowledge ? [w.knowledge] : []),
                        isDefault: defaultId === w.id,
                        enabled: !w.paused,
                        pending: tasksIn(w.id).map((t) => ({
                          related: !t.main,
                        })),
                      }}
                      canManage={can("workspace.write")}
                      busy={busy}
                      editLabel={`配置 ${w.name}`}
                      edit={() => {
                        if (tasksIn(w.id).length) return;
                        setEditingWorkspace(w);
                        setDialog("workspace");
                      }}
                      toggle={() => {
                        if (w.paused)
                          void mutate(() =>
                            api.saveWorkspace(
                              { paused: false, expectedRevision: w.revision },
                              w.id,
                            ),
                          );
                        else if (!tasksIn(w.id).length) {
                          setDisableError("");
                          setDisableWorkspaceId(w.id);
                        }
                      }}
                      open={() => go("workspace", w.id)}
                    />
                  ))}
                </div>
              </>
            )}
            {["skills", "models", "workflows"].includes(route.page) && (
              <SkillCenter embedded page={route.page} navigate={go} />
            )}
          </main>
          {task && (
            <aside className="ad-execution">
              <div className="ad-execution-heading">
                <span>
                  <GitBranch size={17} />
                  工作流执行
                </span>
                <button
                  aria-label="关闭任务面板"
                  onClick={() => go("workspace", task.workspace)}
                >
                  <X size={17} />
                </button>
              </div>
              <h2>
                {board.workflows.find((f) => f.id === task.workflow)?.name ||
                  task.workflow}
              </h2>
              <Badge status={task.status} />
              {task.configurationIssue && (
                <div className="ad-error">{task.configurationIssue}</div>
              )}
              <div className="ad-steps">
                {task.steps.map((s, i) => (
                  <div
                    className={`ad-step ${s.status === "completed" ? "done" : ""}`}
                    key={s.id}
                  >
                    <span className="ad-step-number">
                      {s.status === "completed" ? <Check size={14} /> : i + 1}
                    </span>
                    <div>
                      <strong>{s.name}</strong>
                      <Badge status={s.status} />
                      <small>{s.review ? "人工确认" : "按工作流配置"}</small>
                      <small>{s.detail}</small>
                      <button
                        className="ad-document"
                        disabled={!can("task.execute") || !task.runId}
                        onClick={() =>
                          document
                            .querySelector(".ad-execution .run-panel")
                            ?.scrollIntoView({
                              block: "nearest",
                              behavior: "smooth",
                            })
                        }
                      >
                        <FileText size={14} />
                        查看运行与产物
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {can("task.execute") && (
                <RunPanel
                  key={task.id}
                  task={task}
                  requestedRun={requestedRun}
                  changed={refresh}
                />
              )}
              <div className="ad-execution-actions">
                <button
                  disabled={
                    busy || !can("task.manage") || task.status === "completed"
                  }
                  onClick={() => setDialog("edit-task")}
                >
                  <Settings2 size={15} />
                  编辑任务
                </button>
                <button
                  disabled={busy || !can("task.create")}
                  onClick={() => newTask(task)}
                >
                  <Copy size={15} />
                  复制任务
                </button>
                {task.allowedActions
                  .filter(
                    (v) =>
                      ["pause", "resume"].includes(v) &&
                      task.status !== "completed",
                  )
                  .map((verb) => (
                    <button
                      key={verb}
                      disabled={
                        busy ||
                        !can("task.manage") ||
                        (!!task.runId &&
                          !["completed", "failed", "stopped"].includes(
                            task.status,
                          ))
                      }
                      onClick={() =>
                        void mutate(() =>
                          api.action(
                            task.id,
                            verb,
                            task.revision,
                            crypto.randomUUID(),
                          ),
                        )
                      }
                    >
                      {verb === "pause" ? "暂停任务" : "恢复任务"}
                    </button>
                  ))}
              </div>
              <details className="ad-history">
                <summary>过程记录</summary>
                {task.history.map((h, i) => (
                  <p key={i}>{h}</p>
                ))}
              </details>
              <p className="ad-panel-foot">
                任务与过程文档保留。已完成任务可复制，不可重新执行。
              </p>
            </aside>
          )}
        </div>
      </div>
      {can("task.execute") && (
        <RunNotifications
          openTask={(id, run) => {
            setRequestedRun(run);
            go("task", id);
          }}
        />
      )}
      {dialog === "task" && can("task.create") && (
        <TaskForm
          board={board}
          initial={workspace?.id}
          draft={draft}
          initialFiles={files}
          close={() => setDialog("")}
          saved={refresh}
          created={(id) => {
            setPrompt("");
            setFiles([]);
            go("task", id);
          }}
        />
      )}
      {disableWorkspaceId &&
        (() => {
          const target = board.workspaces.find(
            (w) => w.id === disableWorkspaceId,
          );
          if (!target) return null;
          const pending = tasksIn(target.id).length;
          return (
            <Dialog
              title="停用工作区"
              className="wcd-confirm"
              close={() => {
                if (!busy) setDisableWorkspaceId("");
              }}
            >
              <div className="wcd-confirm-body">
                <div className="wcd-confirm-intro">
                  <span className="wcd-icon">
                    <Pause size={22} />
                  </span>
                  <section>
                    <h3>暂时停用 {target.id}？</h3>
                    <p>停用后保留工作区配置和历史资料，可随时重新启用。</p>
                  </section>
                </div>
                <div>
                  <span>{target.name}</span>
                  <b>{pending} 项未完成任务</b>
                </div>
                {pending > 0 && (
                  <p role="alert">
                    出现了未关闭任务，请先处理全部任务后再停用。
                  </p>
                )}
                {disableError && <p role="alert">{disableError}</p>}
              </div>
              <footer>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDisableWorkspaceId("")}
                >
                  取消
                </button>
                <button
                  className="primary"
                  disabled={busy || pending > 0 || !can("workspace.write")}
                  onClick={async () => {
                    setBusy(true);
                    setDisableError("");
                    try {
                      await api.saveWorkspace(
                        { paused: true, expectedRevision: target.revision },
                        target.id,
                      );
                      await refresh();
                      setDisableWorkspaceId("");
                    } catch (e) {
                      setDisableError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "停用中…" : "确认停用"}
                </button>
              </footer>
            </Dialog>
          );
        })()}
      {dialog === "workspace" && can("workspace.write") && (
        <WorkspaceForm
          workspace={editingWorkspace}
          workspaces={board.workspaces}
          tasks={board.tasks}
          isDefault={
            !board.workspaces.length || defaultId === editingWorkspace?.id
          }
          close={() => setDialog("")}
          saved={async () => {
            await refresh();
            if (!board.workspaces.length) go("start");
          }}
        />
      )}
      {dialog === "edit-task" && task && (
        <TaskEdit
          task={task}
          workflows={board.workflows}
          close={() => setDialog("")}
          saved={refresh}
        />
      )}
      {["skills", "workflows"].includes(dialog) &&
        can("configuration.manage") && (
          <ConfigurationLibrary
            initialKind={dialog as "skills" | "workflows"}
            close={() => {
              setDialog("");
              void refresh();
            }}
          />
        )}
      {dialog === "account" && (
        <Dialog title="个人账户" close={() => setDialog("")}>
          <AccountSettings session={session} changed={refresh} />
        </Dialog>
      )}
      {dialog === "documents" && can("documents.manage") && (
        <DocumentLibrary close={() => setDialog("")} />
      )}
      {dialog === "settings" && (
        <Dialog title="设置" close={() => setDialog("")}>
          <div className="ad-form">
            <button
              onClick={() => {
                setDialog("");
                go("models");
              }}
            >
              模型配置
            </button>
            <button
              disabled={!can("documents.manage")}
              onClick={() => setDialog("documents")}
            >
              产物与工作资产
            </button>
            <OutputPreferences />
          </div>
        </Dialog>
      )}
      {previewFile && (
        <FilePreview
          file={previewFile}
          close={() => setPreviewFile(undefined)}
        />
      )}
    </div>
  );
}
function FilePreview({ file, close }: { file: File; close: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  useEffect(() => {
    let active = true;
    const next = URL.createObjectURL(file);
    setUrl(next);
    if (/\.(txt|md)$/i.test(file.name))
      file
        .text()
        .then((t) => {
          if (active) setText(t);
        })
        .catch(() => {
          if (active) setText("文件读取失败");
        });
    return () => {
      active = false;
      URL.revokeObjectURL(next);
    };
  }, [file]);
  return (
    <Dialog title={file.name} close={close}>
      {/^image\//.test(file.type) ? (
        <img className="ad-file-preview" src={url} alt={file.name} />
      ) : /\.(txt|md)$/i.test(file.name) ? (
        <pre className="ad-text-preview">{text}</pre>
      ) : (
        <a href={url} download={file.name}>
          下载预览 {file.name}
        </a>
      )}
      <p className="ad-file-note">
        附件将在创建任务时保存。图片可作为参考材料保存，当前运行服务尚不解析图片内容。
      </p>
    </Dialog>
  );
}
