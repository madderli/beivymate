import { WorkspaceCard } from "../WorkspaceCard";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Layers,
  Pause,
  Plus,
} from "lucide-react";
import { Brand, Dialog } from "../components";
import { WorkspaceEditor, type WorkspaceDraft } from "../WorkspaceEditor";
import "./workspace-cards-demo.css";

type DemoTask = { name: string; status: string; related: boolean };
type CardWorkspace = Omit<WorkspaceDraft, "pending"> & {
  pending: DemoTask[];
  enabled: boolean;
};
const initialWorkspaces: CardWorkspace[] = [
  {
    key: "his",
    id: "HIS",
    name: "医院挂号、收费与医保业务协同工作区",
    description:
      "围绕挂号、收费、医保结算和跨产品数据一致性，统一管理业务验证、需求资料与项目协作。",
    products: ["HIS · 医院信息系统", "CIS · 临床信息系统"],
    projects: ["市一院 · 智慧医院建设"],
    directories: [
      "/knowledge/hospital/requirements",
      "/knowledge/hospital/product-guides",
      "/knowledge/hospital/insurance",
    ],
    isDefault: true,
    enabled: true,
    pending: [
      { name: "医保结算异常场景验证", status: "待执行", related: false },
      {
        name: "门诊收费与医嘱状态一致性核对",
        status: "待确认",
        related: false,
      },
      { name: "检验收费跨产品协同验证", status: "待执行", related: true },
    ],
  },
  {
    key: "cis",
    id: "CIS",
    name: "临床业务工作区",
    description: "连接门诊与住院诊疗流程，持续推进医嘱、病历与临床业务验证。",
    products: ["CIS · 临床信息系统"],
    projects: ["市二院 · 门诊升级", "市三院 · 住院改造"],
    directories: [
      "/knowledge/clinical/requirements",
      "/knowledge/clinical/guides",
    ],
    isDefault: false,
    enabled: true,
    pending: [
      { name: "住院医嘱审核流程验证", status: "待执行", related: false },
      { name: "门诊支付信息同步", status: "待确认", related: true },
    ],
  },
  {
    key: "lis",
    id: "LIS",
    name: "检验业务工作区",
    description: "管理检验申请、标本流转和报告复核的业务资料与验证工作。",
    products: ["LIS · 检验信息系统"],
    projects: ["市一院 · 智慧医院建设"],
    directories: ["/knowledge/laboratory"],
    isDefault: false,
    enabled: true,
    pending: [],
  },
  {
    key: "edis",
    id: "EDIS",
    name: "急诊业务工作区",
    description: "围绕急诊分诊与绿色通道开展业务验证，当前阶段的任务均已关闭。",
    products: ["EDIS · 急诊信息系统"],
    projects: [],
    directories: ["/knowledge/emergency"],
    isDefault: false,
    enabled: false,
    pending: [],
  },
];

export default function WorkspaceCardsDemo() {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [editor, setEditor] = useState<{ value?: CardWorkspace } | null>(null);
  const [disableKey, setDisableKey] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [task, setTask] = useState<DemoTask>();
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const active = workspaces.find((w) => w.key === activeKey);
  const disableTarget = workspaces.find((w) => w.key === disableKey);
  function toggle(w: CardWorkspace) {
    if (w.enabled && w.pending.length) return;
    if (w.enabled) {
      setDisableKey(w.key);
      return;
    }
    setWorkspaces((old) =>
      old.map((value) =>
        value.key === w.key ? { ...value, enabled: true } : value,
      ),
    );
    setNotice(`${w.id} 工作区已启用。`);
  }
  function edit(w: CardWorkspace) {
    if (!w.pending.length) setEditor({ value: w });
  }
  return (
    <div className="wsd-demo wcd-demo">
      <header className="wsd-demo-header">
        <Brand />
        <span>工作区卡片 · 设计预览</span>
        <a href="/">返回应用</a>
      </header>
      <main className="wsd-demo-main">
        {active ? (
          <>
            <button
              className="wcd-back"
              onClick={() => {
                setActiveKey("");
                setPrompt("");
              }}
            >
              <ArrowLeft size={15} />
              我的工作区
            </button>
            <div className="wcd-workspace-title">
              <span className="wcd-icon">
                <Layers size={22} />
              </span>
              <b>{active.id}</b>
              <h1>{active.name}</h1>
            </div>
            <p className="wsd-preview-note">
              交互演示 · 可查看任务，或创建一项演示任务；不调用后端执行。
            </p>
            {!active.enabled && (
              <div className="wcd-disabled-banner">
                <Pause size={16} />
                <span>这个工作区已停用，启用后可继续开展任务。</span>
                <button onClick={() => toggle(active)}>启用工作区</button>
              </div>
            )}
            <section className="wcd-assistant">
              <div className="wcd-assistant-brand">
                <img src="/omnialba-mark.svg" alt="" />
                OmniAlba · 工作区助手
              </div>
              <h2>
                {active.pending.length
                  ? `还有 ${active.pending.length} 项任务，我们一起继续推进。`
                  : "当前没有未完成任务，可以开始新的目标。"}
              </h2>
              <div className="wcd-task-list">
                {active.pending.map((t, index) => (
                  <button key={index} onClick={() => setTask(t)}>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.related ? "关联任务" : "独立任务"}</small>
                    </span>
                    <span>{t.status}</span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            </section>
            <form
              className="wcd-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (!active.enabled || !prompt.trim()) return;
                const next: DemoTask = {
                  name: prompt.trim(),
                  status: "待执行",
                  related: false,
                };
                setWorkspaces((old) =>
                  old.map((w) =>
                    w.key === active.key
                      ? { ...w, pending: [...w.pending, next] }
                      : w,
                  ),
                );
                setPrompt("");
              }}
            >
              <textarea
                aria-label="演示任务目标"
                placeholder="告诉 OmniAlba 你想完成什么？在这里输入一项演示任务…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={!active.enabled}
              />
              <footer>
                <span>本页仅演示任务创建与卡片状态联动</span>
                <button
                  className="wsd-primary"
                  disabled={!active.enabled || !prompt.trim()}
                >
                  <Plus size={14} />
                  新任务
                </button>
              </footer>
            </form>
          </>
        ) : (
          <>
            <div className="wsd-page-heading">
              <div>
                <span>WORKSPACES</span>
                <h1>我的工作区</h1>
                <p>打开工作区，与 OmniAlba 一起推进任务。</p>
              </div>
              <button className="wsd-primary" onClick={() => setEditor({})}>
                <Plus size={16} />
                新增工作区
              </button>
            </div>
            <p className="wsd-preview-note">
              交互 Demo ·
              展示有任务、任务已关闭和停用状态；数据仅保留在本次页面中。
            </p>
            {notice && (
              <p className="wsd-success" role="status">
                <Check size={16} />
                {notice}
              </p>
            )}
            <div className="wcd-grid">
              {workspaces.map((w) => (
                <WorkspaceCard
                  key={w.key}
                  workspace={w}
                  edit={() => edit(w)}
                  toggle={() => toggle(w)}
                  open={() => {
                    setActiveKey(w.key);
                    setPrompt("");
                    setNotice("");
                  }}
                />
              ))}
            </div>
          </>
        )}
      </main>
      {editor && (
        <WorkspaceEditor
          initial={editor.value}
          existing={workspaces}
          close={() => setEditor(null)}
          save={(value) => {
            setWorkspaces((old) => {
              const previous = old.find((w) => w.key === value.key);
              const updated: CardWorkspace = {
                ...value,
                enabled: previous?.enabled ?? true,
                pending: previous?.pending ?? [],
              };
              const next = previous
                ? old.map((w) => (w.key === value.key ? updated : w))
                : [...old, updated];
              return next.map((w) =>
                value.isDefault && w.key !== value.key
                  ? { ...w, isDefault: false }
                  : w,
              );
            });
            setEditor(null);
            setNotice(`${value.id} 工作区已保存。`);
          }}
        />
      )}
      {disableTarget && (
        <Dialog
          title="停用工作区"
          className="wcd-confirm"
          close={() => setDisableKey("")}
        >
          <div className="wcd-confirm-body">
            <div className="wcd-confirm-intro">
              <span className="wcd-icon">
                <Pause size={22} />
              </span>
              <section>
                <h3>暂时停用 {disableTarget.id}？</h3>
                <p>
                  当前所有任务均已关闭。停用后保留工作区配置和历史资料，可随时重新启用。
                </p>
              </section>
            </div>
            <div>
              <span>{disableTarget.name}</span>
              <b>0 项未完成任务</b>
            </div>
          </div>
          <footer>
            <button className="wsd-secondary" onClick={() => setDisableKey("")}>
              取消
            </button>
            <button
              className="wsd-primary"
              onClick={() => {
                if (disableTarget.pending.length) return;
                setWorkspaces((old) =>
                  old.map((w) =>
                    w.key === disableTarget.key ? { ...w, enabled: false } : w,
                  ),
                );
                setNotice(`${disableTarget.id} 工作区已停用。`);
                setDisableKey("");
              }}
            >
              确认停用
            </button>
          </footer>
        </Dialog>
      )}
      {task && (
        <Dialog
          title="任务预览"
          className="wcd-confirm"
          close={() => setTask(undefined)}
        >
          <div className="wcd-confirm-body">
            <h3>{task.name}</h3>
            <p>
              {task.related ? "关联任务" : "独立任务"} · {task.status}
            </p>
            <p>
              这是工作区卡片 Demo
              中的任务预览。正式任务执行仍通过应用中的工作区进行。
            </p>
          </div>
          <footer>
            <button className="wsd-primary" onClick={() => setTask(undefined)}>
              返回工作区
            </button>
            {active?.enabled && (
              <button
                className="wsd-secondary"
                onClick={() => {
                  setWorkspaces((old) =>
                    old.map((w) =>
                      w.key === active.key
                        ? { ...w, pending: w.pending.filter((t) => t !== task) }
                        : w,
                    ),
                  );
                  setTask(undefined);
                }}
              >
                关闭演示任务
              </button>
            )}
          </footer>
        </Dialog>
      )}
    </div>
  );
}
