import { DocumentLibrary } from "./DocumentLibrary";
import { ConfigurationLibrary } from "./ConfigurationLibrary";
import { TaskEdit } from "./TaskEdit";
import { PersonalLogin, AccountSettings } from "./Account";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LogOut,
  Activity,
  ArrowDown,
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Link2,
  ListChecks,
  Menu,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, ApiError } from "./api";
import { Badge, Brand, Dialog, PageHead } from "./components";
import { TaskForm, WorkspaceForm } from "./forms";
import {
  emptyBoard,
  statusLabels,
  type Artifact,
  type Board,
  type Message,
  type Session,
  type Task,
  type Workspace,
} from "./model";
type Route = { page: string; id?: string };
function readRoute(): Route {
  const [page, id] = location.hash.slice(1).split("/");
  try {
    return {
      page: page || "home",
      id: id ? decodeURIComponent(id) : undefined,
    };
  } catch {
    return { page: "home" };
  }
}
function preference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [connection, setConnection] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(() => preference("beivy-theme") === "dark");
  const [navOpen, setNavOpen] = useState(false);
  const [agentMenu, setAgentMenu] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<
    "settings" | "personal" | null
  >(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [modal, setModal] = useState<"task" | "workspace" | "account" | null>(
    null,
  );
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Workspace>();
  const [tab, setTab] = useState("workflow");
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [comment, setComment] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatError, setChatError] = useState("");
  const [models, setModels] = useState<Record<string, string>>({});
  const [modelHelp, setModelHelp] = useState(false);
  const requestGeneration = useRef(0);
  const refreshFlight = useRef<Promise<void> | null>(null);
  const artifactGeneration = useRef(0);
  const artifactOrigin = useRef<{
    task: string;
    step: string;
    runId?: string;
  } | null>(null);
  const chatGeneration = useRef(0);
  const actionKey = useRef<{ signature: string; key: string } | null>(null);
  const messageKey = useRef<{ signature: string; key: string } | null>(null);
  const go = (page: string, id?: string) => {
    location.hash = page + (id ? "/" + encodeURIComponent(id) : "");
  };
  const authorized = connection === "ready" && !!session?.authenticated;
  const can = (capability: string) =>
    authorized && !!session?.capabilities.includes(capability);
  const refresh = useCallback(async () => {
    if (refreshFlight.current) return refreshFlight.current;
    const generation = requestGeneration.current;
    const flight = (async () => {
      try {
        const s = await api.session();
        const data = s.authenticated ? await api.board() : emptyBoard();
        if (generation !== requestGeneration.current) return;
        setSession(s);
        setBoard(data);
        setConnection("ready");
        setConnectionError("");
      } catch (e) {
        if (generation !== requestGeneration.current) return;
        setConnection("unavailable");
        if (e instanceof ApiError && e.status === 401) {
          setBoard(emptyBoard());
          setSession(null);
          setArtifact(null);
          artifactGeneration.current++;
        }
        setConnectionError((e as Error).message);
      }
    })();
    refreshFlight.current = flight;
    try {
      await flight;
    } finally {
      if (refreshFlight.current === flight) refreshFlight.current = null;
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      requestGeneration.current++;
      refreshFlight.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [session?.authenticated, refresh]);
  useEffect(() => {
    const handler = () => {
      artifactGeneration.current++;
      setRoute(readRoute());
      setNavOpen(false);
      setSelected(0);
      setTab("workflow");
      setArtifact(null);
      setQuery("");
      setFilter("all");
      setChatText("");
      setMessages([]);
    };
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("beivy-theme", dark ? "dark" : "light");
    } catch {
      /* Preferences are optional. */
    }
  }, [dark]);
  const task = board.tasks.find(
    (t) => route.page === "task" && t.id === route.id,
  );
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
  const contextName = task
    ? `${task.workspace} / ${task.title}`
    : workspace
      ? workspace.name
      : "我的工作";
  useEffect(() => {
    const generation = ++chatGeneration.current;
    setMessages([]);
    setChatError("");
    setChatText("");
    if (!chatOpen || !can("chat")) return;
    api
      .messages(context)
      .then((v) => {
        if (generation === chatGeneration.current) {
          if (!Array.isArray(v)) throw new Error("对话接口格式错误");
          setMessages(v);
        }
      })
      .catch((e) => {
        if (generation === chatGeneration.current) setChatError(e.message);
      });
    return () => {
      chatGeneration.current++;
    };
  }, [context, chatOpen, authorized, session?.capabilities.join(",")]);
  async function mutate(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 401) {
        requestGeneration.current++;
        artifactGeneration.current++;
        setArtifact(null);
        setSession(null);
        setBoard(emptyBoard());
      }
    } finally {
      setBusy(false);
    }
  }
  function action(t: Task, verb: string) {
    const signature = `${t.id}:${t.revision}:${verb}`;
    if (actionKey.current?.signature !== signature)
      actionKey.current = { signature, key: crypto.randomUUID() };
    void mutate(() =>
      api.action(t.id, verb, t.revision, actionKey.current!.key),
    );
  }
  async function openArtifact() {
    if (!task?.steps[selected]) return;
    const generation = ++artifactGeneration.current;
    const origin = {
      task: task.id,
      step: task.steps[selected].id,
      runId: task.runId,
    };
    const hash = location.hash;
    setBusy(true);
    setError("");
    try {
      const value = await api.artifact(origin.task, origin.step, origin.runId);
      if (generation !== artifactGeneration.current || location.hash !== hash)
        return;
      if (
        !value.id ||
        !value.revision ||
        !value.subjectHash ||
        typeof value.content !== "string" ||
        !Array.isArray(value.sources)
      )
        throw new Error("产物接口契约不完整。");
      artifactOrigin.current = origin;
      setArtifact(value);
      setComment("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = board.tasks.filter((t) =>
    ["review", "authorization", "blocked", "failed", "uncertain"].includes(
      t.status,
    ),
  );
  const currentTasks = board.tasks.filter(
    (t) =>
      (!workspace || t.workspace === workspace.id) &&
      (filter === "all" || t.status === filter) &&
      `${t.title} ${t.id}`.includes(query),
  );
  const taskRow = (t: Task) => (
    <button className="task-row" key={t.id} onClick={() => go("task", t.id)}>
      <span className="product-icon">{t.workspace.slice(0, 1)}</span>
      <div className="task-name">
        <strong>{t.title}</strong>
        <span>
          {t.id} {t.group && <em>{t.main ? "主任务" : "关联任务"}</em>}
        </span>
      </div>
      <span className="task-workspace">{t.workspace}</span>
      <Badge status={t.status} />
      <ChevronRight size={16} />
    </button>
  );
  const unavailable = (
    <div className="notice" role="status">
      <ShieldCheck size={18} />
      <div>
        <strong>
          {connection === "loading"
            ? "正在检查后端连接"
            : connection === "unavailable"
              ? "后台服务未连接"
              : "需要登录"}
        </strong>
        <p>
          业务操作仅在后端提供相应能力后开放。没有模型生成、模拟执行或浏览器任务数据库。
        </p>
        <button className="text-button" onClick={() => void refresh()}>
          <RefreshCw size={14} /> 重新连接
        </button>
      </div>
    </div>
  );
  if (!session?.authenticated)
    return (
      <PersonalLogin
        session={session}
        connected={connection === "ready"}
        connectionError={connectionError}
        refresh={refresh}
        loggedIn={async (s) => {
          go("home");
          setSession(s);
          await refresh();
        }}
      />
    );

  const nav = [
    ["home", "我的工作", LayoutDashboard],
    ["workspaces", "工作区", FolderKanban],
  ] as const;
  return (
    <div className={`app-shell ${chatOpen ? "chat-visible" : ""}`}>
      {navOpen && (
        <button
          className="scrim"
          aria-label="关闭导航"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${navOpen ? "mobile-open" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSidebarMenu(null);
        }}
      >
        <Brand />
        <button
          className="agent-card"
          aria-label="选择助手角色"
          aria-expanded={agentMenu}
          onClick={() => setAgentMenu(!agentMenu)}
        >
          <span className="agent-avatar">
            <Bot size={23} />
          </span>
          <div>
            <strong>测试助手</strong>
            <small>你的测试工作伙伴</small>
          </div>
          <ChevronDown size={15} />
        </button>
        {agentMenu && (
          <div className="agent-menu">
            <button onClick={() => setAgentMenu(false)}>
              ✓ 测试助手 · 当前角色
            </button>
            <button disabled>产品经理助手 · 规划中</button>
            <button disabled>开发助手 · 规划中</button>
          </div>
        )}
        <span className="nav-caption">工作台</span>
        <nav>
          {nav.map(([page, label, Icon]) => (
            <button
              key={page}
              aria-label={label}
              title={label}
              className={route.page === page ? "active" : ""}
              onClick={() => go(page)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-workspaces">
          <div className="nav-caption">
            工作区
            <button
              className="icon-button"
              aria-label="新增工作区"
              title="新增工作区"
              onClick={() => {
                setEditing(undefined);
                setModal("workspace");
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="workspace-scroll">
            {board.workspaces.map((w) => (
              <button key={w.id} onClick={() => go("workspace", w.id)}>
                <i className={`dot ${w.color}`} />
                <span>{w.id}</span>
              </button>
            ))}
            {!board.workspaces.length && (
              <p className="muted sidebar-empty">
                {authorized ? "还没有工作区" : "连接后显示工作区"}
              </p>
            )}
          </div>
        </div>
        <div className="sidebar-bottom">
          {sidebarMenu && (
            <button
              className="sidebar-dismiss"
              aria-label="关闭侧栏子菜单"
              onClick={() => setSidebarMenu(null)}
            />
          )}
          <button
            className="settings-nav sidebar-trigger"
            aria-label="设置"
            aria-expanded={sidebarMenu === "settings"}
            onClick={() =>
              setSidebarMenu(sidebarMenu === "settings" ? null : "settings")
            }
          >
            <Settings size={18} />
            <span>设置</span>
            <ChevronRight size={14} />
          </button>
          {sidebarMenu === "settings" && (
            <nav className="sidebar-submenu" aria-label="设置子菜单">
              <strong>设置</strong>
              <button
                disabled={!can("configuration.manage")}
                onClick={() => {
                  setSidebarMenu(null);
                  setConfigurationOpen(true);
                }}
              >
                技能与工作流配置
              </button>
              <button
                disabled={!can("documents.manage")}
                onClick={() => {
                  setSidebarMenu(null);
                  setDocumentsOpen(true);
                }}
              >
                产物与工作资产
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null);
                  go("knowledge");
                }}
              >
                知识管理
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null);
                  go("automation");
                }}
              >
                自动化资产
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null);
                  go("connections");
                }}
              >
                企业连接
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null);
                  setModelHelp(true);
                }}
              >
                模型策略
              </button>
            </nav>
          )}
          <button
            className="profile sidebar-trigger"
            aria-label="个人空间"
            title="个人空间"
            aria-expanded={sidebarMenu === "personal"}
            onClick={() =>
              setSidebarMenu(sidebarMenu === "personal" ? null : "personal")
            }
          >
            <span className="avatar">
              {session?.user?.name.slice(0, 1) || "人"}
            </span>
            <span>
              <strong>个人空间</strong>
              <small>{session?.user?.name}</small>
            </span>
            <ChevronRight size={14} />
          </button>
          {sidebarMenu === "personal" && (
            <nav className="sidebar-submenu" aria-label="个人空间子菜单">
              <strong>个人空间</strong>
              <button
                aria-label="个人账户设置"
                onClick={() => {
                  setSidebarMenu(null);
                  setModal("account");
                }}
              >
                账户与安全
              </button>
              <button
                onClick={() => {
                  setSidebarMenu(null);
                  go("settings");
                }}
              >
                个性化与配色
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await api.logout();
                    requestGeneration.current++;
                    refreshFlight.current = null;
                    artifactGeneration.current++;
                    setArtifact(null);
                    setSession(null);
                    setBoard(emptyBoard());
                    setModal(null);
                    setSidebarMenu(null);
                  })
                }
              >
                <LogOut size={16} />
                退出登录
              </button>
            </nav>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            aria-label="打开导航"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <button onClick={() => go("home")}>个人工作台</button>
            {workspace && (
              <>
                <ChevronRight size={13} />
                <button onClick={() => go("workspace", workspace.id)}>
                  {workspace.id}
                </button>
              </>
            )}
            {task && (
              <>
                <ChevronRight size={13} />
                <span className="crumb-task">{task.title}</span>
              </>
            )}
          </div>
          <div className="top-actions">
            {!authorized && session?.authenticated && (
              <span className="demo-label" role="status">
                连接中断 · 显示上次快照（可能过期）
              </span>
            )}
            <button
              className="icon-button"
              aria-label="切换明暗主题"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button"
              aria-label="通知"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
            </button>
            <button
              className="chat-toggle"
              onClick={() => setChatOpen(!chatOpen)}
            >
              <MessageSquare size={17} />
              <span>与助手对话</span>
            </button>
          </div>
        </header>
        {notifications && (
          <div className="notification-panel">
            <h3>需要你关注</h3>
            {pending.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  go("task", t.id);
                  setNotifications(false);
                }}
              >
                <Badge status={t.status} />
                <strong>{t.title}</strong>
              </button>
            ))}
            {!pending.length && (
              <p className="muted">
                {authorized ? "暂无待处理事项" : "连接后获取真实待办"}
              </p>
            )}
          </div>
        )}
        <main>
          {!authorized && unavailable}
          {!artifact && (error || connectionError) && (
            <div role="alert" className="notice error">
              {error || connectionError}
            </div>
          )}
          {route.page === "home" && (
            <>
              <section className="welcome">
                <div>
                  <span className="eyebrow">专注你的工作</span>
                  <h1>
                    {session?.user ? `你好，${session.user.name}` : "我的工作"}{" "}
                    <span className="greeting-spark">✦</span>
                  </h1>
                  <p>围绕真实任务推进工作，让重要的决定掌握在你手中。</p>
                </div>
                <button
                  className="primary"
                  disabled={
                    !can("task.create") ||
                    !board.workspaces.length ||
                    !board.workflows.length
                  }
                  onClick={() => setModal("task")}
                >
                  <Plus size={17} /> 新建任务
                </button>
              </section>
              <div className="stats-grid">
                {[
                  ["running", "正在执行", Activity],
                  ["review", "等待确认", CircleHelp],
                  ["blocked", "被阻塞", TriangleAlert],
                  ["completed", "已完成", Check],
                ].map(([status, label, Icon]) => {
                  const I = Icon as typeof Activity;
                  return (
                    <button
                      key={status as string}
                      className="stat-card"
                      onClick={() =>
                        setFilter(
                          filter === status ? "all" : (status as string),
                        )
                      }
                    >
                      <span>
                        {label as string}
                        <I size={19} />
                      </span>
                      <strong>
                        {authorized
                          ? board.tasks.filter((t) => t.status === status)
                              .length
                          : "—"}
                      </strong>
                      <small>
                        {authorized ? "来自后台最新快照" : "等待后台数据"}
                      </small>
                    </button>
                  );
                })}
              </div>
              {pending.length > 0 && (
                <div className="attention-card">
                  <CircleHelp />
                  <div>
                    <h3>{pending[0].title}</h3>
                    <p>存在需要你处理的事项，查看证据后再决定。</p>
                  </div>
                  <button onClick={() => go("task", pending[0].id)}>
                    查看任务 <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="section-heading">
                <h2>我的工作区</h2>
                <button
                  className="text-button"
                  onClick={() => go("workspaces")}
                >
                  全部工作区 <ArrowRight size={16} />
                </button>
              </div>
              <div className="workspace-grid">
                {board.workspaces.map((w) => (
                  <button
                    key={w.id}
                    className="workspace-card"
                    onClick={() => go("workspace", w.id)}
                  >
                    <div>
                      <span className={`product-icon ${w.color}`}>
                        {w.id.slice(0, 1)}
                      </span>
                      <strong>{w.id}</strong>
                    </div>
                    <h3>{w.name}</h3>
                    <p>{w.subtitle}</p>
                    <footer>
                      <span>
                        {board.tasks.filter((t) => t.workspace === w.id).length}{" "}
                        个任务
                      </span>
                      <span>{w.paused ? "调度已暂停" : "可用"}</span>
                    </footer>
                  </button>
                ))}
              </div>
              <section className="section">
                <div className="section-heading">
                  <h2>近期任务</h2>
                </div>
                <div className="list-toolbar">
                  <div className="filter-tabs">
                    {["all", "running", "review", "blocked"].map((s) => (
                      <button
                        key={s}
                        className={filter === s ? "active" : ""}
                        onClick={() => setFilter(s)}
                      >
                        {s === "all"
                          ? "全部"
                          : statusLabels[s as keyof typeof statusLabels]}
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <Search size={16} />
                    <input
                      aria-label="搜索任务"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索名称或编号"
                    />
                  </div>
                </div>
                <div className="task-list">
                  {currentTasks.map(taskRow)}
                  {!currentTasks.length && (
                    <div className="empty">
                      {authorized
                        ? "没有匹配的任务。"
                        : "尚未获取任务，不显示示例记录。"}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          {route.page === "workspaces" && (
            <>
              <PageHead
                title="我的工作区"
                text="产品范围与业务知识独立管理。"
                action={
                  <button
                    className="primary"
                    onClick={() => {
                      setEditing(undefined);
                      setModal("workspace");
                    }}
                  >
                    新增工作区
                  </button>
                }
              />
              <div className="workspace-grid">
                {board.workspaces.map((w) => (
                  <article className="workspace-card" key={w.id}>
                    <h2>{w.name}</h2>
                    <p>{w.subtitle}</p>
                    <button
                      className="text-button"
                      onClick={() => go("workspace", w.id)}
                    >
                      进入 {w.id} <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {!board.workspaces.length && (
                <div className="panel empty">
                  {authorized
                    ? "尚未创建工作区。"
                    : "后端连接后显示产品工作区。"}
                </div>
              )}
            </>
          )}
          {route.page === "workspace" && workspace && (
            <>
              <PageHead
                title={workspace.name}
                text={`${workspace.id} · ${workspace.subtitle}`}
                action={
                  <>
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditing(workspace);
                        setModal("workspace");
                      }}
                    >
                      配置
                    </button>
                    <button
                      className="primary"
                      disabled={
                        !can("task.create") ||
                        !board.workflows.length ||
                        !board.workspaces.length
                      }
                      onClick={() => setModal("task")}
                    >
                      新建任务
                    </button>
                  </>
                }
              />
              <div className="scope-banner">
                <BookOpen />
                <div>
                  <strong>{workspace.knowledge || "尚未配置知识来源"}</strong>
                  {workspace.configPath && (
                    <p>配置文件：{workspace.configPath}</p>
                  )}
                  <p>
                    {workspace.paused
                      ? "工作区调度已暂停"
                      : "按任务配置选择业务知识"}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={!can("workspace.write") || busy}
                  onClick={() =>
                    void mutate(() =>
                      api.saveWorkspace(
                        {
                          paused: !workspace.paused,
                          expectedRevision: workspace.revision,
                        },
                        workspace.id,
                      ),
                    )
                  }
                >
                  {workspace.paused ? "恢复工作区" : "暂停工作区"}
                </button>
              </div>
              <div className="task-list">
                {currentTasks.map(taskRow)}
                {!currentTasks.length && (
                  <div className="empty">还没有任务。</div>
                )}
              </div>
            </>
          )}
          {route.page === "task" && task && (
            <>
              <div className="task-overline">
                <span>{task.id}</span>
                {task.group && (
                  <span className="pill">
                    {task.main ? "主任务" : "关联任务"}
                  </span>
                )}
                <Badge status={task.status} />
              </div>
              <PageHead
                title={task.title}
                text={`${task.workspace} · 工作流 ${task.workflow}`}
                action={
                  <>
                    {task.allowedActions.map((verb) => (
                      <button
                        className="primary"
                        key={verb}
                        disabled={
                          !(can("task.manage") || can("task.execute")) || busy
                        }
                        onClick={() => action(task, verb)}
                      >
                        {(
                          {
                            start: "启动",
                            pause: "暂停",
                            resume: "恢复",
                            stop: "停止",
                          } as Record<string, string>
                        )[verb] || verb}
                      </button>
                    ))}
                  </>
                }
              />
              <div className="metadata">
                <span>
                  目标版本 <b>{task.version}</b>
                </span>
                <span>
                  环境 <b>{task.environment}</b>
                </span>
                <span>
                  交付语言 <b>{task.locale}</b>
                </span>
                <span>
                  记录版本 <b>{task.revision}</b>
                </span>
              </div>
              {task.group && (
                <div className="related-strip">
                  <GitBranch size={17} />
                  关联任务
                  {board.tasks
                    .filter((t) => t.group === task.group && t.id !== task.id)
                    .map((t) => (
                      <button key={t.id} onClick={() => go("task", t.id)}>
                        {t.workspace} ·{" "}
                        {t.main ? "主任务" : t.id.split("-").at(-1)}
                        <Badge status={t.status} />
                      </button>
                    ))}
                </div>
              )}
              <div className="page-tabs">
                {[
                  ["workflow", "工作流"],
                  ["artifacts", "产物"],
                  ["execution", "测试执行"],
                  ["defects", "缺陷"],
                  ["history", "活动记录"],
                  ["configuration", "配置"],
                ].map(([id, name]) => (
                  <button
                    key={id}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {tab === "workflow" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>执行流程</h2>
                      <p>
                        已完成{" "}
                        {
                          task.steps.filter((s) => s.status === "completed")
                            .length
                        }{" "}
                        / {task.steps.length} 步 · 状态由后端更新
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => void refresh()}
                    >
                      刷新状态
                    </button>
                  </div>
                  <div className="workflow-layout">
                    <section className="workflow-canvas">
                      {task.steps.map((s, i) => (
                        <div className="step-wrap" key={s.id}>
                          <button
                            className={`step-node ${selected === i ? "selected" : ""}`}
                            onClick={() => {
                              artifactGeneration.current++;
                              setArtifact(null);
                              setSelected(i);
                            }}
                          >
                            <span className={`step-number ${s.status}`}>
                              {s.status === "completed" ? (
                                <Check size={18} />
                              ) : (
                                i + 1
                              )}
                            </span>
                            <div>
                              <strong>{s.name}</strong>
                              <small>{s.detail}</small>
                            </div>
                            <Badge status={s.status} />
                          </button>
                          {i < task.steps.length - 1 && (
                            <div className="step-connector">
                              <ArrowDown size={15} />
                            </div>
                          )}
                        </div>
                      ))}
                      {!task.steps.length && <p>尚未创建执行步骤。</p>}
                    </section>
                    {task.steps[selected] && (
                      <aside className="step-detail">
                        <span className="eyebrow">STEP {selected + 1}</span>
                        <h2>{task.steps[selected].name}</h2>
                        <Badge status={task.steps[selected].status} />
                        <dl>
                          <dt>执行能力</dt>
                          <dd className="mono">{task.steps[selected].skill}</dd>
                          <dt>审核方式</dt>
                          <dd>
                            {task.steps[selected].review
                              ? "人工确认"
                              : "按工作流配置"}
                          </dd>
                          <dt>当前说明</dt>
                          <dd>{task.steps[selected].detail}</dd>
                        </dl>
                        <button
                          className="primary full"
                          disabled={
                            !can("artifact.read") ||
                            busy ||
                            !["review", "completed"].includes(
                              task.steps[selected].status,
                            )
                          }
                          onClick={() => void openArtifact()}
                        >
                          查看产物
                        </button>
                        <button
                          className="secondary full"
                          onClick={() => setChatOpen(true)}
                        >
                          与助手对话
                        </button>
                      </aside>
                    )}
                  </div>
                </>
              )}
              {tab === "artifacts" && (
                <div className="panel">
                  <h2>阶段产物</h2>
                  <p>选择工作流中的已产出步骤，查看后端保存的内容和来源。</p>
                  <button
                    className="secondary"
                    onClick={() => setTab("workflow")}
                  >
                    返回工作流
                  </button>
                </div>
              )}
              {tab === "execution" && (
                <div className="panel">
                  <h2>测试执行结果</h2>
                  <p>
                    执行矩阵及缺陷列表将在执行服务接入后显示。本页面没有模拟轮次或通过结果。
                  </p>
                  <span className="pill">功能待接入</span>
                </div>
              )}
              {tab === "defects" && (
                <section className="panel">
                  <h2>缺陷清单</h2>
                  <p>
                    等待后端缺陷服务接入。无已加载记录不代表产品没有缺陷；正式状态以对应权威系统为准。
                  </p>
                </section>
              )}
              {tab === "history" && (
                <div className="panel">
                  <h2>活动记录</h2>
                  {task.history.map((h, i) => (
                    <div key={i} className="history-item">
                      {h}
                    </div>
                  ))}
                </div>
              )}
              {tab === "configuration" && (
                <section className="panel">
                  <h2>任务配置</h2>
                  <p>{task.description || "需求通过附件提供"}</p>
                  <p>
                    工作流：
                    {board.workflows.find((w) => w.id === task.workflow)
                      ?.name || task.workflow}
                  </p>
                  <h3>需求附件</h3>
                  {task.attachments?.map((a) => (
                    <div className="attachment-row" key={a.id}>
                      <span>
                        {a.name} · {Math.ceil(a.size / 1024)} KB
                      </span>
                      <a
                        className="text-button"
                        href={`/api/v1/tasks/${encodeURIComponent(task.id)}/attachments/${encodeURIComponent(a.id)}`}
                        download
                      >
                        下载附件
                      </a>
                    </div>
                  ))}
                  {!task.attachments?.length && <p>暂无附件</p>}
                  {task.configPath && <p>配置文件：{task.configPath}</p>}
                  {task.configurationIssue && (
                    <p role="alert">{task.configurationIssue}</p>
                  )}
                  <button
                    className="secondary"
                    disabled={
                      !can("task.manage") ||
                      !["pending", "paused"].includes(task.status)
                    }
                    onClick={() => setEditingTask(task)}
                  >
                    编辑任务配置
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      !can("task.delete") ||
                      !["pending", "paused"].includes(task.status)
                    }
                    onClick={() => {
                      setError("");
                      setDeleteTask(task);
                    }}
                  >
                    删除任务
                  </button>
                </section>
              )}
            </>
          )}
          {["knowledge", "automation", "connections"].includes(route.page) && (
            <>
              <PageHead
                title={
                  route.page === "knowledge"
                    ? "知识管理"
                    : route.page === "automation"
                      ? "自动化资产"
                      : "企业连接"
                }
                text="相关功能正在逐步接入，开放后可在此管理。"
              />
              <div className="artifact-grid">
                {(route.page === "knowledge"
                  ? [
                      ["企业通用知识", "按企业权限读取共享规则"],
                      ["产品 / 项目知识", "区分通用业务与项目特殊规则"],
                      ["个人工作记忆", "个人偏好与工作记录"],
                      ["任务知识", "经确认后提取业务变更"],
                    ]
                  : route.page === "automation"
                    ? [
                        ["接口自动化", "生成、管理与执行接口测试脚本"],
                        ["网页界面自动化", "生成、管理与执行浏览器测试脚本"],
                        ["用例与脚本关联", "覆盖范围、版本与验证证据"],
                      ]
                    : [
                        ["流程工具", "工作项与状态回传"],
                        ["测试管理", "客户适配器与字段映射"],
                        ["授权与冲突", "明确授权，人工处理同步冲突"],
                      ]
                ).map(([title, text]) => (
                  <div className="panel" key={title}>
                    <span className="pill">待接入</span>
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {route.page === "settings" && (
            <>
              <PageHead
                title="个人空间"
                text="界面偏好可以本地保存，账户和业务数据由后端管理。"
              />
              {session?.authenticated && can("account.manage") && (
                <AccountSettings session={session} changed={refresh} />
              )}
              <section className="panel settings-panel">
                <h2>个性化与配色</h2>
                <p>当前用户：{session?.user?.name || "尚未登录"}</p>
                <div className="setting-row">
                  <div>
                    <strong>主题</strong>
                    <p>不影响任务状态颜色与后台执行。</p>
                  </div>
                  <button className="secondary" onClick={() => setDark(!dark)}>
                    {dark ? "使用浅色" : "使用深色"}
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>配色方案</strong>
                    <p>更多配色正在设计中；当前可切换浅色与深色主题。</p>
                  </div>
                  <div className="palette-options" aria-label="配色方案预览">
                    <span>
                      <i style={{ background: "#638878" }} />
                      常春藤 · 当前
                    </span>
                    <span>
                      <i style={{ background: "#6385b2" }} />
                      海盐蓝 · 规划中
                    </span>
                    <span>
                      <i style={{ background: "#9a86af" }} />
                      鸢尾紫 · 规划中
                    </span>
                    <span>
                      <i style={{ background: "#b89360" }} />
                      暖沙金 · 规划中
                    </span>
                  </div>
                </div>
              </section>
            </>
          )}
          {["task", "workspace"].includes(route.page) &&
            !task &&
            !workspace && (
              <div className="panel empty">
                工作对象不可用，请连接后端后刷新，或返回工作台。
              </div>
            )}
          <footer className="page-footer">
            <span>BeIvyMate · 个人工作助手</span>
          </footer>
        </main>
      </div>
      {chatOpen && (
        <aside className="chat-panel">
          <header>
            <span className="agent-avatar">
              <Bot size={20} />
            </span>
            <strong>测试助手</strong>
            <button
              className="icon-button"
              aria-label="关闭对话"
              onClick={() => setChatOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="chat-context">{contextName}</div>
          <div className="model-picker">
            <label>
              对话模型
              <select
                disabled={!can("chat")}
                value={models[context] || ""}
                onChange={(e) =>
                  setModels((m) => ({ ...m, [context]: e.target.value }))
                }
              >
                <option value="">自动策略</option>
                {board.models
                  .filter((m) => m.capabilities.includes("chat"))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <small>仅当前对话，不修改任务的技能模型策略。</small>
            <button className="text-button" onClick={() => setModelHelp(true)}>
              查看模型策略设计
            </button>
          </div>
          <div className="chat-messages">
            {!can("chat") && (
              <div className="notice">
                对话服务未接通或未授权，暂不能发送消息。不会生成固定回复。
              </div>
            )}
            {chatError && (
              <p role="alert" className="notice error">
                {chatError}
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user" ? "user-message" : "assistant-message"
                }
              >
                {m.text}
              </div>
            ))}
          </div>
          <form
            className="chat-compose"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!can("chat") || !chatText.trim()) return;
              const selectedContext = context;
              const generation = chatGeneration.current;
              const text = chatText.trim();
              const signature = JSON.stringify([
                context,
                text,
                models[context] || "",
              ]);
              if (messageKey.current?.signature !== signature)
                messageKey.current = { signature, key: crypto.randomUUID() };
              setBusy(true);
              setChatError("");
              try {
                await api.message(
                  selectedContext,
                  text,
                  models[selectedContext] || "",
                  messageKey.current.key,
                );
                const response = await api.messages(selectedContext);
                if (generation === chatGeneration.current) {
                  setMessages(response);
                  setChatText("");
                  messageKey.current = null;
                }
              } catch (e) {
                if (generation === chatGeneration.current)
                  setChatError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="sr-only" htmlFor="chat-input">
              发送消息
            </label>
            <textarea
              id="chat-input"
              disabled={!can("chat") || busy}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="围绕当前工作对象交流…"
            />
            <div>
              <small>操作遵循后端授权与确认规则</small>
              <button
                className="primary icon-button"
                aria-label="发送消息"
                disabled={!can("chat") || busy || !chatText.trim()}
              >
                <Send size={17} />
              </button>
            </div>
          </form>
        </aside>
      )}
      {modal === "task" && can("task.create") && (
        <TaskForm
          board={board}
          initial={workspace?.id}
          close={() => setModal(null)}
          saved={refresh}
        />
      )}
      {editingTask && (
        <TaskEdit
          task={editingTask}
          workflows={board.workflows}
          close={() => setEditingTask(null)}
          saved={refresh}
        />
      )}
      {documentsOpen && (
        <DocumentLibrary close={() => setDocumentsOpen(false)} />
      )}
      {configurationOpen && (
        <ConfigurationLibrary close={() => setConfigurationOpen(false)} />
      )}
      {deleteTask && (
        <Dialog
          title="删除任务"
          close={() => {
            if (!busy) setDeleteTask(null);
          }}
        >
          <div className="dialog-body">
            <p>
              删除“{deleteTask.title}
              ”后将从任务列表移除，已有记录保留归档，编号不会重复使用。不会同时删除关联任务。
            </p>
            {error && <p role="alert">{error}</p>}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDeleteTask(null)}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate(async () => {
                  await api.action(
                    deleteTask.id,
                    "delete",
                    deleteTask.revision,
                    crypto.randomUUID(),
                  );
                  setDeleteTask(null);
                  go("home");
                })
              }
            >
              确认删除
            </button>
          </div>
        </Dialog>
      )}
      {modal === "account" && session?.authenticated && (
        <Dialog title="个人账户" close={() => setModal(null)}>
          <div className="dialog-body">
            {can("account.manage") ? (
              <AccountSettings
                session={session}
                changed={async () => {
                  await refresh();
                }}
              />
            ) : (
              <p>账户设置暂时不可用，请确认连接与权限后重试。</p>
            )}
          </div>
        </Dialog>
      )}
      {modal === "workspace" && !can("workspace.write") && (
        <Dialog title="新增工作区" close={() => setModal(null)}>
          <div className="dialog-body">
            <p>当前连接或账户权限不允许管理工作区，请检查连接后重试。</p>
            <button className="primary" onClick={() => setModal(null)}>
              知道了
            </button>
          </div>
        </Dialog>
      )}
      {modal === "workspace" && can("workspace.write") && (
        <WorkspaceForm
          workspace={editing}
          close={() => setModal(null)}
          saved={refresh}
        />
      )}
      {artifact && task && (
        <Dialog
          title={artifact.title}
          close={() => {
            if (!busy) setArtifact(null);
          }}
        >
          <div className="dialog-body">
            {(error || connectionError) && (
              <p role="alert" className="notice error">
                {error || connectionError}
              </p>
            )}
            <span className="pill">产物版本 {artifact.revision}</span>
            <article className="document plain-document">
              {artifact.content}
            </article>
            <h3>来源与证据</h3>
            {artifact.sources.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
            <p className="muted">
              确认绑定当前产物版本与内容指纹，由后端验证。
            </p>
            {artifact.reviewable && (
              <>
                <label>
                  审核意见
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <div className="dialog-actions">
                  {[
                    ["rejected", "要求修改"],
                    ["approved", "确认当前版本"],
                  ].map(([decision, label]) => (
                    <button
                      key={decision}
                      className={
                        decision === "approved" ? "primary" : "secondary"
                      }
                      disabled={!can("artifact.review") || busy}
                      onClick={() =>
                        void mutate(async () => {
                          await api.review(
                            artifactOrigin.current!.task,
                            artifactOrigin.current!.step,
                            artifact,
                            decision,
                            comment,
                            artifactOrigin.current?.runId,
                          );
                          setArtifact(null);
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}
      {modelHelp && (
        <Dialog title="模型选择与策略" close={() => setModelHelp(false)}>
          <div className="dialog-body">
            <p>连接由配置管理，用户只能选择已经验证且获授权的模型。</p>
            <p>
              步骤显式选择 → 任务技能策略 →
              角色默认策略。能力、上下文和数据权限是硬约束。
            </p>
            <p>
              聊天模型只影响当前会话。任务启动前解析模型并保存运行
              快照，不静默跨供应商切换。
            </p>
            <div className="notice">模型策略由后台服务统一执行。</div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
