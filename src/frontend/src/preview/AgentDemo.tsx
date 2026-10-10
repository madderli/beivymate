import { useEffect, useState } from "react";
import {
  Paperclip,
  ArrowUp,
  Plus,
  ChevronRight,
  X,
  Settings2,
  PanelLeftClose,
  ListTodo,
  Layers,
  Blocks,
  GitBranch,
  Copy,
  Pause,
  Play,
  Check,
  Sparkles,
  ArrowRight,
  FileText,
  Menu,
  LogOut,
} from "lucide-react";
import { Brand, Dialog } from "../components";
import "./agent-demo.css";

type Step = { name: string; skill: string; human: boolean };
type Flow = {
  id: string;
  name: string;
  steps: Step[];
  paused?: boolean;
  deleted?: boolean;
};
type Skill = {
  id: string;
  name: string;
  instructions: string;
  deleted?: boolean;
};
type Attachment = { id: string; name: string; image: boolean };
type Task = {
  id: string;
  name: string;
  ws: string;
  flow: string;
  steps: Step[];
  state: string;
  index: number;
  date: string;
  messages: { who: string; text: string; attachments?: Attachment[] }[];
};
type Workspace = { id: string; name: string; description: string };
type Data = {
  workspaces: Workspace[];
  defaultWs: string;
  skills: Skill[];
  flows: Flow[];
  tasks: Task[];
};
const storageKey = "beivymate-agent-design-demo-v1";
const initialSteps: Step[] = [
  { name: "需求理解", skill: "s1", human: true },
  { name: "测试分析", skill: "s2", human: true },
  { name: "测试设计", skill: "s3", human: true },
];
const today = () => new Date().toISOString();
const id = () => crypto.randomUUID();
function initialData(empty = false): Data {
  return {
    workspaces: empty
      ? []
      : [
          {
            id: "his",
            name: "HIS 医院信息系统",
            description: "门诊、住院与支付业务测试",
          },
          {
            id: "cis",
            name: "CIS 临床信息系统",
            description: "临床诊疗与医嘱业务测试",
          },
          {
            id: "lis",
            name: "LIS 检验信息系统",
            description: "检验业务与报告验证",
          },
        ],
    defaultWs: empty ? "" : "his",
    skills: initialSteps.map((s, i) => ({
      id: s.skill,
      name: s.name,
      instructions: [
        "梳理需求范围、业务规则与待澄清问题。",
        "分析测试范围、风险和覆盖策略。",
        "生成包含前置条件、步骤和预期结果的测试用例。",
      ][i],
    })),
    flows: [
      {
        id: "f1",
        name: "需求验证工作流",
        steps: structuredClone(initialSteps),
      },
    ],
    tasks: empty
      ? []
      : [
          {
            id: "T-001",
            name: "门诊微信支付 · 需求验证",
            ws: "his",
            flow: "f1",
            steps: structuredClone(initialSteps),
            state: "待确认",
            index: 0,
            date: today(),
            messages: [
              {
                who: "user",
                text: "请帮我验证门诊新增微信支付功能，重点关注支付异常和重复扣款。",
              },
              {
                who: "assistant",
                text: "需求理解已完成。我梳理了支付发起、结果查询、退款三个场景，以及超时和重复回调风险。请在右侧查看过程文档，确认后我将继续测试分析。",
              },
            ],
          },
          {
            id: "T-002",
            name: "住院结算回归测试",
            ws: "his",
            flow: "f1",
            steps: structuredClone(initialSteps),
            state: "待执行",
            index: 0,
            date: today(),
            messages: [],
          },
          {
            id: "T-003",
            name: "医嘱审核边界测试",
            ws: "cis",
            flow: "f1",
            steps: structuredClone(initialSteps),
            state: "已暂停",
            index: 0,
            date: today(),
            messages: [],
          },
          {
            id: "T-004",
            name: "患者信息查询验证",
            ws: "his",
            flow: "f1",
            steps: structuredClone(initialSteps),
            state: "已完成",
            index: 3,
            date: new Date(Date.now() - 864000000).toISOString(),
            messages: [],
          },
        ],
  };
}
function readData(): Data {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : initialData();
  } catch {
    return initialData();
  }
}
export default function AgentDemo() {
  const [data, setData] = useState<Data>(readData);
  const [stage, setStage] = useState("login");
  const [role, setRole] = useState("测试工程师");
  const [page, setPage] = useState("chat");
  const [ws, setWs] = useState(data.defaultWs);
  const [selected, setSelected] = useState("");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  async function attachFiles(files: File[]) {
    setUploading(true);
    try {
      const accepted: Attachment[] = [];
      const contents: Record<string, string> = {};
      for (const file of files.slice(0, 5 - attachments.length)) {
        const isImage = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
        if (
          (!isImage && !/\.(txt|md|csv|json|log)$/i.test(file.name)) ||
          file.size > 5 * 1024 * 1024
        ) {
          setNotice(
            "支持 PNG、JPG、WebP、GIF 图片及 TXT、Markdown、CSV、JSON、LOG 文本；每个文件不超过 5 MB。",
          );
          continue;
        }
        const item = { id: id(), name: file.name, image: isImage };
        contents[item.id] = isImage
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("读取失败"));
              reader.readAsDataURL(file);
            })
          : await file.text();
        accepted.push(item);
      }
      if (files.length + attachments.length > 5)
        setNotice("每条消息最多添加 5 个附件。");
      setFileContents((c) => ({ ...c, ...contents }));
      setAttachments((a) => [...a, ...accepted]);
    } catch {
      setNotice("附件读取失败，请重新选择文件。");
    } finally {
      setUploading(false);
    }
  }
  const attachmentCards = (items: Attachment[], removable = false) => (
    <div className="ad-attachments">
      {items.map((a) => (
        <div key={a.id}>
          <button
            type="button"
            onClick={() => setPreviewFile(a)}
            aria-label={`预览 ${a.name}`}
          >
            {a.image && fileContents[a.id] ? (
              <img src={fileContents[a.id]} alt="" />
            ) : (
              <FileText size={18} />
            )}
            <span>{a.name}</span>
          </button>
          {removable && (
            <button
              type="button"
              aria-label={`移除 ${a.name}`}
              onClick={() =>
                setAttachments((xs) => xs.filter((x) => x.id !== a.id))
              }
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
  const [dialog, setDialog] = useState("");
  const [editId, setEditId] = useState("");
  const [notice, setNotice] = useState("");
  const [period, setPeriod] = useState("全部时间");
  const [filterWs, setFilterWs] = useState("all");
  const [mobile, setMobile] = useState(false);
  const [artifact, setArtifact] = useState(-1);
  const task = data.tasks.find((t) => t.id === selected);
  const workspace = data.workspaces.find((w) => w.id === ws);
  const invalidSteps = (steps: Step[]) =>
    steps.some((s) => !data.skills.some((k) => k.id === s.skill && !k.deleted));
  const invalid = (t: Task) =>
    !data.flows.some((f) => f.id === t.flow && !f.deleted) ||
    invalidSteps(t.steps);
  const blocked = (t: Task) =>
    invalid(t) || !!data.flows.find((f) => f.id === t.flow)?.paused;
  const pending = (wid: string) =>
    data.tasks.filter((t) => t.ws === wid && t.state !== "已完成");
  const updateTask = (tid: string, patch: Partial<Task>) =>
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === tid ? { ...t, ...patch } : t)),
    }));
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      setNotice("浏览器存储不可用，本次修改仅在当前页面保留。");
    }
  }, [data]);
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => {
            const f = d.flows.find((f) => f.id === t.flow);
            if (
              t.state !== "执行中" ||
              !f ||
              f.deleted ||
              f.paused ||
              t.steps.some(
                (s) => !d.skills.some((k) => k.id === s.skill && !k.deleted),
              )
            )
              return t;
            if (t.steps[t.index]?.human) return { ...t, state: "待确认" };
            const next = t.index + 1;
            return {
              ...t,
              index: next,
              state: next === t.steps.length ? "已完成" : "执行中",
            };
          }),
        })),
      2500,
    );
    return () => clearInterval(timer);
  }, []);
  function openWorkspace(wid: string) {
    setWs(wid);
    setSelected("");
    setPage("chat");
    setMobile(false);
  }
  function openTask(t: Task) {
    setSelected(t.id);
    setWs(t.ws);
    setPage("chat");
    setArtifact(-1);
  }
  function modal(kind: string, target = "") {
    setDialog(kind);
    setEditId(target);
  }
  function createTask(text: string, flowId?: string, forceNew = false) {
    if (uploading || (!text.trim() && !attachments.length)) return;
    text =
      text.trim() || `分析附件：${attachments.map((a) => a.name).join("、")}`;
    if (task && !forceNew) {
      updateTask(task.id, {
        messages: [
          ...task.messages,
          { who: "user", text, attachments: [...attachments] },
          {
            who: "assistant",
            text: "已记录你的补充要求。此 demo 使用模拟执行，请通过右侧工作流查看、确认和继续任务。",
          },
        ],
      });
    } else {
      const flow = data.flows.find(
        (f) =>
          (!flowId || f.id === flowId) &&
          !f.deleted &&
          !f.paused &&
          !invalidSteps(f.steps),
      );
      if (!flow) {
        setNotice("没有可用工作流，请先在 Workflow 中配置有效的 Skill。");
        return;
      }
      const t: Task = {
        id: id(),
        name: text.trim(),
        ws,
        flow: flow.id,
        steps: structuredClone(flow.steps),
        state: "待执行",
        index: 0,
        date: today(),
        messages: [
          { who: "user", text, attachments: [...attachments] },
          {
            who: "assistant",
            text: `已为你创建任务，并配置「${flow.name}」。你可以在右侧调整每一步的确认方式，准备好后点击“开始任务”。`,
          },
        ],
      };
      setData((d) => ({ ...d, tasks: [...d.tasks, t] }));
      openTask(t);
    }
    setPrompt("");
    setAttachments([]);
    setDialog("");
  }
  function copyTask(t: Task) {
    const copied = {
      ...structuredClone(t),
      id: id(),
      name: `${t.name}（副本）`,
      state: "待执行",
      index: 0,
      date: today(),
      messages: [
        {
          who: "assistant",
          text: "已复制任务配置，执行记录与过程文档保留在原任务中。请检查配置后开始。",
        },
      ],
    };
    setData((d) => ({ ...d, tasks: [...d.tasks, copied] }));
    openTask(copied);
    if (invalid(t))
      setNotice("副本保留了失效引用，请编辑任务并替换工作流或 Skill 后执行。");
  }
  const badge = (t: Task) => (
    <span
      className={`ad-badge ${invalid(t) ? "error" : t.state === "待确认" ? "amber" : t.state === "执行中" ? "green" : ""}`}
    >
      {invalid(t) ? "配置失效" : t.state}
    </span>
  );
  const rows = (tasks: Task[]) => (
    <div className="ad-task-list">
      {tasks.map((t) => (
        <button key={t.id} onClick={() => openTask(t)}>
          <span className="ad-task-icon">
            <ListTodo size={17} />
          </span>
          <span>
            <strong>{t.name}</strong>
            <small>
              {data.workspaces.find((w) => w.id === t.ws)?.name} ·{" "}
              {data.flows.find((f) => f.id === t.flow)?.name}
            </small>
          </span>
          {badge(t)}
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
  const navigate = (p: string) => {
    setPage(p);
    setSelected("");
    setMobile(false);
  };
  const filtered = data.tasks.filter(
    (t) =>
      (filterWs === "all" || t.ws === filterWs) &&
      (period === "全部时间" ||
        Date.now() - Date.parse(t.date) <
          (period === "近7天" ? 7 : 30) * 86400000),
  );
  return (
    <div className="agent-demo">
      {stage !== "app" ? (
        <div className="ad-entry">
          <Brand />
          <div className="ad-entry-card">
            <span className="ad-kicker">YOUR EVERYDAY WORK PARTNER</span>
            <h1>
              {stage === "login"
                ? "把目标交给 Ivy，\n让工作向前一步。"
                : "今天，以什么角色开始？"}
            </h1>
            <p>
              {stage === "login"
                ? "从一句对话开始，让每个任务都有清晰的过程与成果。"
                : "Agent 将围绕你的角色组织任务、技能与工作流。"}
            </p>
            {stage === "login" ? (
              <>
                <label>
                  体验账号
                  <input defaultValue="林晓 · 测试团队" aria-label="体验账号" />
                </label>
                <button className="ad-primary" onClick={() => setStage("role")}>
                  体验登录 <ArrowRight size={17} />
                </button>
                <small>交互 Demo · 模拟登录，无需输入真实密码</small>
              </>
            ) : (
              <>
                <div className="ad-role-options">
                  {["测试工程师", "产品经理", "开发工程师"].map((r) => (
                    <button
                      disabled={r !== "测试工程师"}
                      className={role === r ? "active" : ""}
                      key={r}
                      onClick={() => setRole(r)}
                    >
                      <Blocks size={20} />
                      {r}
                      <small>
                        {r === "测试工程师"
                          ? "需求理解 / 测试分析 / 测试设计"
                          : "后续设计"}
                      </small>
                      {role === r && <Check size={18} />}
                    </button>
                  ))}
                </div>
                <button
                  className="ad-primary"
                  onClick={() => {
                    setStage("app");
                    openWorkspace(data.defaultWs);
                    if (!data.workspaces.length) modal("workspace");
                  }}
                >
                  进入 Agent <ArrowRight size={17} />
                </button>
                <button
                  onClick={() => {
                    const d = initialData(true);
                    setData(d);
                    setWs("");
                    setStage("app");
                    modal("workspace");
                  }}
                >
                  体验首次使用：创建第一个工作区
                </button>
              </>
            )}
          </div>
          <span className="ad-entry-foot">
            BeIvyMate / 与你一起，把工作做好
          </span>
        </div>
      ) : (
        <>
          <aside className={`ad-sidebar ${mobile ? "open" : ""}`}>
            <div className="ad-brand">
              <Brand />
              <button aria-label="收起导航" onClick={() => setMobile(false)}>
                <PanelLeftClose size={17} />
              </button>
            </div>
            <div className="ad-role">
              <span className="ad-role-avatar">
                <Blocks size={18} />
              </span>
              <div>
                <small>当前角色</small>
                <strong>{role}</strong>
              </div>
              <span className="ad-live" />
            </div>
            <nav>
              {[
                [ListTodo, "tasks", "我的任务"],
                [Layers, "workspaces", "工作区"],
                [Blocks, "skills", "技能（Skills）"],
                [GitBranch, "flows", "工作流（Workflow）"],
              ].map(([Icon, p, label]) => {
                const I = Icon as typeof ListTodo;
                return (
                  <button
                    key={String(p)}
                    className={page === p ? "active" : ""}
                    onClick={() => navigate(String(p))}
                  >
                    <I size={18} />
                    {String(label)}
                    {p === "tasks" && (
                      <small>
                        {data.tasks.filter((t) => t.state !== "已完成").length}
                      </small>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="ad-side-heading">
              我的工作区
              <button
                aria-label="新增工作区"
                onClick={() => modal("workspace")}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="ad-workspaces">
              {data.workspaces.map((w) => (
                <div
                  className={ws === w.id && page === "chat" ? "active" : ""}
                  key={w.id}
                >
                  <button
                    onDoubleClick={() => openWorkspace(w.id)}
                    onClick={() => openWorkspace(w.id)}
                  >
                    <span className="ad-folder">
                      <Layers size={15} />
                    </span>
                    <span>
                      {w.name.split(" ")[0]}{" "}
                      <small>({pending(w.id).length})</small>
                      {data.defaultWs === w.id && <em>默认</em>}
                    </span>
                  </button>
                  <button
                    aria-label={`设置 ${w.name}`}
                    onClick={() => modal("workspace", w.id)}
                  >
                    <Settings2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="ad-side-bottom">
              <div className="ad-demo-label">
                <span />
                设计预览 · 模拟执行
              </div>
              <button onClick={() => setStage("login")}>
                <span className="ad-user-avatar">林</span>
                <span>
                  林晓<small>个人账户</small>
                </span>
                <LogOut size={16} />
              </button>
            </div>
          </aside>
          <div
            className={`ad-shell ${page === "chat" ? "ad-workspace-shell" : ""}`}
          >
            <header className="ad-header">
              <button
                className="ad-mobile"
                aria-label="打开导航"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={20} />
              </button>
              <div>
                {page === "chat" ? (
                  <>
                    <Layers size={16} />
                    {workspace?.name || "欢迎使用"}
                  </>
                ) : (
                  <>
                    <span>个人工作空间</span>
                    <ChevronRight size={14} />
                    {
                      (
                        {
                          tasks: "我的任务",
                          workspaces: "工作区",
                          skills: "技能（Skills）",
                          flows: "工作流（Workflow）",
                        } as Record<string, string>
                      )[page]
                    }
                  </>
                )}
              </div>
            </header>
            <div className="ad-body">
              <main
                className={
                  page === "chat"
                    ? `ad-chat-main ${!task ? "ad-chat-start" : ""}`
                    : "ad-main"
                }
              >
                {page === "chat" && (
                  <>
                    <div className="ad-chat-scroll">
                      {!task ? (
                        <div className="ad-welcome">
                          <div className="ad-welcome-heading">
                            <img src="/ivy-icon.svg" alt="Ivy" />
                            <div>
                              <h1>
                                {pending(ws).length
                                  ? "欢迎回来，我们继续吧。"
                                  : "今天，有什么需要我协助？"}
                              </h1>
                              <p>继续未完成的任务，或开始一项新任务。</p>
                            </div>
                          </div>
                          {pending(ws).length > 0 ? (
                            <div className="ad-resume">
                              <div className="ad-section-label">
                                继续工作
                                <span>
                                  {["待确认", "执行中", "待执行", "已暂停"]
                                    .map((state) => {
                                      const count = pending(ws).filter(
                                        (t) => t.state === state,
                                      ).length;
                                      return count ? `${state} ${count}` : null;
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
                                {rows(pending(ws))}
                              </div>
                            </div>
                          ) : (
                            <div className="ad-prompts">
                              {[
                                "分析一份新需求",
                                "设计核心场景测试用例",
                                "制定回归测试计划",
                              ].map((s, i) => (
                                <button key={s} onClick={() => setPrompt(s)}>
                                  <span>0{i + 1}</span>
                                  {s}
                                  <ArrowRight size={16} />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="ad-thread">
                          <div className="ad-thread-title">
                            <span className="ad-kicker">TASK CONVERSATION</span>
                            <h1>{task.name}</h1>
                            {badge(task)}
                          </div>
                          {task.messages.map((m, i) => (
                            <div key={i} className={`ad-message ${m.who}`}>
                              <span className="ad-message-avatar">
                                {m.who === "user" ? (
                                  "林"
                                ) : (
                                  <Sparkles size={17} />
                                )}
                              </span>
                              <div>
                                <small>{m.who === "user" ? "你" : "Ivy"}</small>
                                <p>{m.text}</p>
                                {m.attachments &&
                                  attachmentCards(m.attachments)}
                              </div>
                            </div>
                          ))}
                          <div className="ad-thread-note">
                            <GitBranch size={17} />
                            <span>
                              {task.state === "已完成"
                                ? "任务已完成，过程文档已保留。可复制配置创建新任务。"
                                : "工作流与确认操作在右侧，过程始终可见。"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <form
                      className="ad-composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        createTask(prompt);
                      }}
                    >
                      {attachmentCards(attachments, true)}
                      <textarea
                        aria-label="发送给 Ivy"
                        placeholder={
                          task
                            ? "补充任务要求，或告诉 Ivy 你的想法…"
                            : "告诉 Ivy，你想完成什么任务…"
                        }
                        value={prompt}
                        disabled={!workspace}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            createTask(prompt);
                          }
                        }}
                      />
                      <div className="ad-composer-tools">
                        <label
                          className="ad-upload"
                          aria-disabled={uploading || !workspace}
                        >
                          <Paperclip size={17} />
                          <span>{uploading ? "读取中…" : "上传附件"}</span>
                          <input
                            type="file"
                            aria-label="上传图片或文字附件"
                            multiple
                            accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json,.log"
                            disabled={uploading || !workspace}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              e.target.value = "";
                              void attachFiles(files);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={!workspace || uploading}
                          onClick={() => modal("new-task")}
                        >
                          <Plus size={16} />
                          新任务
                        </button>
                        <button
                          className="ad-send"
                          aria-label="发送消息"
                          disabled={
                            (!prompt.trim() && !attachments.length) ||
                            !workspace ||
                            uploading
                          }
                        >
                          <ArrowUp size={20} />
                        </button>
                      </div>
                    </form>
                    <div className="ad-composer-foot">
                      Ivy 与你协作，每一步由你掌握。
                      <span>Demo · 对话与执行均为模拟</span>
                    </div>
                  </>
                )}
                {page === "tasks" && (
                  <>
                    <div className="ad-page-title">
                      <span className="ad-kicker">MY TASKS</span>
                      <h1>我的任务</h1>
                      <p>把注意力留给需要你推进的工作。</p>
                    </div>
                    <div className="ad-section-label">
                      需要继续处理 <span>按状态查看 · 不含已完成</span>
                    </div>
                    <div className="ad-status-grid">
                      {["待执行", "执行中", "待确认", "已暂停"].map((s) => (
                        <div key={s}>
                          <span>{s}</span>
                          <strong>
                            {data.tasks.filter((t) => t.state === s).length}
                          </strong>
                          <div>
                            {data.workspaces.map((w) => {
                              const n = pending(w.id).filter(
                                (t) => t.state === s,
                              ).length;
                              return (
                                n > 0 && (
                                  <button
                                    key={w.id}
                                    onClick={() => {
                                      setFilterWs(w.id);
                                      setNotice(
                                        `${w.name} · ${s}：${n} 个任务`,
                                      );
                                    }}
                                  >
                                    {w.name.split(" ")[0]} <b>{n}</b>
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
                          {["全部时间", "近7天", "近30天"].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                        <select
                          aria-label="统计工作区"
                          value={filterWs}
                          onChange={(e) => setFilterWs(e.target.value)}
                        >
                          <option value="all">全部工作区</option>
                          {data.workspaces.map((w) => (
                            <option key={w.id} value={w.id}>
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
                          {filtered.filter((t) => t.state === "已完成").length}
                        </strong>
                        <span>已完成</span>
                      </div>
                      <div>
                        <strong>
                          {filtered.filter((t) => t.state !== "已完成").length}
                        </strong>
                        <span>未完成</span>
                      </div>
                      <div>
                        <strong>
                          {filtered.length
                            ? Math.round(
                                (filtered.filter((t) => t.state === "已完成")
                                  .length /
                                  filtered.length) *
                                  100,
                              )
                            : 0}
                          %
                        </strong>
                        <span>完成率</span>
                      </div>
                    </div>
                    <div className="ad-section-label">
                      仍有未完成任务的工作区
                    </div>
                    {data.workspaces
                      .filter((w) => pending(w.id).length)
                      .map((w) => (
                        <details className="ad-group" key={w.id} open>
                          <summary>
                            {w.name}
                            <span>{pending(w.id).length} 个未完成</span>
                          </summary>
                          {rows(pending(w.id))}
                        </details>
                      ))}
                    {!data.tasks.some((t) => t.state !== "已完成") && (
                      <p>当前没有未完成任务。</p>
                    )}
                  </>
                )}
                {page === "workspaces" && (
                  <>
                    <div className="ad-page-title">
                      <span className="ad-kicker">WORKSPACES</span>
                      <h1>工作区</h1>
                      <p>
                        每个工作区，都是一个专注的协作空间。双击卡片进入 Agent。
                      </p>
                      <button
                        className="ad-primary"
                        onClick={() => modal("workspace")}
                      >
                        <Plus size={16} />
                        新建工作区
                      </button>
                    </div>
                    <div className="ad-card-grid">
                      {data.workspaces.map((w) => (
                        <article
                          key={w.id}
                          onDoubleClick={() => openWorkspace(w.id)}
                        >
                          <div className="ad-card-top">
                            <span className="ad-card-icon">
                              <Layers />
                            </span>
                            <button
                              aria-label={`配置 ${w.name}`}
                              onClick={() => modal("workspace", w.id)}
                            >
                              <Settings2 size={17} />
                            </button>
                          </div>
                          <h2>
                            {w.name} ({pending(w.id).length})
                          </h2>
                          <p>{w.description}</p>
                          <footer>
                            <span>
                              {w.id === data.defaultWs
                                ? "默认工作区"
                                : "工作区"}
                            </span>
                            <button onClick={() => openWorkspace(w.id)}>
                              打开 <ArrowRight size={16} />
                            </button>
                          </footer>
                        </article>
                      ))}
                    </div>
                    <details className="ad-history">
                      <summary>已完成任务 · 只读记录，可复制创建新任务</summary>
                      {rows(data.tasks.filter((t) => t.state === "已完成"))}
                    </details>
                  </>
                )}
                {(page === "skills" || page === "flows") && (
                  <>
                    <div className="ad-page-title">
                      <span className="ad-kicker">AGENT CAPABILITIES</span>
                      <h1>
                        {page === "skills" ? "Skill 技能库" : "Workflow 工作流"}
                      </h1>
                      <p>
                        {page === "skills"
                          ? "定义 Agent 的工作能力，让每一次执行有据可依。"
                          : "把技能组织成流程。模板默认人工确认，任务可以独立覆盖。"}
                      </p>
                      <button
                        className="ad-primary"
                        onClick={() =>
                          modal(page === "skills" ? "skill" : "flow")
                        }
                      >
                        <Plus size={16} />
                        {page === "skills" ? "新增 Skill" : "新增 Workflow"}
                      </button>
                    </div>
                    <div className="ad-card-grid">
                      {page === "skills"
                        ? data.skills
                            .filter((s) => !s.deleted)
                            .map((s) => (
                              <article key={s.id}>
                                <span className="ad-card-icon">
                                  <Blocks />
                                </span>
                                <h2>{s.name}</h2>
                                <p>{s.instructions}</p>
                                <footer>
                                  <span>
                                    {
                                      data.flows.filter(
                                        (f) =>
                                          !f.deleted &&
                                          f.steps.some(
                                            (st) => st.skill === s.id,
                                          ),
                                      ).length
                                    }{" "}
                                    个工作流引用
                                  </span>
                                  <button onClick={() => modal("skill", s.id)}>
                                    编辑
                                  </button>
                                  <button
                                    className="ad-danger"
                                    onClick={() => modal("delete-skill", s.id)}
                                  >
                                    删除
                                  </button>
                                </footer>
                              </article>
                            ))
                        : data.flows
                            .filter((f) => !f.deleted)
                            .map((f) => (
                              <article
                                className={
                                  invalidSteps(f.steps) ? "ad-invalid" : ""
                                }
                                key={f.id}
                              >
                                <span className="ad-card-icon">
                                  <GitBranch />
                                </span>
                                <h2>{f.name}</h2>
                                {invalidSteps(f.steps) && (
                                  <p className="ad-danger">
                                    Skill 已删除，请替换后执行
                                  </p>
                                )}
                                <p>{f.steps.map((s) => s.name).join(" → ")}</p>
                                <span className="ad-badge">
                                  {f.paused ? "已暂停" : "可用"} ·{" "}
                                  {f.steps.length} 个步骤
                                </span>
                                <footer>
                                  <button onClick={() => modal("flow", f.id)}>
                                    编辑
                                  </button>
                                  <button
                                    onClick={() =>
                                      setData((d) => ({
                                        ...d,
                                        flows: d.flows.map((x) =>
                                          x.id === f.id
                                            ? { ...x, paused: !x.paused }
                                            : x,
                                        ),
                                      }))
                                    }
                                  >
                                    {f.paused ? "恢复" : "暂停"}
                                  </button>
                                  <button
                                    className="ad-danger"
                                    onClick={() => modal("delete-flow", f.id)}
                                  >
                                    软删除
                                  </button>
                                </footer>
                              </article>
                            ))}
                    </div>
                  </>
                )}
              </main>
              {task && page === "chat" && (
                <aside className="ad-execution">
                  <div className="ad-execution-heading">
                    <span>
                      <GitBranch size={17} />
                      工作流执行
                    </span>
                    <button
                      aria-label="关闭任务面板"
                      onClick={() => setSelected("")}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <h2>
                    {data.flows.find((f) => f.id === task.flow)?.name ||
                      "工作流已删除"}
                  </h2>
                  <div className="ad-execution-meta">
                    {badge(task)}
                    <span>
                      {Math.min(task.index, task.steps.length)} /{" "}
                      {task.steps.length} 步骤完成
                    </span>
                  </div>
                  <div className="ad-progress">
                    <i
                      style={{
                        width: `${(task.index / task.steps.length) * 100}%`,
                      }}
                    />
                  </div>
                  {blocked(task) && (
                    <div className="ad-error">
                      {invalid(task)
                        ? "引用的 Skill 或工作流已删除。请编辑任务替换失效引用，才能执行。"
                        : "工作流模板已暂停，恢复模板后才能继续。"}
                    </div>
                  )}
                  <div className="ad-steps">
                    {task.steps.map((s, i) => (
                      <div
                        key={i}
                        className={`ad-step ${i < task.index ? "done" : i === task.index ? "current" : ""}`}
                      >
                        <span className="ad-step-number">
                          {i < task.index ? <Check size={14} /> : i + 1}
                        </span>
                        <div>
                          <strong>{s.name}</strong>
                          <small>
                            {i < task.index
                              ? "已完成"
                              : i === task.index
                                ? task.state
                                : "等待前序步骤"}
                          </small>
                          <label>
                            确认方式
                            <select
                              aria-label={`${s.name}确认方式`}
                              disabled={
                                task.state === "已完成" ||
                                i < task.index ||
                                task.state === "执行中"
                              }
                              value={s.human ? "human" : "auto"}
                              onChange={(e) =>
                                updateTask(task.id, {
                                  steps: task.steps.map((x, j) =>
                                    i === j
                                      ? {
                                          ...x,
                                          human: e.target.value === "human",
                                        }
                                      : x,
                                  ),
                                })
                              }
                            >
                              <option value="human">人工确认</option>
                              <option value="auto">自动确认</option>
                            </select>
                          </label>
                          {!data.skills.some(
                            (k) => k.id === s.skill && !k.deleted,
                          ) && <span className="ad-danger">Skill 已删除</span>}
                          {(i < task.index ||
                            (i === task.index && task.state === "待确认")) && (
                            <button
                              className="ad-document"
                              onClick={() => setArtifact(i)}
                            >
                              <FileText size={14} />
                              {s.name}.md
                              <ChevronRight size={14} />
                            </button>
                          )}
                          {i === task.index && task.state === "待确认" && (
                            <button
                              className="ad-primary"
                              disabled={blocked(task)}
                              onClick={() => {
                                const next = task.index + 1;
                                updateTask(task.id, {
                                  index: next,
                                  state:
                                    next === task.steps.length
                                      ? "已完成"
                                      : "执行中",
                                });
                              }}
                            >
                              确认并继续 <ArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="ad-execution-actions">
                    {task.state !== "已完成" && (
                      <>
                        <button
                          disabled={task.state === "执行中"}
                          onClick={() => modal("task", task.id)}
                        >
                          <Settings2 size={15} />
                          编辑任务
                        </button>
                        {task.state === "执行中" || task.state === "待确认" ? (
                          <button
                            onClick={() =>
                              updateTask(task.id, { state: "已暂停" })
                            }
                          >
                            <Pause size={15} />
                            暂停
                          </button>
                        ) : (
                          <button
                            className="ad-primary"
                            disabled={blocked(task)}
                            onClick={() =>
                              updateTask(task.id, { state: "执行中" })
                            }
                          >
                            <Play size={15} />
                            {task.state === "已暂停" ? "继续任务" : "开始任务"}
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => copyTask(task)}>
                      <Copy size={15} />
                      复制任务
                    </button>
                  </div>
                  <p className="ad-panel-foot">
                    过程文档保留在原任务中，任务不可删除。
                    <br />
                    已完成任务可复制，不能重新执行。
                  </p>
                </aside>
              )}
            </div>
          </div>
        </>
      )}
      {notice && (
        <div className="ad-toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {previewFile && (
        <Dialog title={previewFile.name} close={() => setPreviewFile(null)}>
          {fileContents[previewFile.id] === undefined ? (
            <p>文件内容仅在本次页面会话中保留，刷新后请重新选择附件。</p>
          ) : previewFile.image ? (
            <img
              className="ad-file-preview"
              src={fileContents[previewFile.id]}
              alt={previewFile.name}
            />
          ) : (
            <pre className="ad-text-preview">
              {fileContents[previewFile.id]}
            </pre>
          )}
          <p className="ad-file-note">
            Demo：本地预览，文件未上传服务器，也不会调用模型解析。
          </p>
        </Dialog>
      )}
      {dialog === "new-task" && (
        <Dialog title="新任务" close={() => setDialog("")}>
          <form
            className="ad-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              createTask(String(fd.get("name")), String(fd.get("flow")), true);
            }}
          >
            <label>
              任务名称
              <input
                name="name"
                required
                pattern=".*\S.*"
                defaultValue={prompt}
                placeholder="例如：验证门诊微信支付功能"
              />
            </label>
            <label>
              工作区
              <input value={workspace?.name || ""} readOnly />
            </label>
            <label>
              工作流
              <select aria-label="工作流" name="flow" required defaultValue="">
                <option value="" disabled>
                  请选择工作流
                </option>
                {data.flows
                  .filter(
                    (f) => !f.deleted && !f.paused && !invalidSteps(f.steps),
                  )
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
            {!!attachments.length && (
              <p>将附带输入区已选择的 {attachments.length} 个附件。</p>
            )}
            {!data.flows.some(
              (f) => !f.deleted && !f.paused && !invalidSteps(f.steps),
            ) && <p>暂无可用工作流，请先在 Workflow 中配置。</p>}
            <button
              className="ad-primary"
              disabled={
                uploading ||
                !data.flows.some(
                  (f) => !f.deleted && !f.paused && !invalidSteps(f.steps),
                )
              }
            >
              创建任务
            </button>
          </form>
        </Dialog>
      )}
      {dialog && dialog !== "new-task" && (
        <Dialog
          title={
            (
              {
                workspace: editId ? "工作区设置" : "创建工作区",
                skill: editId ? "编辑 Skill" : "新增 Skill",
                flow: editId ? "编辑 Workflow" : "新增 Workflow",
                task: "编辑任务",
                "delete-skill": "删除 Skill",
                "delete-flow": "软删除工作流",
              } as Record<string, string>
            )[dialog]
          }
          close={() => setDialog("")}
        >
          <DemoForm
            key={`${dialog}-${editId}`}
            kind={dialog}
            editId={editId}
            data={data}
            onSave={(next) => {
              setData(next);
              if (dialog === "workspace" && !data.workspaces.length)
                openWorkspace(next.defaultWs);
              setDialog("");
            }}
          />
        </Dialog>
      )}
      {artifact >= 0 && task && (
        <Dialog
          title={`${task.steps[artifact].name} · 过程文档`}
          close={() => setArtifact(-1)}
        >
          <div className="ad-artifact">
            <span className="ad-kicker">模拟产物 · v1</span>
            <h2>{task.name}</h2>
            <p>步骤：{task.steps[artifact].name}</p>
            <h3>测试范围</h3>
            <p>
              覆盖正常业务、边界条件与异常恢复。验证重复提交、超时重试与数据一致性。
            </p>
            <h3>待确认事项</h3>
            <p>
              确认业务边界、测试环境以及关键场景的预期结果。本内容仅用于展示审核交互，不代表真实分析结果。
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function DemoForm({
  kind,
  editId,
  data,
  onSave,
}: {
  kind: string;
  editId: string;
  data: Data;
  onSave: (d: Data) => void;
}) {
  const w = data.workspaces.find((w) => w.id === editId);
  const skill = data.skills.find((s) => s.id === editId);
  const flow = data.flows.find((f) => f.id === editId);
  const task = data.tasks.find((t) => t.id === editId);
  const [steps, setSteps] = useState<Step[]>(
    structuredClone(
      kind === "task" && task ? task.steps : flow?.steps || [initialSteps[0]],
    ),
  );
  const [chosenFlow, setChosenFlow] = useState(task?.flow || "");
  return (
    <form
      className="ad-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const name = String(fd.get("name") || "").trim();
        const next = structuredClone(data);
        if (kind === "workspace") {
          const wid = editId || id();
          const value = {
            id: wid,
            name,
            description: String(fd.get("description")),
          };
          next.workspaces = w
            ? next.workspaces.map((x) => (x.id === wid ? value : x))
            : [...next.workspaces, value];
          if (!next.defaultWs || fd.get("default")) next.defaultWs = wid;
        }
        if (kind === "skill") {
          const value = {
            id: editId || id(),
            name,
            instructions: String(fd.get("instructions")),
          };
          next.skills = skill
            ? next.skills.map((x) => (x.id === editId ? value : x))
            : [...next.skills, value];
        }
        if (kind === "flow") {
          const value = { ...flow, id: editId || id(), name, steps };
          next.flows = flow
            ? next.flows.map((x) => (x.id === editId ? value : x))
            : [...next.flows, value];
        }
        if (kind === "delete-skill")
          next.skills = next.skills.map((x) =>
            x.id === editId ? { ...x, deleted: true } : x,
          );
        if (kind === "delete-flow")
          next.flows = next.flows.map((x) =>
            x.id === editId ? { ...x, deleted: true } : x,
          );
        if (kind === "task" && task) {
          const f = next.flows.find((f) => f.id === chosenFlow)!;
          next.tasks = next.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  name,
                  flow: f.id,
                  steps:
                    chosenFlow !== task.flow || fd.get("refresh")
                      ? structuredClone(f.steps)
                      : steps,
                }
              : t,
          );
        }
        onSave(next);
      }}
    >
      {kind.startsWith("delete") ? (
        <>
          <p>
            删除后保留历史引用与任务过程文档。受影响的工作流和任务会标红，替换失效配置后才能执行。复制任务也会保留失效引用。
          </p>
          <button className="ad-danger-button">
            确认{kind === "delete-flow" ? "软删除" : "删除"}
          </button>
        </>
      ) : (
        <>
          <label>
            名称
            <input
              name="name"
              required
              pattern=".*\S.*"
              defaultValue={
                kind === "workspace"
                  ? w?.name
                  : kind === "skill"
                    ? skill?.name
                    : kind === "flow"
                      ? flow?.name
                      : task?.name
              }
              placeholder="输入名称"
            />
          </label>
          {kind === "workspace" && (
            <>
              <label>
                工作区说明
                <textarea
                  name="description"
                  defaultValue={w?.description}
                  placeholder="描述产品范围与测试目标"
                />
              </label>
              <label className="ad-checkbox">
                <input
                  type="checkbox"
                  name="default"
                  defaultChecked={
                    !data.workspaces.length || data.defaultWs === editId
                  }
                />
                设为默认工作区
              </label>
              <p>
                进入 Agent 时自动打开默认工作区。第一个工作区将自动设为默认。
              </p>
            </>
          )}
          {kind === "skill" && (
            <label>
              技能工作要求
              <textarea
                name="instructions"
                required
                defaultValue={skill?.instructions}
                placeholder="描述输入、工作要求和预期输出"
              />
            </label>
          )}
          {kind === "flow" && (
            <>
              <p>按顺序执行，每一步默认人工确认。任务级设置优先于此模板。</p>
              {steps.map((s, i) => (
                <div className="ad-flow-row" key={i}>
                  <span>{i + 1}</span>
                  <label>
                    Skill
                    <select
                      aria-label={`步骤${i + 1}技能`}
                      required
                      value={s.skill}
                      onChange={(e) =>
                        setSteps((xs) =>
                          xs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  skill: e.target.value,
                                  name: data.skills.find(
                                    (k) => k.id === e.target.value,
                                  )!.name,
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      {!data.skills.some(
                        (k) => k.id === s.skill && !k.deleted,
                      ) && (
                        <option value={s.skill} disabled>
                          Skill 已删除，请替换
                        </option>
                      )}
                      {data.skills
                        .filter((k) => !k.deleted)
                        .map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    默认确认
                    <select
                      value={s.human ? "human" : "auto"}
                      onChange={(e) =>
                        setSteps((xs) =>
                          xs.map((x, j) =>
                            i === j
                              ? { ...x, human: e.target.value === "human" }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="human">人工确认</option>
                      <option value="auto">自动确认</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`移除步骤${i + 1}`}
                    disabled={steps.length === 1}
                    onClick={() =>
                      setSteps((xs) => xs.filter((_, j) => i !== j))
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={!data.skills.some((k) => !k.deleted)}
                onClick={() => {
                  const k = data.skills.find((k) => !k.deleted)!;
                  setSteps((xs) => [
                    ...xs,
                    { name: k.name, skill: k.id, human: true },
                  ]);
                }}
              >
                <Plus size={16} />
                添加步骤
              </button>
            </>
          )}
          {kind === "task" && (
            <>
              <label>
                工作流
                <select
                  required
                  disabled={!!task && task.index > 0}
                  value={chosenFlow}
                  onChange={(e) => setChosenFlow(e.target.value)}
                >
                  {data.flows.map((f) => (
                    <option
                      key={f.id}
                      value={f.id}
                      disabled={f.deleted || f.paused}
                    >
                      {f.name}
                      {f.deleted ? "（已删除）" : f.paused ? "（已暂停）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ad-checkbox">
                <input
                  type="checkbox"
                  name="refresh"
                  disabled={!!task && task.index > 0}
                />
                从模板更新步骤，替换旧 Skill 引用
              </label>
              <p>
                切换工作流会采用新模板；已产生完成步骤后保留原流程，可替换后续步骤的
                Skill。工作流被删除时，请复制为新任务并替换。
              </p>
              {steps.map((s, i) => (
                <label key={i}>
                  {s.name} · Skill
                  <select
                    aria-label={`任务步骤${i + 1}技能`}
                    disabled={
                      i < (task?.index || 0) || chosenFlow !== task?.flow
                    }
                    value={s.skill}
                    onChange={(e) =>
                      setSteps((xs) =>
                        xs.map((x, j) =>
                          i === j ? { ...x, skill: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    {!data.skills.some(
                      (k) => k.id === s.skill && !k.deleted,
                    ) && (
                      <option value={s.skill} disabled>
                        Skill 已删除，请替换
                      </option>
                    )}
                    {data.skills
                      .filter((k) => !k.deleted)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </>
          )}
          <button
            className="ad-primary"
            disabled={
              kind === "flow" &&
              steps.some(
                (s) => !data.skills.some((k) => k.id === s.skill && !k.deleted),
              )
            }
          >
            保存{kind === "workspace" ? "工作区" : "配置"}
          </button>
        </>
      )}
    </form>
  );
}
