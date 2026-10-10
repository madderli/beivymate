import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Blocks,
  Check,
  ChevronRight,
  Copy,
  FileText,
  GitBranch,
  Layers,
  ListTodo,
  LogOut,
  Menu,
  Paperclip,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { api, ApiError, request } from "./api";
import { Brand, Dialog, Badge } from "./components";
import { PersonalLogin, AccountSettings } from "./Account";
import { TaskForm, WorkspaceForm } from "./forms";
import { TaskEdit } from "./TaskEdit";
import { RunPanel, RunNotifications } from "./RunPanel";
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
  const context = task
    ? `task:${task.id}`
    : workspace
      ? `workspace:${workspace.id}`
      : "global";
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
    if (busy || !prompt.trim()) return;
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
      <div className="agent-demo production-agent">
        <div className="ad-entry">
          <Brand />
          <div className="ad-entry-card">
            <span className="ad-kicker">YOUR EVERYDAY WORK PARTNER</span>
            <h1>今天，以什么角色开始？</h1>
            <p>选择工作角色，进入你的 Agent 工作空间。</p>
            <div className="ad-role-options">
              <button className="active">
                <Blocks size={20} />
                测试工程师
                <Check size={18} />
              </button>
              <button disabled>产品经理 · 后续开放</button>
              <button disabled>开发工程师 · 后续开放</button>
            </div>
            <button className="ad-primary" onClick={() => setRoleChosen(true)}>
              进入 Agent <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="agent-demo production-agent">
      <aside className={`ad-sidebar ${mobile ? "open" : ""}`}>
        <div className="ad-brand">
          <Brand />
        </div>
        <div className="ad-role">
          <span className="ad-role-avatar">
            <Blocks size={18} />
          </span>
          <div>
            <small>当前角色</small>
            <strong>测试工程师</strong>
          </div>
          <span className="ad-live" />
        </div>
        <nav>
          {[
            [ListTodo, "home", "我的任务"],
            [Layers, "workspaces", "工作区"],
            [Blocks, "skills", "技能（Skills）"],
            [GitBranch, "workflows", "工作流（Workflow）"],
          ].map(([Icon, page, label]) => {
            const I = Icon as typeof ListTodo;
            return (
              <button
                key={String(page)}
                className={route.page === page ? "active" : ""}
                onClick={() => go(String(page))}
              >
                <I size={18} />
                {String(label)}
              </button>
            );
          })}
        </nav>
        <div className="ad-side-heading">
          我的工作区
          <button
            aria-label="新增工作区"
            disabled={!can("workspace.write")}
            onClick={() => {
              setEditingWorkspace(undefined);
              setDialog("workspace");
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="ad-workspaces">
          {board.workspaces.map((w) => (
            <div key={w.id} className={workspace?.id === w.id ? "active" : ""}>
              <button
                onClick={() => go("workspace", w.id)}
                onDoubleClick={() => go("workspace", w.id)}
              >
                <span className="ad-folder">
                  <Layers size={15} />
                </span>
                <span>
                  {w.id} <small>({tasksIn(w.id).length})</small>
                  {defaultId === w.id && <em>默认</em>}
                </span>
              </button>
              <button
                aria-label={`设置 ${w.name}`}
                disabled={!can("workspace.write")}
                onClick={() => {
                  setEditingWorkspace(w);
                  setDialog("workspace");
                }}
              >
                <Settings2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="ad-side-bottom">
          <button onClick={() => setDialog("settings")}>
            <Settings2 size={17} />
            设置
          </button>
          <button onClick={() => setDialog("account")}>
            <span className="ad-user-avatar">
              {session.user?.name.slice(0, 1)}
            </span>
            <span>
              {session.user?.name}
              <small>个人账户</small>
            </span>
          </button>
          <button
            disabled={busy}
            onClick={() =>
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
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </aside>
      <div className={`ad-shell ${isChat ? "ad-workspace-shell" : ""}`}>
        <header className="ad-header">
          <button
            className="ad-mobile"
            aria-label="打开导航"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div>
            {isChat ? (
              <>
                <Layers size={16} />
                {workspace?.name || "欢迎使用"}
              </>
            ) : (
              (
                {
                  home: "我的任务",
                  workspaces: "工作区",
                  skills: "技能（Skills）",
                  workflows: "工作流（Workflow）",
                } as Record<string, string>
              )[route.page]
            )}
          </div>
          <button onClick={() => void refresh()} disabled={busy}>
            刷新
          </button>
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
                : "ad-main"
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
                    <div className="ad-welcome">
                      <div className="ad-welcome-heading">
                        <img src="/ivy-icon.svg" alt="Ivy" />
                        <div>
                          <h1>
                            {tasksIn(workspace.id).length
                              ? "欢迎回来，我们继续吧。"
                              : "今天，有什么需要我协助？"}
                          </h1>
                          <p>继续未完成的任务，或开始一项新任务。</p>
                        </div>
                      </div>
                      {tasksIn(workspace.id).length > 0 && (
                        <div className="ad-resume">
                          <div className="ad-section-label">
                            继续工作
                            <span>
                              {Object.entries(statusLabels)
                                .map(([state, label]) => {
                                  const n = tasksIn(workspace.id).filter(
                                    (t) => t.status === state,
                                  ).length;
                                  return n ? `${label} ${n}` : "";
                                })
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          <div
                            className="ad-resume-scroll"
                            tabIndex={0}
                            role="region"
                            aria-label="继续工作任务列表"
                          >
                            {rows(tasksIn(workspace.id))}
                          </div>
                        </div>
                      )}
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
                      <div>
                        <p>{m.text}</p>
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
                        aria-label="发送给 Ivy"
                        placeholder={
                          can("chat")
                            ? "告诉 Ivy，你想完成什么任务…"
                            : "描述任务目标，再点击「新任务」配置工作流…"
                        }
                        value={prompt}
                        disabled={busy || !connected}
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
                        <button
                          type="button"
                          disabled={busy || !can("task.create")}
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
                            (!can("chat") && !can("task.create"))
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
                    <div className="ad-composer-foot">
                      Ivy 与你协作，每一步由你掌握。
                      <span>
                        {!can("chat")
                          ? "AI 对话暂未接通 · 可通过新任务提交目标和附件"
                          : "附件通过新任务提交"}
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
            {route.page === "home" && (
              <>
                <div className="ad-page-title">
                  <span className="ad-kicker">MY TASKS</span>
                  <h1>我的任务</h1>
                  <p>把注意力留给需要你推进的工作。</p>
                </div>
                <div className="ad-section-label">需要继续处理</div>
                <div className="ad-status-grid">
                  {Object.entries(statusLabels)
                    .filter(
                      ([s]) =>
                        s !== "completed" &&
                        (["pending", "running", "review", "paused"].includes(
                          s,
                        ) ||
                          board.tasks.some((t) => t.status === s)),
                    )
                    .map(([s, label]) => (
                      <div key={s}>
                        <span>{label}</span>
                        <strong>
                          {board.tasks.filter((t) => t.status === s).length}
                        </strong>
                        <div>
                          {board.workspaces.map((w) => {
                            const n = tasksIn(w.id).filter(
                              (t) => t.status === s,
                            ).length;
                            return (
                              n > 0 && (
                                <button
                                  key={w.id}
                                  onClick={() => go("workspace", w.id)}
                                >
                                  {w.id} <b>{n}</b>
                                </button>
                              )
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
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
                <div className="ad-section-label">仍有未完成任务的工作区</div>
                {board.workspaces
                  .filter((w) => tasksIn(w.id).length)
                  .map((w) => (
                    <details open className="ad-group" key={w.id}>
                      <summary>
                        {w.name}
                        <span>{tasksIn(w.id).length} 个未完成</span>
                      </summary>
                      {rows(tasksIn(w.id))}
                    </details>
                  ))}
                {!board.tasks.some(unfinished) && <p>当前没有未完成任务。</p>}
              </>
            )}
            {route.page === "workspaces" && (
              <>
                <div className="ad-page-title">
                  <span className="ad-kicker">WORKSPACES</span>
                  <h1>工作区</h1>
                  <p>双击卡片打开工作区，与 Agent 一起推进任务。</p>
                  <button
                    className="ad-primary"
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
                <div className="ad-card-grid">
                  {board.workspaces.map((w) => (
                    <article
                      key={w.id}
                      onDoubleClick={() => go("workspace", w.id)}
                    >
                      <div className="ad-card-top">
                        <span className="ad-card-icon">
                          <Layers />
                        </span>
                        <button
                          aria-label={`配置 ${w.name}`}
                          disabled={!can("workspace.write")}
                          onClick={() => {
                            setEditingWorkspace(w);
                            setDialog("workspace");
                          }}
                        >
                          <Settings2 size={17} />
                        </button>
                      </div>
                      <h2>
                        {w.name} ({tasksIn(w.id).length})
                      </h2>
                      <p>{w.subtitle}</p>
                      <footer>
                        <span>
                          {defaultId === w.id
                            ? "默认工作区"
                            : w.paused
                              ? "已暂停"
                              : "工作区"}
                        </span>
                        <button onClick={() => go("workspace", w.id)}>
                          打开 <ChevronRight size={16} />
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
                <details className="ad-history">
                  <summary>已完成任务 · 查看历史或复制</summary>
                  {rows(board.tasks.filter((t) => !unfinished(t)))}
                </details>
              </>
            )}
            {["skills", "workflows"].includes(route.page) && (
              <>
                <div className="ad-page-title">
                  <span className="ad-kicker">AGENT CAPABILITIES</span>
                  <h1>
                    {route.page === "skills"
                      ? "技能（Skills）"
                      : "工作流（Workflow）"}
                  </h1>
                  <p>通过配置编辑器管理能力、步骤与确认方式。</p>
                  <button
                    className="ad-primary"
                    disabled={!can("configuration.manage")}
                    onClick={() => setDialog(route.page)}
                  >
                    打开{route.page === "skills" ? "技能" : "工作流"}管理
                  </button>
                </div>
                <p>
                  系统默认配置只读。可创建自定义配置，并通过 UI
                  编辑技能内容和工作流步骤。
                </p>
                {route.page === "skills" && can("configuration.manage") && (
                  <SkillCards
                    edit={() => setDialog("skills")}
                    refreshKey={dialog}
                  />
                )}
                {route.page === "workflows" && (
                  <div className="ad-card-grid">
                    {board.workflows.map((f) => (
                      <article key={f.id}>
                        <span className="ad-card-icon">
                          <GitBranch />
                        </span>
                        <h2>{f.name}</h2>
                        <p>{f.steps.map((s) => s.name).join(" → ")}</p>
                        <button
                          disabled={!can("configuration.manage")}
                          onClick={() => setDialog("workflows")}
                        >
                          编辑工作流
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </>
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
      {dialog === "workspace" && can("workspace.write") && (
        <WorkspaceForm
          workspace={editingWorkspace}
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

function SkillCards({
  edit,
  refreshKey,
}: {
  edit: () => void;
  refreshKey: string;
}) {
  const [items, setItems] = useState<
    { id: string; name: string; builtin: boolean }[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<{ items: typeof items }>("/configuration/skills")
      .then((r) => {
        if (active) {
          setItems(r.items);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="ad-card-grid">
        {items.map((s) => (
          <article key={s.id}>
            <span className="ad-card-icon">
              <Blocks />
            </span>
            <h2>{s.name}</h2>
            <p>{s.id}</p>
            <footer>
              <span>
                {s.builtin ? "系统技能 · 可创建自定义副本" : "自定义技能"}
              </span>
              <button onClick={edit}>管理</button>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
