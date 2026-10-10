import { useEffect, useState } from "react";
import {
  ArrowUp,
  Plus,
  ChevronDown,
  X,
  MessageCircle,
  LayoutDashboard,
  Layers,
  Settings,
  Check,
  Paperclip,
  ChevronRight,
  Bell,
} from "lucide-react";
import { Brand } from "../components";
import "./preview.css";

type Workspace = {
  id: string;
  name: string;
  status: string;
  knowledge: string;
  assets: string;
};
type Step = {
  name: string;
  state: string;
  mode: string;
  version: number;
  note?: string;
  strategy?: string;
};
type Task = {
  id: string;
  name: string;
  workspace: string;
  role: string;
  workflow: string;
  steps: Step[];
  parent?: string;
  predecessor?: string;
  jointRelease?: boolean;
  version: string;
  environment: string;
  messages: string[];
};
function dependsOn(task: Task, id: string, tasks: Task[]): boolean {
  const visited = new Set<string>();
  let current: Task | undefined = task;
  while (current?.predecessor && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.predecessor === id) return true;
    current = tasks.find((t) => t.id === current!.predecessor);
  }
  return false;
}
const roles = ["测试工程师", "产品经理", "开发工程师"];
const requirementPrompt =
  "在HIS工作区，新建一个“门诊缴费增加微信支付功能”的需求测试任务。需求见附件，使用需求验证流程完成任务。同步在CIS工作区也创建一个关联任务，同步验证这个需求。";
const releasePrompt =
  "在CIS工作区创建一个“验证门诊月度版本发布测试”任务。使用发布验证流程完成任务。";
const stateOf = (task: Task) =>
  ["待输入", "尚未执行"].includes(
    task.steps.find((s) => s.state !== "已完成")?.state || "",
  )
    ? "待执行"
    : task.steps.find((s) => s.state !== "已完成")?.state || "已完成";
const colorOf = (state: string) =>
  state === "执行中" || state === "激活"
    ? "green"
    : state === "待确认"
      ? "amber"
      : state === "已完成"
        ? "purple"
        : state === "被阻碍"
          ? "red"
          : "gray";
function Status({ value }: { value: string }) {
  return (
    <span className={`cp-status ${colorOf(value)}`}>
      <i />
      {value}
    </span>
  );
}
export default function ConversationPreview() {
  const [role, setRole] = useState(roles[0]);
  const [page, setPage] = useState("home");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    {
      id: "HIS",
      name: "医院信息系统",
      status: "激活",
      knowledge: "医院基础业务知识",
      assets: "应用管理的资产目录",
    },
    {
      id: "CIS",
      name: "临床信息系统",
      status: "激活",
      knowledge: "门诊诊疗业务知识",
      assets: "应用管理的资产目录",
    },
    {
      id: "LIS",
      name: "检验信息系统",
      status: "暂停",
      knowledge: "检验业务规范",
      assets: "应用管理的资产目录",
    },
  ]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [prompt, setPrompt] = useState("");
  const [attachment, setAttachment] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<
    { id: string; text: string }[]
  >([]);
  const [hiddenNotices, setHiddenNotices] = useState(0);
  useEffect(() => {
    if (!notifications.length) {
      setHiddenNotices(0);
      return;
    }
    const timer = window.setTimeout(
      () => setHiddenNotices(notifications.length),
      4500,
    );
    return () => window.clearTimeout(timer);
  }, [notifications]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dialog, setDialog] = useState("");
  const [artifact, setArtifact] = useState<number | null>(null);
  const [filter, setFilter] = useState("全部");
  const [statusWorkspace, setStatusWorkspace] = useState("");
  const [expandedStatuses, setExpandedStatuses] = useState<string[]>([]);
  const [period, setPeriod] = useState("本周");
  const [metricWorkspace, setMetricWorkspace] = useState("全部");
  const [navOpen, setNavOpen] = useState(false);
  const task = tasks.find((t) => t.id === selected);
  const currentWorkspace = workspaces.find(
    (w) => w.id === (task?.workspace || workspace),
  );
  const active = !currentWorkspace || currentWorkspace.status === "激活";
  const visibleTasks = tasks.filter((t) => t.role === role);
  const notify = (id: string, text: string) =>
    setNotifications((n) => [...n, { id, text }]);
  const updateTask = (id: string, change: (t: Task) => Task) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? change(t) : t)));
  const openTask = (t: Task) => {
    setSelected(t.id);
    setWorkspace(t.workspace);
    setRole(t.role);
    setPage("chat");
    setArtifact(null);
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTasks((ts) =>
        ts.map((t) => {
          if (
            t.predecessor &&
            stateOf(ts.find((other) => other.id === t.predecessor)!) !==
              "已完成"
          )
            return t;
          const index = t.steps.findIndex((s) => s.state === "执行中");
          if (index < 0) return t;
          const steps = t.steps.map((s) => ({ ...s }));
          const s = steps[index];
          s.state = s.mode === "人工确认" ? "待确认" : "已完成";
          s.note =
            s.mode === "自动确认"
              ? "模拟规则检查通过 · 已记录产物版本及确认方式"
              : "等待你检查当前版本的模拟产物";
          if (s.state === "已完成" && steps[index + 1])
            steps[index + 1].state = "执行中";
          return { ...t, steps };
        }),
      );
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);
  // Notifications are derived from transitions, independently of the currently viewed role.
  const [previous, setPrevious] = useState<Record<string, string>>({});
  useEffect(() => {
    const next = Object.fromEntries(tasks.map((t) => [t.id, stateOf(t)]));
    for (const t of tasks)
      if (
        previous[t.id] !== next[t.id] &&
        ["待确认", "已完成", "已暂停", "被阻碍"].includes(next[t.id])
      )
        notify(t.id, `${t.name} · ${next[t.id]}`);
    if (JSON.stringify(next) !== JSON.stringify(previous)) setPrevious(next);
  }, [tasks, previous]);
  function createTask(
    name: string,
    wid: string,
    workflow: string,
    related: boolean,
    text: string,
  ) {
    if (workspaces.find((w) => w.id === wid)?.status !== "激活") {
      setMessages((m) => [
        ...m,
        "助手：这个工作区尚未激活，请先在工作区管理中恢复。",
      ]);
      return;
    }
    const base = `TASK-${String(tasks.length + 1).padStart(3, "0")}`;
    const release = workflow === "发布验证流程";
    const names =
      role !== roles[0]
        ? ["工作目标理解", "工作成果编写"]
        : release
          ? ["测试计划", "测试执行", "测试报告"]
          : ["需求理解", "测试分析", "测试设计"];
    const make = (id: string, ws: string, parent?: string): Task => ({
      id,
      name,
      workspace: ws,
      role,
      workflow,
      parent,
      version: "2026.09（示例）",
      environment: release ? "UAT（示例）" : "未设置",
      messages: [
        `你：${text}`,
        `助手：已创建${ws}任务，使用${workflow}。${release ? "将模拟自动确认各步骤；测试结果包含失败项，发布仍由你决定。" : "每一步完成后等待你确认。"}${attachment ? ` 附件：${attachment}` : ""}`,
      ],
      steps: names.map((name, i) => ({
        name,
        state:
          i === 0
            ? release || attachment || role !== roles[0]
              ? "执行中"
              : "待输入"
            : "尚未执行",
        mode: release ? "自动确认" : "人工确认",
        version: 1,
        ...(["需求理解", "测试分析"].includes(name)
          ? { strategy: "标准" }
          : {}),
      })),
    });
    const main = make(`${base}-M`, wid);
    const children = related
      ? workspaces
          .filter(
            (w) => w.id !== wid && text.includes(w.id) && w.status === "激活",
          )
          .map((w, i) =>
            make(`${base}-R${String(i + 1).padStart(2, "0")}`, w.id, main.id),
          )
      : [];
    setTasks((ts) => [...ts, main, ...children]);
    openTask(main);
    setPrompt("");
    setAttachment("");
  }
  function send(text = prompt) {
    if (!text.trim()) return;
    if (task) {
      updateTask(task.id, (t) => ({
        ...t,
        messages: [
          ...t.messages,
          `你：${text}`,
          `助手：已记录到当前任务。${attachment ? "附件已加入当前步骤，可以开始模拟分析。" : "本版支持步骤确认、修改与运行控制；自由对话内容暂不调用模型。"}`,
        ],
        steps: t.steps.map((s) =>
          s.state === "待输入" && attachment ? { ...s, state: "执行中" } : s,
        ),
      }));
      setPrompt("");
      setAttachment("");
      return;
    }
    const existing = visibleTasks.filter(
      (t) => text.includes(t.id) || text.includes(t.name),
    );
    if (existing.length && !/另建|再建/.test(text)) {
      openTask(existing.find((t) => !t.parent) || existing[0]);
      setPrompt("");
      return;
    }
    if (/创建|新建/.test(text)) {
      const wid = /在\s*HIS/i.test(text)
        ? "HIS"
        : /在\s*CIS/i.test(text)
          ? "CIS"
          : workspace;
      if (!wid) {
        setMessages((m) => [
          ...m,
          `你：${text}`,
          "助手：请指定已创建的工作区，例如“在 HIS 工作区新建任务”。",
        ]);
        return;
      }
      createTask(
        text.match(/[“「"](.+?)[”」"]/)?.[1] || "新的工作任务",
        wid,
        /发布/.test(text) ? "发布验证流程" : "需求验证流程",
        /关联任务/.test(text),
        text,
      );
    } else
      setMessages((m) => [
        ...m,
        `你：${text}`,
        "助手：这是交互预览，可以选择下方示例创建任务，或通过“新建任务”设置工作流。",
      ]);
    setPrompt("");
  }
  function approve(index: number) {
    if (!task || task.steps[index].state !== "待确认") return;
    updateTask(task.id, (t) => ({
      ...t,
      steps: t.steps.map((s, i) =>
        i === index
          ? { ...s, state: "已完成", note: `体验用户已确认 v${s.version}` }
          : i === index + 1
            ? { ...s, state: "执行中" }
            : s,
      ),
    }));
    setArtifact(null);
  }
  const changeStep = (index: number, patch: Partial<Step>) =>
    task &&
    updateTask(task.id, (t) => ({
      ...t,
      steps: t.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  function navigate(next: string, wid = "") {
    setPage(next);
    setWorkspace(wid);
    setSelected("");
    setFilter("全部");
    setNavOpen(false);
  }
  const taskRows = (rows: Task[]) =>
    rows.length ? (
      <div className="cp-table">
        {rows.map((t) => (
          <button key={t.id} onClick={() => openTask(t)}>
            <span>
              <strong>{t.name}</strong>
              <small>
                {t.id} · {t.workspace} · {t.workflow}
              </small>
            </span>
            <span>
              {t.version}
              <small>{t.environment} · 中文</small>
            </span>
            <Status value={stateOf(t)} />
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    ) : (
      <div className="cp-empty">
        还没有任务。向助手描述目标，或点击“新建任务”。
      </div>
    );
  return (
    <div className="conversation-preview">
      <aside className={`cp-sidebar ${navOpen ? "open" : ""}`}>
        <Brand />
        <label className="cp-role">
          <span>工作角色</span>
          <select
            aria-label="工作身份"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setSelected("");
              setPage("home");
            }}
          >
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button
          className={page === "home" ? "chosen" : ""}
          onClick={() => navigate("home")}
        >
          <LayoutDashboard size={18} />
          我的工作
        </button>
        <button
          className={page === "workspaces" ? "chosen" : ""}
          onClick={() => navigate("workspaces")}
        >
          <Layers size={18} />
          工作区管理
        </button>
        <div className="cp-sidebar-heading">我的工作区</div>
        <div className="cp-workspace-nav">
          {workspaces.map((w) => (
            <button
              className={workspace === w.id ? "chosen" : ""}
              key={w.id}
              onClick={() => navigate("workspace", w.id)}
            >
              <span className="cp-ws-icon">{w.id[0]}</span>
              <span>
                {w.id}
                <small>{w.name}</small>
              </span>
              <i
                className={`cp-dot ${w.status === "激活" ? "green" : "gray"}`}
              />
            </button>
          ))}
        </div>
        <div className="cp-sidebar-footer">
          <button onClick={() => navigate("settings")}>
            <span className="cp-settings-icon" aria-hidden="true">
              <Settings size={14} strokeWidth={1.6} />
            </span>
            配置
          </button>
          <button onClick={() => setDialog("personal")}>
            <span className="cp-avatar">林</span>
            <span>
              体验用户<small>个人账户</small>
            </span>
            <ChevronDown size={14} />
          </button>
          <small>交互预览 · 模拟数据 · 刷新重置</small>
        </div>
      </aside>
      <div className="cp-shell">
        <header className="cp-top">
          <button
            className="cp-mobile"
            aria-label="打开导航"
            onClick={() => setNavOpen(!navOpen)}
          >
            <Layers size={20} />
          </button>
          <span>
            {role}
            <ChevronRight size={14} />
            {currentWorkspace?.id || "个人工作空间"}
            {task && (
              <>
                <ChevronRight size={14} />
                <strong>{task.name}</strong>
              </>
            )}
          </span>
          <button
            aria-label="任务通知"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={18} />
            {notifications.length > 0 && <b>{notifications.length}</b>}
          </button>
        </header>
        <div className="cp-layout">
          <main className="cp-main">
            {page === "home" && (
              <>
                <div className="cp-heading">
                  <div>
                    <p>个人工作空间</p>
                    <h1>你好，今天一起完成什么工作？</h1>
                    <span>告诉助手你的目标，工作进展和成果随时可见。</span>
                  </div>
                </div>
                <div className="cp-stats">
                  {[
                    "待执行",
                    "执行中",
                    "待确认",
                    "被阻碍",
                    "已完成",
                    "已取消",
                  ].map((s) => {
                    const matching = visibleTasks.filter(
                      (t) => stateOf(t) === s,
                    );
                    const counts = workspaces
                      .map((w) => ({
                        ...w,
                        count: matching.filter((t) => t.workspace === w.id)
                          .length,
                      }))
                      .filter((w) => w.count > 0);
                    const expanded = expandedStatuses.includes(s);
                    return (
                      <section
                        key={s}
                        aria-label={`${s}任务统计`}
                        className={`cp-status-card ${filter === s ? "selected" : ""}`}
                      >
                        <button
                          className="cp-status-total"
                          aria-label={`${s}全部任务 ${matching.length}`}
                          aria-pressed={filter === s && !statusWorkspace}
                          onClick={() => {
                            setFilter(s);
                            setStatusWorkspace("");
                          }}
                        >
                          <Status value={s} />
                          <strong>{matching.length}</strong>
                        </button>
                        <div className="cp-status-workspaces">
                          {counts.length ? (
                            (expanded ? counts : counts.slice(0, 3)).map(
                              (w) => (
                                <button
                                  key={w.id}
                                  title={w.name}
                                  aria-label={`${s} ${w.id} ${w.count}个任务`}
                                  aria-pressed={
                                    filter === s && statusWorkspace === w.id
                                  }
                                  onClick={() => {
                                    setFilter(s);
                                    setStatusWorkspace(w.id);
                                  }}
                                >
                                  <span>{w.id}</span>
                                  <b>{w.count}</b>
                                </button>
                              ),
                            )
                          ) : (
                            <small>暂无任务</small>
                          )}
                          {counts.length > 3 && (
                            <button
                              className="cp-status-expand"
                              aria-expanded={expanded}
                              onClick={() =>
                                setExpandedStatuses((values) =>
                                  expanded
                                    ? values.filter((v) => v !== s)
                                    : [...values, s],
                                )
                              }
                            >
                              {expanded
                                ? "收起"
                                : `展开 ${counts.length - 3} 个工作区`}
                            </button>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
                {filter === "全部" && visibleTasks.length > 0 && (
                  <details className="cp-recent">
                    <summary>最近任务 · {visibleTasks.length}</summary>
                    {taskRows(visibleTasks)}
                  </details>
                )}
                {filter !== "全部" && (
                  <section aria-label="筛选任务列表">
                    <div className="cp-section-heading">
                      <h2>
                        {statusWorkspace || "全部工作区"} · {filter}
                      </h2>
                      <button
                        onClick={() => {
                          setFilter("全部");
                          setStatusWorkspace("");
                        }}
                      >
                        清除筛选
                      </button>
                    </div>
                    {taskRows(
                      visibleTasks.filter(
                        (t) =>
                          stateOf(t) === filter &&
                          (!statusWorkspace || t.workspace === statusWorkspace),
                      ),
                    )}
                  </section>
                )}
              </>
            )}
            {(page === "home" || page === "chat") && (
              <section className="cp-conversation">
                <div className="cp-chat-title">
                  <span className="cp-ai">
                    <MessageCircle size={19} />
                  </span>
                  <strong>{task ? "任务对话" : "你的 AI 工作伙伴"}</strong>
                  <span className="cp-muted">
                    {task ? task.id : "从一个目标开始"}
                  </span>
                  {task && (
                    <button
                      className="cp-text-button"
                      onClick={() => navigate("home")}
                    >
                      新对话
                    </button>
                  )}
                </div>
                <div className="cp-messages">
                  {(task?.messages || messages).map((m, i) => (
                    <div
                      key={i}
                      className={m.startsWith("你：") ? "user" : "assistant"}
                    >
                      {m.replace(/^(你|助手)：/, "")}
                    </div>
                  ))}
                  {!task && messages.length === 0 && (
                    <div className="cp-welcome">
                      <h2>把目标交给我，把决定留给你。</h2>
                      <p>创建任务、查看结果、确认下一步，都可以在这里完成。</p>
                      <div className="cp-suggestions">
                        <button
                          onClick={() => {
                            setPrompt(requirementPrompt);
                            setAttachment("微信支付需求（示例附件）.md");
                          }}
                        >
                          <span>需求验证</span>
                          <strong>验证微信支付，协同 HIS 与 CIS</strong>
                          <small>关联任务 · 每步人工确认</small>
                        </button>
                        <button onClick={() => setPrompt(releasePrompt)}>
                          <span>发布验证</span>
                          <strong>验证 CIS 门诊月度版本</strong>
                          <small>计划 → 执行 → 报告 · 自动确认</small>
                        </button>
                      </div>
                    </div>
                  )}
                  {task && (
                    <div className="cp-progress-message">
                      <Status value={stateOf(task)} />
                      <span>
                        {task.steps.find((s) => s.state !== "已完成")?.name ||
                          "所有步骤已完成"}
                        {stateOf(task) === "已完成"
                          ? " · 可查看工作成果"
                          : " · 在右侧查看步骤与结果"}
                      </span>
                    </div>
                  )}
                </div>
                <form
                  className="cp-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <textarea
                    aria-label="对助手说"
                    placeholder={
                      task
                        ? "补充任务信息，或说明希望如何修改结果…"
                        : "例如：在 HIS 工作区新建一个需求验证任务…"
                    }
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  <div>
                    <label className="cp-attach">
                      <Paperclip size={17} />
                      {attachment || "添加附件"}
                      <input
                        type="file"
                        aria-label="添加附件"
                        onChange={(e) =>
                          setAttachment(e.target.files?.[0]?.name || attachment)
                        }
                      />
                    </label>
                    <small>模拟交互，不发送文件或调用模型</small>
                    <button
                      className="cp-send"
                      aria-label="发送"
                      disabled={!prompt.trim()}
                    >
                      <ArrowUp size={19} />
                    </button>
                  </div>
                </form>
              </section>
            )}
            {page === "home" && (
              <>
                {workspaces.some((w) =>
                  visibleTasks.some((t) => t.workspace === w.id),
                ) && (
                  <div className="cp-section-heading">
                    <h2>有任务的工作区</h2>
                  </div>
                )}
                <div className="cp-workspace-cards">
                  {workspaces
                    .filter((w) =>
                      visibleTasks.some((t) => t.workspace === w.id),
                    )
                    .map((w) => (
                      <button
                        key={w.id}
                        onClick={() => navigate("workspace", w.id)}
                      >
                        <span className="cp-ws-icon">{w.id}</span>
                        <Status value={w.status} />
                        <h3>{w.name}</h3>
                        <small>
                          {
                            visibleTasks.filter((t) => t.workspace === w.id)
                              .length
                          }{" "}
                          个任务 <ChevronRight size={12} />
                        </small>
                      </button>
                    ))}
                </div>
                <div className="cp-section-heading">
                  <h2>工作统计</h2>
                  <div className="cp-filters">
                    <select
                      aria-label="成果时间"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    >
                      <option>本周</option>
                      <option>本月</option>
                      <option>今天</option>
                    </select>
                    <select
                      aria-label="成果工作区"
                      value={metricWorkspace}
                      onChange={(e) => setMetricWorkspace(e.target.value)}
                    >
                      <option>全部</option>
                      {workspaces.map((w) => (
                        <option key={w.id}>{w.id}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="cp-muted">
                  {period}完成{" "}
                  {
                    visibleTasks.filter(
                      (t) =>
                        stateOf(t) === "已完成" &&
                        (metricWorkspace === "全部" ||
                          t.workspace === metricWorkspace),
                    ).length
                  }{" "}
                  个任务 · 本次预览中的工作记录
                </p>
              </>
            )}
            {(page === "workspaces" || page === "workspace") && (
              <>
                <div className="cp-heading">
                  <div>
                    <p>工作区</p>
                    <h1>
                      {currentWorkspace && page !== "workspaces"
                        ? `${currentWorkspace.id} · ${currentWorkspace.name}`
                        : "工作区管理"}
                    </h1>
                    <p>
                      {currentWorkspace && page !== "workspaces" ? (
                        <Status value={currentWorkspace.status} />
                      ) : (
                        "按产品或项目组织你的工作与知识。"
                      )}
                    </p>
                  </div>
                  {(!currentWorkspace || page === "workspaces") && (
                    <button
                      className="cp-primary"
                      onClick={() => setDialog("workspace")}
                    >
                      新增工作区
                    </button>
                  )}
                </div>
                {currentWorkspace && page !== "workspaces" ? (
                  <>
                    {!active && (
                      <div className="cp-notice">
                        工作区{currentWorkspace.status}
                        ，可以查看任务与产物。恢复激活后可创建和修改内容。
                      </div>
                    )}
                    <div className="cp-section-heading">
                      <h2>工作任务</h2>
                      <button
                        className="cp-primary"
                        disabled={!active}
                        onClick={() => setDialog("task")}
                      >
                        <Plus size={16} />
                        新建任务
                      </button>
                    </div>
                    {taskRows(
                      visibleTasks.filter((t) => t.workspace === workspace),
                    )}
                  </>
                ) : (
                  <div className="cp-workspace-list">
                    {workspaces.map((w) => (
                      <div className="cp-workspace-management" key={w.id}>
                        <button onClick={() => navigate("workspace", w.id)}>
                          <span className="cp-ws-icon">{w.id}</span>
                          <strong>{w.name}</strong>
                          <Status value={w.status} />
                          <ChevronRight size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setWorkspace(w.id);
                            setDialog("edit-workspace");
                          }}
                        >
                          配置
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {page === "settings" && (
              <>
                <div className="cp-heading">
                  <div>
                    <p>通用配置</p>
                    <h1>配置</h1>
                    <span>任务设置优先于工作区，工作区优先于通用配置。</span>
                  </div>
                </div>
                <section className="cp-settings">
                  <h2>公共工作流</h2>
                  <p>系统默认配置只读；任务中的调整仅对当前任务生效。</p>
                  {["需求验证流程", "发布验证流程"].map((w, i) => (
                    <div key={w}>
                      <h3>
                        {w}
                        <span className="cp-status gray">系统内置</span>
                      </h3>
                      <p>
                        {i
                          ? "测试计划 → 测试执行 → 测试报告"
                          : "需求理解 → 测试分析 → 测试设计"}
                      </p>
                      <small>{i ? "自动确认" : "人工确认"} · 模拟运行</small>
                    </div>
                  ))}
                  <h2>模型与技能</h2>
                  <p>
                    本次仅预览交互。未来支持技能指定模型，否则继承默认模型。
                  </p>
                  <h2>资产与知识</h2>
                  <p>
                    在工作区配置知识来源和资产位置，客户数据与系统资源分离。
                  </p>
                </section>
              </>
            )}
          </main>
          {task && page === "chat" && (
            <aside className="cp-task-panel">
              <div className="cp-section-heading">
                <h2>任务进展</h2>
                <button
                  aria-label="关闭任务面板"
                  onClick={() => navigate("workspace", task.workspace)}
                >
                  <X size={17} />
                </button>
              </div>
              <small>
                {task.id} · {task.parent ? "关联任务" : "主任务"}
              </small>
              <h3>{task.name}</h3>
              <p className="cp-muted">{task.workflow} · 中文</p>
              <div className="cp-related">
                {tasks
                  .filter(
                    (t) =>
                      t.id !== task.id &&
                      (t.parent === task.id ||
                        t.id === task.parent ||
                        (task.parent && t.parent === task.parent)),
                  )
                  .map((t) => (
                    <button key={t.id} onClick={() => openTask(t)}>
                      {t.parent ? "关联" : "主"}任务 · {t.workspace}
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </div>
              <details className="cp-link-settings">
                <summary>关联与发布设置</summary>
                <p className="cp-muted">
                  前置任务完成后才推进当前任务。共同完成是发布的必要条件，不会自动批准发布。
                </p>
                <label>
                  前置任务
                  <select
                    aria-label="前置任务"
                    value={task.predecessor || ""}
                    onChange={(e) =>
                      updateTask(task.id, (t) => ({
                        ...t,
                        predecessor: e.target.value,
                      }))
                    }
                    disabled={stateOf(task) === "已完成"}
                  >
                    <option value="">无，可并行执行</option>
                    {tasks
                      .filter(
                        (t) =>
                          t.id !== task.id &&
                          (t.parent || t.id) === (task.parent || task.id) &&
                          !dependsOn(t, task.id, tasks),
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.workspace} · {t.id}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={
                      tasks.find((t) => t.id === (task.parent || task.id))
                        ?.jointRelease || false
                    }
                    onChange={(e) =>
                      updateTask(task.parent || task.id, (t) => ({
                        ...t,
                        jointRelease: e.target.checked,
                      }))
                    }
                  />{" "}
                  所有关联任务完成后才可申请发布
                </label>
                {task.predecessor && (
                  <p className="cp-muted">等待 {task.predecessor} 完成后推进</p>
                )}
                {tasks.find((t) => t.id === (task.parent || task.id))
                  ?.jointRelease && (
                  <p className="cp-muted">
                    {tasks
                      .filter(
                        (t) => (t.parent || t.id) === (task.parent || task.id),
                      )
                      .every((t) => stateOf(t) === "已完成")
                      ? "关联任务均已完成，发布仍待人工决定。"
                      : "尚有未完成的关联任务，暂不满足发布条件。"}
                  </p>
                )}
              </details>
              <div className="cp-steps">
                {task.steps.map((s, i) => (
                  <div className="cp-step" key={s.name}>
                    <div className="cp-step-head">
                      <span>
                        {s.state === "已完成" ? <Check size={15} /> : i + 1}
                      </span>
                      <strong>{s.name}</strong>
                      <Status value={s.state} />
                    </div>
                    <div className="cp-step-body">
                      <small>
                        {s.mode}
                        {s.note ? ` · ${s.note}` : ""}
                      </small>
                      {s.strategy && (
                        <label>
                          分析策略
                          <select
                            aria-label={`${s.name}分析策略`}
                            disabled={
                              !active ||
                              !["尚未执行", "待输入"].includes(s.state)
                            }
                            value={s.strategy}
                            onChange={(e) =>
                              changeStep(i, { strategy: e.target.value })
                            }
                          >
                            <option>简要</option>
                            <option>标准</option>
                            <option>深入</option>
                          </select>
                        </label>
                      )}
                      {s.state === "待输入" && (
                        <p className="cp-muted">
                          请在对话中添加需求附件，再发送给助手。
                        </p>
                      )}
                      {["待确认", "已完成"].includes(s.state) && (
                        <button
                          className="cp-result"
                          onClick={() => setArtifact(i)}
                        >
                          查看{s.name}结果 <span>v{s.version}</span>
                          <ChevronRight size={14} />
                        </button>
                      )}
                      {s.state === "待确认" && (
                        <button
                          className="cp-primary"
                          disabled={!active}
                          onClick={() => setArtifact(i)}
                        >
                          审阅并确认
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {["执行中", "已暂停"].includes(stateOf(task)) && (
                <button
                  className="cp-secondary"
                  onClick={() =>
                    updateTask(task.id, (t) => ({
                      ...t,
                      steps: t.steps.map((s) =>
                        s.state === "执行中"
                          ? { ...s, state: "已暂停" }
                          : s.state === "已暂停" && active
                            ? { ...s, state: "执行中" }
                            : s,
                      ),
                    }))
                  }
                >
                  {stateOf(task) === "已暂停" ? "恢复任务" : "暂停任务"}
                </button>
              )}
              {!["已完成", "已取消"].includes(stateOf(task)) && (
                <button
                  onClick={() =>
                    updateTask(task.id, (t) => ({
                      ...t,
                      steps: t.steps.map((s) =>
                        s.state === "已完成" ? s : { ...s, state: "已取消" },
                      ),
                    }))
                  }
                >
                  取消任务
                </button>
              )}
              <p className="cp-muted">切换页面或角色不会暂停后台模拟任务。</p>
            </aside>
          )}
        </div>
      </div>
      {showNotifications && (
        <aside className="cp-notifications">
          <div className="cp-section-heading">
            <h3>任务通知</h3>
            <button
              disabled={!notifications.length}
              onClick={() => {
                setNotifications([]);
                setHiddenNotices(0);
              }}
            >
              清空通知
            </button>
            <button
              aria-label="关闭通知"
              onClick={() => setShowNotifications(false)}
            >
              <X size={18} />
            </button>
          </div>
          {notifications.length ? (
            notifications.map((n, i) => (
              <button
                key={i}
                onClick={() => {
                  const t = tasks.find((t) => t.id === n.id);
                  if (t) openTask(t);
                  setShowNotifications(false);
                }}
              >
                {n.text}
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <p>暂时没有通知</p>
          )}
        </aside>
      )}
      {!showNotifications && (
        <div className="cp-toasts">
          {notifications
            .slice(hiddenNotices)
            .slice(-2)
            .map((n, i) => (
              <div key={`${n.id}-${i}`}>
                <button
                  onClick={() => {
                    const t = tasks.find((t) => t.id === n.id);
                    if (t) openTask(t);
                  }}
                >
                  <Bell size={16} />
                  {n.text}
                </button>
                <button
                  aria-label="关闭提示"
                  onClick={() => setHiddenNotices(notifications.length)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
        </div>
      )}
      {(dialog || artifact !== null) && (
        <div
          className="cp-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDialog("");
              setArtifact(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              artifact !== null
                ? "工作成果"
                : dialog === "task"
                  ? "新建任务"
                  : dialog === "personal"
                    ? "个人空间"
                    : "工作区配置"
            }
            className="cp-modal"
          >
            <button
              className="cp-modal-close"
              aria-label="关闭弹窗"
              onClick={() => {
                setDialog("");
                setArtifact(null);
              }}
            >
              <X size={20} />
            </button>
            {artifact !== null && task ? (
              <>
                <p className="cp-eyebrow">
                  模拟产物 · v{task.steps[artifact].version}
                </p>
                <h2>{task.steps[artifact].name}结果</h2>
                <p>{task.name}</p>
                <div className="cp-artifact">
                  <h3>工作范围</h3>
                  <p>
                    {task.workspace} · {task.workflow} · {task.version}
                  </p>
                  <h3>本阶段结果</h3>
                  <p>
                    {task.workflow === "发布验证流程"
                      ? "模拟执行 12 个测试用例：通过 10，失败 1，阻塞 1。微信支付超时处理存在风险，联调环境尚缺一个接口凭据。"
                      : "围绕门诊支付设计正常支付、重复提交、支付超时及退款场景；明确 HIS 收费与 CIS 就诊状态之间的关联。"}
                  </p>
                  <h3>待关注事项</h3>
                  <p>
                    {task.workflow === "发布验证流程"
                      ? "需修复失败项并补充阻塞场景证据。本报告不代表批准发布。"
                      : "需确认退款时限与支付回调重试规则。以上仅为界面示例，不是真实分析结论。"}
                  </p>
                </div>
                <p className="cp-muted">{task.steps[artifact].note}</p>
                {task.steps[artifact].state === "待确认" && (
                  <div className="cp-actions">
                    <button
                      disabled={!active}
                      onClick={() => {
                        changeStep(artifact, {
                          state: "执行中",
                          version: task.steps[artifact].version + 1,
                          note: undefined,
                        });
                        setArtifact(null);
                      }}
                    >
                      要求修改 · 生成新版本
                    </button>
                    <button
                      className="cp-primary"
                      disabled={!active}
                      onClick={() => approve(artifact)}
                    >
                      确认当前版本并继续
                    </button>
                  </div>
                )}
              </>
            ) : dialog === "personal" ? (
              <>
                <h2>个人空间</h2>
                <p>体验用户 · 本地账户</p>
                <label>
                  配色方案
                  <select
                    onChange={(e) =>
                      document
                        .querySelector(".conversation-preview")
                        ?.setAttribute("data-theme", e.target.value)
                    }
                  >
                    <option value="ivy">鸢尾紫</option>
                    <option value="forest">常春藤绿</option>
                    <option value="ocean">海洋蓝</option>
                  </select>
                </label>
                <p className="cp-muted">
                  账户设置与退出登录将在连接后端时恢复。本次预览不改变实际登录状态。
                </p>
                <button
                  onClick={() => {
                    setTasks([]);
                    setNotifications([]);
                    setSelected("");
                    setMessages([]);
                    setPage("home");
                    setDialog("");
                  }}
                >
                  重置预览数据
                </button>
              </>
            ) : dialog === "task" ? (
              <>
                <h2>新建任务</h2>
                <p>先选择工作流，具体输入在对应步骤中提供。</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    createTask(
                      String(d.get("name")),
                      workspace,
                      String(d.get("workflow")),
                      false,
                      String(d.get("name")),
                    );
                    setDialog("");
                  }}
                >
                  <label>
                    任务名称
                    <input name="name" required />
                  </label>
                  <label>
                    工作流
                    <select name="workflow" aria-label="工作流">
                      <option>需求验证流程</option>
                      <option>发布验证流程</option>
                    </select>
                  </label>
                  <button className="cp-primary">创建任务</button>
                </form>
              </>
            ) : (
              <>
                <h2>
                  {dialog === "edit-workspace" ? "配置工作区" : "新建工作区"}
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    const w = {
                      id: String(d.get("id")).trim().toUpperCase(),
                      name: String(d.get("name")).trim(),
                      status: String(d.get("status")),
                      knowledge: String(d.get("knowledge")),
                      assets: String(d.get("assets")),
                    };
                    if (
                      dialog !== "edit-workspace" &&
                      workspaces.some((x) => x.id === w.id)
                    ) {
                      e.currentTarget
                        .querySelector<HTMLInputElement>("[name=id]")
                        ?.setCustomValidity("工作区简称已存在");
                      return;
                    }
                    setWorkspaces((ws) =>
                      dialog === "edit-workspace"
                        ? ws.map((x) => (x.id === currentWorkspace?.id ? w : x))
                        : [...ws, w],
                    );
                    setDialog("");
                    if (page === "workspaces") setWorkspace("");
                  }}
                >
                  <div className="cp-form-grid">
                    <label>
                      简称
                      <input
                        name="id"
                        required
                        defaultValue={
                          dialog === "edit-workspace"
                            ? currentWorkspace?.id
                            : ""
                        }
                        readOnly={dialog === "edit-workspace"}
                        onChange={(e) => e.target.setCustomValidity("")}
                      />
                    </label>
                    <label>
                      名称
                      <input
                        name="name"
                        required
                        defaultValue={
                          dialog === "edit-workspace"
                            ? currentWorkspace?.name
                            : ""
                        }
                      />
                    </label>
                    <label>
                      工作区状态
                      <select
                        name="status"
                        defaultValue={
                          dialog === "edit-workspace"
                            ? currentWorkspace?.status
                            : "激活"
                        }
                      >
                        <option>激活</option>
                        <option>暂停</option>
                        <option>关闭</option>
                      </select>
                    </label>
                    <label>
                      知识来源
                      <input
                        name="knowledge"
                        defaultValue={currentWorkspace?.knowledge || ""}
                        placeholder="本地目录或企业知识库"
                      />
                    </label>
                  </div>
                  <label>
                    资产保存位置
                    <input
                      name="assets"
                      defaultValue={
                        currentWorkspace?.assets || "应用管理的资产目录"
                      }
                    />
                  </label>
                  <p className="cp-muted">
                    仅保存到当前预览内存，不读取目录或连接企业系统。
                  </p>
                  <button className="cp-primary">保存工作区</button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
