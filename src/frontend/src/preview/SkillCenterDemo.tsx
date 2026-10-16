import WorkflowDemo from "./WorkflowDemo";
import { seedWorkflowDesigns, seedWorkflowSkills } from "./workflow-demo-state";
import SkillModelPicker from "./SkillModelPicker";
import ModelSettingsDemo from "./ModelSettingsDemo";
import { useRef, useState, type InputHTMLAttributes } from "react";
import {
  Blocks,
  Plus,
  Upload,
  Search,
  GitBranch,
  Layers,
  ListTodo,
  ChevronRight,
  FileText,
  Folder,
  ShieldCheck,
  Copy,
  Pause,
  Check,
  X,
  ArrowLeft,
  ArrowRight,
  Code2,
  LockKeyhole,
  Menu,
} from "lucide-react";
import { Brand, Dialog } from "../components";
import {
  blankSkill,
  defaultModelPreference,
  demoModels,
  modelPreferenceErrors,
  markdown,
  parseMarkdown,
  readPackage,
  roleNames,
  seedSkills,
  seedWorkflows,
  stateNames,
  validateSkill,
  type DemoSkill,
  type DemoWorkflow,
  type SkillRole,
  type SkillState,
} from "./skill-package-demo";
import "./agent-demo.css";
import "./skill-center.css";
const directory = {
  webkitdirectory: "",
  directory: "",
} as InputHTMLAttributes<HTMLInputElement>;
export default function SkillCenterDemo({
  workflowDesign = false,
}: {
  workflowDesign?: boolean;
}) {
  const [skills, setSkills] = useState(() =>
    workflowDesign ? seedWorkflowSkills() : seedSkills(),
  );
  const [designedWorkflows, setDesignedWorkflows] =
    useState(seedWorkflowDesigns);
  const [workflowPage, setWorkflowPage] = useState(workflowDesign);
  const [role, setRole] = useState<SkillRole>("tester");
  const [status, setStatus] = useState("all");
  const [workflows, setWorkflows] = useState(seedWorkflows);
  const [references, setReferences] = useState<DemoSkill>();
  const [viewing, setViewing] = useState(false);
  const refs = (s: DemoSkill) =>
    (workflowDesign ? designedWorkflows : workflows).filter((w) =>
      w.skills.includes(s.id),
    );
  const pending = (s: DemoSkill) =>
    refs(s)
      .flatMap((w) => w.tasks)
      .filter((t) => t.status !== "已完成");
  const open = (s: DemoSkill, view = false) => {
    setViewing(view);
    setEditing(structuredClone(s));
  };
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DemoSkill>();
  const [importOpen, setImportOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowSkill, setWorkflowSkill] = useState("payment_review");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [, refreshModels] = useState(0);
  const [notice, setNotice] = useState("");
  const [mobile, setMobile] = useState(false);
  const visible = skills.filter((s) =>
    (s.roles || [s.role]).some((r) => r === "common" || r === role),
  );
  const matches = visible.filter(
    (s) =>
      (status === "all" || s.state === status) &&
      `${s.name} ${s.id} ${s.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected = skills.find((s) => s.id === workflowSkill);
  const usable = visible.filter(
    (s) =>
      s.state === "published" &&
      !modelPreferenceErrors(s.modelPreference || defaultModelPreference())
        .length,
  );
  const save = (skill: DemoSkill) => {
    const original = skills.find((s) => s.key === skill.key);
    if (
      original &&
      (original.source === "builtin" || pending(original).length)
    ) {
      setNotice("引用任务尚未全部完成，无法修改此技能。");
      return;
    }
    skill = {
      ...skill,
      updated: new Date().toLocaleString("zh-CN", { hour12: false }),
    };
    setSkills((xs) => [...xs.filter((s) => s.key !== skill.key), skill]);
    setEditing(undefined);
    setNotice(
      skill.state === "published"
        ? "启用，在当前角色的工作流中可选。"
        : "草稿已保存，启用后才可被工作流引用。",
    );
  };
  const fork = (s: DemoSkill) => {
    let id = `${s.id}_custom`;
    let n = 2;
    while (skills.some((k) => k.id === id)) id = `${s.id}_custom_${n++}`;
    setViewing(false);
    setEditing({
      ...structuredClone(s),
      key: crypto.randomUUID(),
      id,
      name: `${s.name}（个人副本）`,
      source: "custom",
      state: "draft",
      role,
      calls: 0,
      updated: new Date().toLocaleString("zh-CN", { hour12: false }),
      basedOn: s.id,
      imported: false,
    });
  };
  return (
    <div className="agent-demo skill-center-demo">
      <aside className={`ad-sidebar ${mobile ? "open" : ""}`}>
        <div className="ad-brand">
          <Brand />
        </div>
        <div className="ad-role">
          <span className="ad-role-avatar">
            <Blocks size={18} />
          </span>
          <label>
            <small>当前角色 · 预览切换</small>
            <select
              aria-label="当前角色"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as SkillRole);
                setStatus("all");
              }}
            >
              <option value="tester">测试工程师</option>
              <option value="developer">开发工程师</option>
              <option value="product">产品经理</option>
              <option value="operations">运维工程师</option>
            </select>
          </label>
        </div>
        <nav>
          <button onClick={() => location.assign("/?preview=agent")}>
            <ListTodo size={18} />
            我的任务
          </button>
          <button onClick={() => location.assign("/?preview=agent")}>
            <Layers size={18} />
            工作区
          </button>
          <button
            className={!settingsOpen && !workflowPage ? "active" : ""}
            onClick={() => {
              setSettingsOpen(false);
              setWorkflowPage(false);
            }}
          >
            <Blocks size={18} />
            技能中心
          </button>
          <button
            className={workflowPage && !settingsOpen ? "active" : ""}
            onClick={() => {
              if (workflowDesign) {
                setWorkflowPage(true);
                setSettingsOpen(false);
              } else setWorkflowOpen(true);
            }}
          >
            <GitBranch size={18} />
            工作流
          </button>
        </nav>
        <div className="ad-side-heading">我的工作区</div>
        <div className="ad-workspaces">
          {["医院信息系统", "临床信息系统", "检验信息系统"].map((w) => (
            <div key={w}>
              <button onClick={() => location.assign("/?preview=agent")}>
                <span className="ad-folder">
                  <Layers size={15} />
                </span>
                {w}
              </button>
            </div>
          ))}
        </div>
        <div className="ad-side-bottom">
          <div className="ad-demo-label">
            <span />
            {workflowDesign
              ? "工作流与技能联动 Demo · 刷新重置"
              : "技能中心演示 · 刷新重置"}
          </div>
          {userMenu && (
            <div className="ms-user-menu">
              <button
                onClick={() => {
                  setSettingsOpen(true);
                  setUserMenu(false);
                }}
              >
                设置
              </button>
            </div>
          )}
          <button
            aria-label="用户菜单"
            aria-expanded={userMenu}
            onClick={() => setUserMenu(!userMenu)}
          >
            <span className="ad-user-avatar">林</span>
            <span>
              林晓<small>个人技能空间</small>
            </span>
          </button>
        </div>
      </aside>
      <div className="ad-shell">
        <header className="ad-header">
          <button
            className="ad-mobile"
            aria-label="打开导航"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={18} />
          </button>
          <div>
            {settingsOpen ? "设置" : workflowPage ? "工作流" : "技能中心"}
          </div>
          <span className="sc-private">
            <LockKeyhole size={13} />
            个人管理 · 当前角色可用
          </span>
        </header>
        <div hidden={!settingsOpen}>
          <ModelSettingsDemo
            skills={skills}
            workflows={workflows}
            back={() => setSettingsOpen(false)}
            changed={() => refreshModels((x) => x + 1)}
          />
        </div>
        {workflowDesign && workflowPage && !settingsOpen && (
          <WorkflowDemo
            skills={skills}
            workflows={designedWorkflows}
            setWorkflows={setDesignedWorkflows}
          />
        )}
        <main
          className="sc-main homepage-main"
          hidden={settingsOpen || workflowPage}
        >
          <div className="sc-page-heading homepage-heading">
            <div>
              <span className="ad-kicker">SKILLS CENTER</span>
              <h1>我的技能库</h1>
              <p>让智能助手学会您的工作方法，把经验变成可复用的能力。</p>
            </div>
            <div className="sc-heading-actions">
              <button
                className="sc-secondary"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={16} />
                导入技能
              </button>
              <button
                className="ad-primary"
                onClick={() => open(blankSkill(role))}
              >
                <Plus size={16} />
                新建技能
              </button>
            </div>
          </div>
          <div className="sc-toolbar">
            <label className="sc-search">
              <Search size={16} />
              <input
                aria-label="搜索技能"
                placeholder="搜索名称、标识或技能描述…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="sc-source-filter" aria-label="技能状态筛选">
              {[
                ["all", "全部"],
                ["published", "启用"],
                ["draft", "草稿"],
                ["paused", "停用"],
                ["invalid", "校验失败"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={status === key}
                  className={status === key ? "active" : ""}
                  onClick={() => setStatus(key)}
                >
                  {label}
                  <span>
                    {
                      visible.filter((s) => key === "all" || s.state === key)
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="sc-grid">
            {matches.map((s) => {
              const blocked = pending(s).length > 0;
              return (
                <article className="sc-card" key={s.key}>
                  <div className="sc-card-head">
                    <span className={`sc-skill-icon ${s.source}`}>
                      {s.icon || "🧩"}
                    </span>
                    <button
                      className="sc-card-title"
                      onClick={() => open(s, true)}
                    >
                      <h2>{s.name}</h2>
                    </button>
                    <span className={`sc-state ${s.state}`}>
                      <i />
                      {stateNames[s.state]}
                    </span>
                  </div>
                  <span className={`sc-workflow-availability ${s.state}`}>
                    {s.state === "published" ? (
                      <ShieldCheck size={12} />
                    ) : (
                      <LockKeyhole size={12} />
                    )}
                    {s.state === "published"
                      ? "已发布·工作流可用"
                      : `${stateNames[s.state]}·工作流不可用`}
                  </span>
                  <p>{s.description}</p>
                  <div className="sc-card-tags">
                    <span
                      className={s.source === "builtin" ? "sc-builtin-tag" : ""}
                    >
                      {s.source === "builtin"
                        ? "系统内置"
                        : s.imported
                          ? "个人导入"
                          : "自定义"}
                    </span>
                    {(s.roles || [s.role]).map((r) => (
                      <span key={r} className={`sc-role-tag ${r}`}>
                        {roleNames[r]}
                      </span>
                    ))}
                  </div>
                  <div className="sc-card-metrics">
                    <button onClick={() => setReferences(s)}>
                      <GitBranch size={14} />
                      {refs(s).length} 个工作流引用
                    </button>
                  </div>
                  <div className="sc-card-updated">
                    <span>
                      调用 {(s.calls || 0).toLocaleString("zh-CN")} 次
                    </span>
                    <span>最后修改：{s.updated || "刚刚"}</span>
                  </div>
                  {modelPreferenceErrors(
                    s.modelPreference || defaultModelPreference(),
                  ).length > 0 && (
                    <span className="sc-invalid-note">
                      模型待配置 · 启用或执行前需处理
                    </span>
                  )}
                  {blocked && (
                    <button
                      className="sc-lock-note"
                      onClick={() => setReferences(s)}
                    >
                      <LockKeyhole size={12} />
                      {pending(s).length} 个任务未完成 · 查看引用
                    </button>
                  )}
                  {s.state === "invalid" && (
                    <span className="sc-invalid-note">
                      工作指令为空，请编辑后重新校验。
                    </span>
                  )}
                  <footer>
                    <button onClick={() => open(s, true)}>
                      查看技能
                      <ChevronRight size={13} />
                    </button>
                    {s.source === "builtin" ? (
                      <button onClick={() => fork(s)}>
                        <Copy size={13} />
                        创建副本
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={blocked}
                          title={
                            blocked ? "引用任务全部完成后才能编辑" : "编辑技能"
                          }
                          onClick={() => open(s)}
                        >
                          编辑技能
                        </button>
                        {s.state === "published" && (
                          <button
                            disabled={blocked}
                            title={
                              blocked
                                ? "引用任务全部完成后才能停用"
                                : "停用技能"
                            }
                            onClick={() => {
                              if (pending(s).length) return;
                              setSkills((xs) =>
                                xs.map((k) =>
                                  k.key === s.key
                                    ? {
                                        ...k,
                                        state: "paused",
                                        updated: new Date().toLocaleString(
                                          "zh-CN",
                                          { hour12: false },
                                        ),
                                      }
                                    : k,
                                ),
                              );
                              setNotice(
                                "技能已停用，工作流执行前需要替换该技能或重新启用。",
                              );
                            }}
                          >
                            <Pause size={13} />
                            停用
                          </button>
                        )}
                      </>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
          {!matches.length && (
            <div className="sc-empty">
              <Blocks size={32} />
              <h2>还没有匹配的技能</h2>
              <p>调整筛选条件，或创建适合当前角色的新技能。</p>
              <button
                className="ad-primary"
                onClick={() => open(blankSkill(role))}
              >
                新建技能
              </button>
            </div>
          )}
        </main>
      </div>
      {editing && (
        <SkillEditor
          key={editing.key}
          initial={editing}
          viewOnly={viewing || pending(editing).length > 0}
          role={role}
          existing={skills}
          close={() => setEditing(undefined)}
          save={save}
          fork={() => fork(editing)}
        />
      )}
      {importOpen && (
        <SkillImport
          role={role}
          existing={skills}
          close={() => setImportOpen(false)}
          imported={(s) => {
            save(s);
            setImportOpen(false);
          }}
        />
      )}
      {references && (
        <Dialog
          title={`${references.name} · 工作流引用`}
          close={() => setReferences(undefined)}
        >
          <div className="sc-reference-list">
            {refs(references).length === 0 ? (
              <p>暂无工作流引用。</p>
            ) : (
              <>
                <p>
                  {pending(references).length
                    ? "以下未完成任务会锁定技能的编辑与停用。"
                    : "所有引用任务均已完成，自定义技能可编辑或停用。"}
                </p>
                {refs(references).map((w) => (
                  <section key={w.id}>
                    <h3>{w.name}</h3>
                    {w.tasks.map((t, i) => (
                      <div className="sc-reference-task" key={t.name}>
                        <span>
                          {t.name}
                          <small>{t.status}</small>
                        </span>
                        {t.status !== "已完成" && (
                          <button
                            onClick={() => {
                              const complete = <T extends DemoWorkflow>(
                                items: T[],
                              ): T[] =>
                                items.map((x) =>
                                  x.id === w.id
                                    ? {
                                        ...x,
                                        tasks: x.tasks.map((task, j) =>
                                          j === i
                                            ? {
                                                ...task,
                                                status: "已完成" as const,
                                              }
                                            : task,
                                        ),
                                      }
                                    : x,
                                );
                              if (workflowDesign)
                                setDesignedWorkflows(complete);
                              else setWorkflows(complete);
                            }}
                          >
                            模拟完成任务
                          </button>
                        )}
                      </div>
                    ))}
                  </section>
                ))}
              </>
            )}
          </div>
        </Dialog>
      )}
      {workflowOpen && (
        <Dialog
          title="工作流引用 · 交互预览"
          close={() => setWorkflowOpen(false)}
        >
          <div className="sc-form">
            <p>
              模拟“需求验证工作流”的一个步骤。下拉列表只提供当前角色下启用的技能。
            </p>
            <label>
              步骤技能
              <select
                aria-label="工作流可引用技能"
                value={workflowSkill}
                onChange={(e) => setWorkflowSkill(e.target.value)}
              >
                <option value="">请选择启用技能</option>
                {workflowSkill &&
                  !usable.some((s) => s.id === workflowSkill) && (
                    <option value={workflowSkill} disabled>
                      {selected?.name || workflowSkill}（当前不可用）
                    </option>
                  )}
                {usable.map((s) => (
                  <option key={s.key} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {workflowSkill && !usable.some((s) => s.id === workflowSkill) && (
              <div className="sc-warning" role="alert">
                此步骤引用的技能停用或不属于当前角色，请替换为可用技能后执行。
              </div>
            )}
            <button
              className="ad-primary"
              disabled={!usable.some((s) => s.id === workflowSkill)}
              onClick={() => {
                setNotice(
                  "引用校验通过。这是选择器预览，未启动任务或执行脚本。",
                );
                setWorkflowOpen(false);
              }}
            >
              确认引用
            </button>
            <small>
              引用任务全部完成后才能修改或停用技能，历史过程文档会保留。
            </small>
          </div>
        </Dialog>
      )}
      {notice && (
        <div className="ad-toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function SkillEditor({
  initial,
  viewOnly,
  role,
  existing,
  close,
  save,
  fork,
}: {
  initial: DemoSkill;
  viewOnly: boolean;
  role: SkillRole;
  existing: DemoSkill[];
  close: () => void;
  save: (s: DemoSkill) => void;
  fork: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(markdown(initial));
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [leave, setLeave] = useState(false);
  const [viewFile, setViewFile] = useState("SKILL.md");
  const modelPreference = draft.modelPreference || defaultModelPreference();
  const readOnly = viewOnly || initial.source === "builtin";
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    (advanced && raw !== markdown(initial));
  const patch = (data: Partial<DemoSkill>) => {
    setDraft((s) => ({ ...s, ...data }));
    setChecked(false);
    setError("");
  };
  function current(): DemoSkill {
    return {
      ...(advanced ? { ...draft, ...parseMarkdown(raw) } : draft),
      version: initial.version,
    };
  }
  function commit(state: SkillState) {
    try {
      const value = current();
      const errors = validateSkill(value, role, existing, state === "draft");
      if (errors.length) {
        setError(errors.join("\n"));
        return;
      }
      const contentChanged =
        markdown(value) !== markdown(initial) ||
        JSON.stringify(value.files) !== JSON.stringify(initial.files);
      const parts = initial.version.split("-")[0].split(".").map(Number);
      while (parts.length < 3) parts.push(0);
      parts[2] += 1;
      const version =
        existing.some((s) => s.key === initial.key) && contentChanged
          ? parts.join(".")
          : initial.version;
      save({ ...value, state, version });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const closeEditor = () => (dirty && !readOnly ? setLeave(true) : close());
  const paths = ["SKILL.md", ...draft.files.map((f) => f.path)];
  const treeRows: {
    path: string;
    folder: boolean;
    depth: number;
    last: boolean;
  }[] = [];
  function buildTree(prefix = "", depth = 0) {
    const names = [
      ...new Set(
        paths
          .filter((p) => p.startsWith(prefix))
          .map((p) => p.slice(prefix.length).split("/")[0]),
      ),
    ];
    names.forEach((name, i) => {
      const path = prefix + name;
      const folder = paths.some((p) => p.startsWith(path + "/"));
      treeRows.push({ path, folder, depth, last: i === names.length - 1 });
      if (folder) buildTree(path + "/", depth + 1);
    });
  }
  buildTree();
  return (
    <>
      <Dialog
        className="sc-editor-dialog"
        title={
          readOnly
            ? "查看技能"
            : existing.some((s) => s.key === initial.key)
              ? "编辑个人技能"
              : "新建个人技能"
        }
        close={closeEditor}
      >
        <div className="sc-editor-top">
          <span>
            {readOnly
              ? initial.source === "builtin"
                ? "系统内置技能"
                : "技能详情 · 只读查看"
              : `${roleNames[role]} · 仅保存在你的技能空间`}
          </span>
          {readOnly ? (
            <button className="ad-primary" onClick={fork}>
              <Copy size={14} />
              创建个人副本
            </button>
          ) : (
            <button
              className="sc-secondary"
              onClick={() => {
                try {
                  if (advanced) {
                    patch(parseMarkdown(raw));
                  } else setRaw(markdown(draft));
                  setAdvanced(!advanced);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Code2 size={14} />
              {advanced ? "返回表单" : "编辑入口源码"}
            </button>
          )}
        </div>
        <div className="sc-editor-layout">
          <nav className="sc-editor-steps">
            {["基本信息", "工作指令", "资源文件", "检查与启用"].map(
              (label, i) => (
                <button
                  key={label}
                  className={step === i ? "active" : ""}
                  onClick={() => setStep(i)}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
              ),
            )}
            <div className="sc-step-tip">
              <ShieldCheck size={20} />
              <p>启用前校验包结构与角色范围。</p>
              <small>不自动执行包内脚本。</small>
            </div>
          </nav>
          <section className={`sc-editor-content sc-step-${step}`}>
            <div className="sc-content-heading">
              <span className="ad-kicker">第 {step + 1} 步</span>
              <h2>
                {
                  [
                    "先给技能一张名片",
                    "定义它如何思考与行动",
                    "为技能准备参考与素材",
                    "确认后，加入你的技能库",
                  ][step]
                }
              </h2>
              <p className="sc-editor-lead">
                {
                  [
                    "清晰的名称和描述，帮助你在工作流中找到正确的技能。",
                    "入口正文使用标记格式，描述目标、步骤、约束和输出。",
                    "资源全部属于当前技能包，可选目录不必全部创建。",
                    "启用后才可被工作流引用；停用的技能可重新校验后启用。",
                  ][step]
                }
              </p>
            </div>
            {advanced && step < 2 ? (
              <label className="sc-form">
                SKILL.md
                <textarea
                  aria-label="入口文件源码"
                  className="sc-code-editor"
                  readOnly={readOnly}
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setChecked(false);
                  }}
                />
              </label>
            ) : step === 0 ? (
              <div className="sc-form">
                <div className="sc-identity-row">
                  <label>
                    图标
                    <select
                      aria-label="图标"
                      disabled={readOnly}
                      value={draft.icon || "🔍"}
                      onChange={(e) => patch({ icon: e.target.value })}
                    >
                      {Array.from(
                        new Set([
                          draft.icon || "🔍",
                          "🔍",
                          "📝",
                          "📚",
                          "🐞",
                          "🧪",
                          "📊",
                          "🚦",
                          "⚙️",
                          "🧭",
                          "🧠",
                          "✍️",
                          "🛡️",
                          "🧰",
                          "💬",
                          "📦",
                          "🌱",
                        ]),
                      ).map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    技能名称
                    <input
                      readOnly={readOnly}
                      value={draft.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder="例如：支付异常分析"
                    />
                  </label>
                  <label>
                    唯一标识
                    <input
                      readOnly={
                        readOnly || existing.some((s) => s.key === initial.key)
                      }
                      value={draft.id}
                      onChange={(e) => patch({ id: e.target.value })}
                      placeholder="使用小写字母、数字或连接符"
                    />
                  </label>
                </div>
                <label>
                  技能描述
                  <textarea
                    className="sc-description-input"
                    aria-label="技能描述"
                    value={draft.description}
                    readOnly={readOnly}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="描述适用场景和要解决的问题"
                  />
                </label>
                <div className="sc-role-version-row">
                  <fieldset className="sc-role-options" disabled={readOnly}>
                    <legend>适用角色（可多选）</legend>
                    {(Object.keys(roleNames) as SkillRole[]).map((r) => (
                      <label key={r}>
                        <input
                          type="checkbox"
                          checked={(draft.roles || [draft.role]).includes(r)}
                          onChange={(e) => {
                            const roles = draft.roles || [draft.role];
                            patch({
                              roles: e.target.checked
                                ? r === "common"
                                  ? [r]
                                  : [...roles.filter((x) => x !== "common"), r]
                                : roles.filter((x) => x !== r),
                            });
                          }}
                        />
                        {roleNames[r]}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    版本号
                    <input readOnly value={initial.version} />
                  </label>
                </div>
                <details className="sc-model-preference" open>
                  <summary>
                    <span>模型偏好</span>
                    <small>
                      {modelPreference.mode === "none"
                        ? "不使用模型"
                        : modelPreference.mode === "inherit"
                          ? "跟随用户默认模型"
                          : modelPreference.mode === "tier"
                            ? `按档位选择 · ${modelPreference.tier || "均衡"}`
                            : demoModels.find(
                                (m) => m.id === modelPreference.model,
                              )?.name || "模型待配置"}
                    </small>
                  </summary>
                  <SkillModelPicker
                    value={modelPreference}
                    readOnly={readOnly}
                    onChange={(p) => patch({ modelPreference: p })}
                  />
                </details>
                {draft.basedOn && (
                  <div className="sc-info">
                    基于原技能创建，修改不会影响原技能。
                  </div>
                )}
              </div>
            ) : step === 1 ? (
              <div className="sc-form">
                <label>
                  工作指令
                  <textarea
                    aria-label="工作指令"
                    className="sc-code-editor"
                    readOnly={readOnly}
                    value={draft.body}
                    onChange={(e) => patch({ body: e.target.value })}
                  />
                </label>
              </div>
            ) : null}
            {step === 2 && (
              <div className="sc-resource-list">
                {[
                  ["scripts", "执行脚本", "确定性处理逻辑，导入时不会执行"],
                  ["reference", "参考文档", "仅在需要时加载到模型上下文"],
                  ["assets", "输出素材", "模板、图片、字体等交付素材"],
                ].map(([dir, label, desc]) => (
                  <div key={dir}>
                    <div>
                      <Folder size={19} />
                      <span>
                        <strong>{label}</strong>
                        <small>
                          {label} · {desc}
                        </small>
                      </span>
                      {!readOnly && (
                        <label className="sc-add-file">
                          添加文件
                          <input
                            type="file"
                            aria-label={`添加${label}`}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                setError("单文件不超过 5 MB。");
                                return;
                              }
                              const path = `${dir}/${file.name}`;
                              if (draft.files.some((f) => f.path === path)) {
                                setError("同名资源已存在，请重命名后添加。");
                                return;
                              }
                              try {
                                const text =
                                  /\.(md|txt|json|py|js|sh|csv)$/i.test(
                                    file.name,
                                  )
                                    ? await file.text()
                                    : undefined;
                                patch({
                                  files: [
                                    ...draft.files,
                                    { path, text, size: file.size },
                                  ],
                                });
                              } catch {
                                setError("资源读取失败，请重试。");
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {draft.files
                      .filter((f) => f.path.startsWith(dir + "/"))
                      .map((f) => (
                        <div className="sc-resource-file" key={f.path}>
                          <FileText size={14} />
                          <button onClick={() => setViewFile(f.path)}>
                            {f.path.slice(dir.length + 1)}
                          </button>
                          <small>
                            {Math.max(1, Math.ceil(f.size / 1024))} KB
                          </small>
                          {!readOnly && (
                            <button
                              aria-label={`移除 ${f.path}`}
                              onClick={() =>
                                patch({
                                  files: draft.files.filter(
                                    (x) => x.path !== f.path,
                                  ),
                                })
                              }
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
            {step === 3 && (
              <div className="sc-form">
                <div className="sc-publish-summary">
                  <span className="sc-skill-icon custom">
                    {draft.icon || "🧩"}
                  </span>
                  <div>
                    <h3>{draft.name || "未命名技能"}</h3>
                    <small>
                      {draft.id || "未填写标识"} · v{draft.version} ·{" "}
                      {(draft.roles || [draft.role])
                        .map((r) => roleNames[r])
                        .join("、")}
                    </small>
                  </div>
                </div>
                <div className="sc-check-list">
                  {[
                    "唯一入口文件与工作指令正文",
                    "必要元数据与标识不重复",
                    "当前角色可导入和维护",
                    "模型配置有效且当前可用",
                    "资源按脚本、参考文档与素材组织",
                  ].map((label) => (
                    <div key={label}>
                      {checked ? (
                        <Check size={16} />
                      ) : (
                        <ShieldCheck size={16} />
                      )}
                      <span>{label}</span>
                      <small>{checked ? "通过" : "待检查"}</small>
                    </div>
                  ))}
                </div>
                <button
                  className="sc-secondary"
                  onClick={() => {
                    try {
                      const errors = validateSkill(current(), role, existing);
                      setError(errors.join("\n"));
                      setChecked(!errors.length);
                    } catch (e) {
                      setError((e as Error).message);
                      setChecked(false);
                    }
                  }}
                >
                  运行结构校验
                </button>
                <p className="sc-info">
                  此处验证导入结构与角色规则，不执行脚本、不调用模型，也不表示已通过安全扫描或执行器兼容性测试。
                </p>
                {!readOnly && initial.state === "published" && (
                  <p>保存为草稿会停止新的工作流引用；重新启用前请完成校验。</p>
                )}
              </div>
            )}
            {error && (
              <div className="sc-warning" role="alert">
                {error}
              </div>
            )}
          </section>
          <aside className="sc-package-preview">
            <div className="sc-package-directory">
              <div>
                <Folder size={16} />
                <strong>技能包内容</strong>
              </div>
              <small>
                {draft.source === "builtin"
                  ? "系统内置 / 只读"
                  : readOnly
                    ? "个人技能 / 只读"
                    : "个人技能 / 可编辑"}
              </small>
              <code>
                {draft.role}/{draft.id || "new-skill"}/
              </code>
              <div className="sc-file-tree">
                {treeRows.map(({ path, folder, depth, last }) =>
                  folder ? (
                    <div
                      className="sc-tree-folder"
                      key={path}
                      style={{ paddingLeft: depth * 16 }}
                    >
                      <span>{last ? "└─" : "├─"}</span>
                      <Folder size={14} />
                      {path.split("/").at(-1)}/
                    </div>
                  ) : (
                    <button
                      key={path}
                      style={{ paddingLeft: depth * 16 }}
                      className={viewFile === path ? "active" : ""}
                      aria-label={
                        path === "SKILL.md"
                          ? "入口文件 · SKILL.md"
                          : path.startsWith("reference/")
                            ? "参考文档 · " + path.slice(10)
                            : "文件 · " + path
                      }
                      onClick={() => setViewFile(path)}
                    >
                      <span>{last ? "└─" : "├─"}</span>
                      <FileText size={14} />
                      {path.split("/").at(-1)}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="sc-package-document">
              <span className="sc-preview-label">{viewFile}</span>
              <pre>
                {viewFile === "SKILL.md"
                  ? advanced
                    ? raw
                    : markdown(draft)
                  : draft.files.find((f) => f.path === viewFile)?.text ||
                    "二进制资源 · 保留为包素材"}
              </pre>
            </div>
          </aside>
        </div>
        <footer className="sc-editor-footer">
          <span>
            {readOnly
              ? "当前为只读查看"
              : dirty
                ? "有未保存的修改"
                : "当前修改尚未保存"}
          </span>
          <button onClick={closeEditor}>取消</button>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)}>
              <ArrowLeft size={14} />
              上一步
            </button>
          )}
          {!readOnly && (
            <button className="sc-secondary" onClick={() => commit("draft")}>
              保存草稿
            </button>
          )}
          {step < 3 ? (
            <button className="ad-primary" onClick={() => setStep(step + 1)}>
              下一步
              <ArrowRight size={14} />
            </button>
          ) : (
            !readOnly && (
              <button
                className="ad-primary"
                disabled={!checked}
                onClick={() => commit("published")}
              >
                {initial.state === "paused" ? "重新启用" : "启用技能"}
              </button>
            )
          )}
        </footer>
      </Dialog>
      {leave && (
        <Dialog title="离开技能编辑？" close={() => setLeave(false)}>
          <p>当前修改尚未保存。可以返回继续编辑，或放弃本次修改。</p>
          <div className="sc-dialog-actions">
            <button onClick={() => setLeave(false)}>继续编辑</button>
            <button onClick={close}>放弃修改</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function SkillImport({
  role,
  existing,
  close,
  imported,
}: {
  role: SkillRole;
  existing: DemoSkill[];
  close: () => void;
  imported: (s: DemoSkill) => void;
}) {
  const folder = useRef<HTMLInputElement>(null);
  const entry = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<DemoSkill>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  async function choose(files: File[]) {
    setBusy(true);
    setCandidate(undefined);
    setChecked(false);
    setError("");
    setWarnings([]);
    try {
      const result = await readPackage(files, role, existing);
      setCandidate(result.skill);
      setWarnings(result.warnings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      className="sc-import-dialog"
      title="导入个人技能"
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="sc-import-steps">
        <span className={!candidate ? "active" : ""}>1 选择技能包</span>
        <ChevronRight size={14} />
        <span className={candidate && !checked ? "active" : ""}>
          2 解析与预览
        </span>
        <ChevronRight size={14} />
        <span className={checked ? "active" : ""}>3 校验与导入</span>
      </div>
      <div className="sc-import-zone">
        <Upload size={30} />
        <h3>{busy ? "正在读取技能包…" : "选择一个技能文件夹"}</h3>
        <p>包含唯一入口文件，可附带脚本、参考文档与素材。</p>
        <div>
          <button
            className="ad-primary"
            disabled={busy}
            onClick={() => folder.current?.click()}
          >
            选择文件夹
          </button>
          <button
            className="sc-secondary"
            disabled={busy}
            onClick={() => entry.current?.click()}
          >
            仅导入入口文件
          </button>
        </div>
        <small>支持本地文件夹与入口文件；当前演示不支持压缩包。</small>
        <input
          {...directory}
          ref={folder}
          hidden
          type="file"
          multiple
          aria-label="导入技能文件夹"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            void choose(files);
          }}
        />
        <input
          ref={entry}
          hidden
          type="file"
          accept=".md"
          aria-label="导入 SKILL.md"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            void choose(files);
          }}
        />
      </div>
      <div className="sc-info">
        <LockKeyhole size={14} />
        当前角色：{roleNames[role]}。可导入{roleNames[role]}与通用
        技能，其他角色的专属包将被拒绝。
      </div>
      {error && (
        <div className="sc-warning" role="alert">
          {error}
        </div>
      )}
      {candidate &&
        modelPreferenceErrors(
          candidate.modelPreference || defaultModelPreference(),
        ).length > 0 && (
          <div className="sc-warning">
            模型待配置：可以导入为草稿，配置完成后才能启用。
          </div>
        )}
      {candidate && (
        <>
          <div className="sc-import-preview">
            <div>
              <h3>{candidate.name}</h3>
              <p>{candidate.description}</p>
              <dl>
                <dt>标识</dt>
                <dd>{candidate.id}</dd>
                <dt>角色</dt>
                <dd>{roleNames[candidate.role]}</dd>
                <dt>版本</dt>
                <dd>{candidate.version}</dd>
                <dt>来源</dt>
                <dd>个人导入</dd>
              </dl>
            </div>
            <pre className="sc-tree">
              {[
                `${candidate.id}/`,
                "  SKILL.md",
                ...candidate.files.map((f) => "  " + f.path),
              ].join("\n")}
            </pre>
          </div>
          {warnings.map((w) => (
            <p className="sc-warning" key={w}>
              {w}
            </p>
          ))}
          {checked ? (
            <div className="sc-success">
              <Check size={17} />
              结构、元数据和角色范围校验通过。脚本未执行。
            </div>
          ) : (
            <button
              className="sc-secondary"
              onClick={() => {
                const errors = validateSkill(candidate, role, existing, true);
                setError(errors.join("\n"));
                setChecked(!errors.length);
              }}
            >
              确认并校验
            </button>
          )}
        </>
      )}
      <footer className="sc-dialog-actions">
        <button onClick={close} disabled={busy}>
          取消
        </button>
        <button
          className="sc-secondary"
          disabled={!candidate || !checked || busy}
          onClick={() =>
            candidate && imported({ ...candidate, state: "draft" })
          }
        >
          导入为草稿
        </button>
        <button
          className="ad-primary"
          disabled={
            !candidate ||
            !checked ||
            busy ||
            !!modelPreferenceErrors(
              candidate.modelPreference || defaultModelPreference(),
            ).length
          }
          onClick={() =>
            candidate &&
            !modelPreferenceErrors(
              candidate.modelPreference || defaultModelPreference(),
            ).length &&
            imported({ ...candidate, state: "published" })
          }
        >
          导入并启用
        </button>
      </footer>
    </Dialog>
  );
}
