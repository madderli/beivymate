import DisableWorkflowDialog from "./DisableWorkflowDialog";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  GitBranch,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Dialog } from "../../components";
import {
  configuredModels,
  isModelEnabled,
  roleNames,
  tiers,
  type Skill,
  type SkillRole,
} from "../skills/skill-state";
import {
  newStep,
  resolvedModel,
  workflowErrors,
  type WorkflowDesign,
  type WorkflowStep,
} from "./workflow-state";
import "../../preview/workflow-demo.css";

const roles: SkillRole[] = ["tester", "product", "developer", "operations"];
type Run = {
  phase: "idle" | "running" | "waiting" | "completed" | "stopped" | "error";
  index: number;
  logs: string[];
  approvals: number;
  reruns: number;
  snapshot?: WorkflowDesign;
};
const emptyRun = (): Run => ({
  phase: "idle",
  index: 0,
  logs: [],
  approvals: 0,
  reruns: 0,
});
const modelLabel = (step: WorkflowStep) =>
  step.model === "default"
    ? "Skill 默认"
    : step.model.startsWith("tier:")
      ? `按档位：${step.model.slice(5)}`
      : configuredModels.find((m) => m.id === step.model.slice(6))?.name ||
        "模型已删除";
const inputLabel = (step: WorkflowStep, w: WorkflowDesign) =>
  step.input === "workflow"
    ? "工作流输入"
    : step.input === "previous"
      ? "上一步输出"
      : w.steps.find((s) => `step:${s.id}` === step.input)?.output ||
        "输入已失效";

export default function WorkflowLibrary({
  skills,
  workflows,
  setWorkflows,
}: {
  skills: Skill[];
  workflows: WorkflowDesign[];
  setWorkflows: Dispatch<SetStateAction<WorkflowDesign[]>>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState<WorkflowDesign>();
  const [detailId, setDetailId] = useState("");
  const [disableTarget, setDisableTarget] = useState<{
    workflow: WorkflowDesign;
    editor?: boolean;
  }>();
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [run, setRun] = useState<Run>(emptyRun);
  const detail = workflows.find((w) => w.id === detailId);
  const published = skills.filter((s) => s.state === "published");
  const matches = workflows.filter(
    (w) =>
      (filter === "all" || (filter === "enabled") === w.enabled) &&
      `${w.name} ${w.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const active = run.phase === "running" || run.phase === "waiting";
  const detailErrors = detail ? workflowErrors(detail, skills) : [];

  useEffect(() => {
    if (run.phase !== "running" || !run.snapshot) return;
    const current = run.snapshot.steps[run.index];
    if (!current) return;
    const timer = setTimeout(() => {
      const invalid = workflowErrors(run.snapshot!, skills);
      if (invalid.length) {
        setRun((r) => ({
          ...r,
          phase: "error",
          logs: [...r.logs, `运行阻止：${invalid[0]}`],
        }));
        return;
      }
      const model = resolvedModel(current, skills);
      const message = `步骤 ${run.index + 1} 已生成 ${current.output} · 模型：${model?.name || "不使用模型"}`;
      if (current.confirmation === "human")
        setRun((r) => ({
          ...r,
          phase: "waiting",
          logs: [...r.logs, message, "等待人工确认"],
        }));
      else
        setRun((r) => {
          const index = r.index + 1;
          const done = index >= r.snapshot!.steps.length;
          return {
            ...r,
            index,
            phase: done ? "completed" : "running",
            logs: [
              ...r.logs,
              message,
              "自动确认通过",
              ...(done
                ? [
                    `工作流运行完成 · 最终输出：${r.snapshot!.finalOutput || current.output}`,
                  ]
                : [`开始步骤 ${index + 1}`]),
            ],
          };
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [run.phase, run.index, run.reruns, run.snapshot, skills]);

  function edit(w?: WorkflowDesign) {
    setErrors([]);
    setDetailId("");
    setRun(emptyRun());
    setDraft(
      w
        ? structuredClone(w)
        : {
            id: crypto.randomUUID(),
            name: "",
            description: "",
            source: "custom",
            enabled: true,
            roles: ["tester"],
            finalOutput: "",
            updated: "刚刚",
            steps: [newStep(published[0]?.id)],
            skills: [],
            tasks: [],
          },
    );
  }
  function patchStep(index: number, patch: Partial<WorkflowStep>) {
    setErrors([]);
    setDraft(
      (w) =>
        w && {
          ...w,
          steps: w.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
        },
    );
  }
  function move(index: number, direction: number) {
    setDraft((w) => {
      if (!w) return w;
      const steps = [...w.steps];
      [steps[index], steps[index + direction]] = [
        steps[index + direction],
        steps[index],
      ];
      return { ...w, steps };
    });
    setErrors([]);
  }
  function save() {
    if (!draft) return;
    const issues = workflowErrors(draft, skills);
    if (issues.length) {
      setErrors(issues);
      return;
    }
    const saved = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      skills: [...new Set(draft.steps.map((s) => s.skill))],
      updated: "刚刚",
    };
    setWorkflows((ws) =>
      ws.some((w) => w.id === saved.id)
        ? ws.map((w) => (w.id === saved.id ? saved : w))
        : [saved, ...ws],
    );
    setDraft(undefined);
    setNotice("工作流已保存，可在详情中模拟运行。");
  }
  function toggle(w: WorkflowDesign, editor = false) {
    if (w.enabled) {
      setDisableTarget({ workflow: w, editor });
      return;
    }
    const issues = workflowErrors(w, skills);
    if (issues.length) {
      setNotice(`无法启用：${issues[0]}`);
      return;
    }
    if (editor) setDraft({ ...w, enabled: true });
    else
      setWorkflows((ws) =>
        ws.map((x) =>
          x.id === w.id ? { ...x, enabled: true, updated: "刚刚" } : x,
        ),
      );
  }
  function stop(message = "模拟运行已停止") {
    setRun((r) => ({ ...r, phase: "stopped", logs: [...r.logs, message] }));
  }
  function start() {
    if (!detail || !detail.enabled) return;
    const issues = workflowErrors(detail, skills);
    if (issues.length) {
      setNotice(`无法运行：${issues[0]}`);
      return;
    }
    setRun({
      ...emptyRun(),
      phase: "running",
      snapshot: structuredClone(detail),
      logs: [
        `开始模拟「${detail.name}」· 共 ${detail.steps.length} 步`,
        "开始步骤 1",
      ],
    });
  }
  function approve() {
    setRun((r) => {
      const index = r.index + 1;
      const done = index >= r.snapshot!.steps.length;
      return {
        ...r,
        index,
        approvals: r.approvals + 1,
        phase: done ? "completed" : "running",
        logs: [
          ...r.logs,
          `步骤 ${r.index + 1} 人工确认通过`,
          done
            ? `工作流运行完成 · 最终输出：${r.snapshot!.finalOutput || r.snapshot!.steps.at(-1)!.output}`
            : `开始步骤 ${index + 1}`,
        ],
      };
    });
  }
  const flow = (w: WorkflowDesign, runtime = false) => (
    <ol className="wf-flow">
      {w.steps.map((s, i) => {
        const skill = skills.find((k) => k.id === s.skill);
        const phase = !runtime
          ? ""
          : i < run.index
            ? "done"
            : i === run.index
              ? run.phase
              : "pending";
        return (
          <li className={`wf-flow-step ${phase}`} key={s.id}>
            <span className="wf-flow-dot">
              {phase === "done" ? <Check size={16} /> : i + 1}
            </span>
            <div className="wf-flow-card">
              <strong>
                {skill?.icon || "🧩"} {skill?.name || "技能已删除"}
              </strong>
              <div className="wf-flow-io">
                <span>输入 ← {inputLabel(s, w)}</span>
                <span>输出 → {s.output}</span>
              </div>
              <div className="wf-badges">
                <span className={`wf-badge ${s.confirmation}`}>
                  {s.confirmation === "human" ? "人工确认" : "自动确认"}
                </span>
                <span
                  className={`wf-badge ${s.model !== "default" ? "override" : ""}`}
                >
                  {s.model !== "default" ? "已覆盖：" : ""}
                  {modelLabel(s)}
                </span>
                {skill?.state !== "published" && (
                  <span className="wf-badge invalid">
                    技能未发布 · 不可运行
                  </span>
                )}
              </div>
              {runtime && (
                <div className="wf-runtime-state" aria-live="polite">
                  {phase === "done"
                    ? "已完成"
                    : phase === "running"
                      ? "正在调用 Skill…（模拟）"
                      : phase === "waiting"
                        ? `待确认 · 输出摘要：${skill?.name}已生成 ${s.output}`
                        : phase === "stopped"
                          ? "运行已停止"
                          : phase === "error"
                            ? "运行被阻止"
                            : "待运行"}
                  {phase === "waiting" && (
                    <div className="wf-actions">
                      <button className="ad-primary" onClick={approve}>
                        确认通过
                      </button>
                      <button
                        className="sc-secondary"
                        onClick={() =>
                          setRun((r) => ({
                            ...r,
                            phase: "running",
                            reruns: r.reruns + 1,
                            logs: [...r.logs, `步骤 ${i + 1} 已驳回，重新运行`],
                          }))
                        }
                      >
                        驳回重跑
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );

  return (
    <main className="wf-main homepage-main">
      <div className="sc-page-heading homepage-heading">
        <div>
          <span className="ad-kicker">AGENT CAPABILITIES</span>
          <h1>我的工作流</h1>
          <p>把技能串成工作流，让重复工作有序自动完成。</p>
        </div>
        <button className="ad-primary" onClick={() => edit()}>
          <Plus size={16} />
          新建工作流
        </button>
      </div>
      <div className="wf-published-note">
        <ShieldCheck size={17} />
        只有已发布的技能可被工作流引用，草稿与停用技能不可选。
      </div>
      <div className="sc-toolbar">
        <label className="sc-search">
          <Search size={16} />
          <input
            aria-label="搜索工作流"
            placeholder="搜索工作流名称或描述"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="sc-source-filter" aria-label="工作流状态筛选">
          {[
            ["all", "全部"],
            ["enabled", "已启用"],
            ["disabled", "已停用"],
          ].map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              key={value}
            >
              {label}
              <span>
                {
                  workflows.filter(
                    (w) =>
                      value === "all" || (value === "enabled") === w.enabled,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="wf-grid">
        {matches.map((w) => {
          const invalid = workflowErrors(w, skills);
          return (
            <article
              className="wf-card"
              key={w.id}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest("button")) {
                  setDetailId(w.id);
                  setRun(emptyRun());
                }
              }}
            >
              <button
                className="wf-card-title"
                onClick={() => {
                  setDetailId(w.id);
                  setRun(emptyRun());
                }}
              >
                <GitBranch size={19} />
                <h2>{w.name}</h2>
                <ChevronRight size={16} />
              </button>
              <div className="wf-badges">
                <span className={`wf-badge ${w.source}`}>
                  {w.source === "builtin" ? "系统内置" : "自建"}
                </span>
                <span
                  className={`wf-badge ${w.enabled ? "enabled" : "disabled"}`}
                >
                  {w.enabled ? "已启用" : "已停用"}
                </span>
                {w.roles.map((r) => (
                  <span className="wf-badge" key={r}>
                    {roleNames[r]}
                  </span>
                ))}
              </div>
              <p className="wf-card-desc">{w.description}</p>
              <div className="wf-chain-preview">
                {w.steps.slice(0, 4).map((s, i) => (
                  <span className="wf-chain-item" key={s.id}>
                    {i > 0 && <span className="wf-chain-arrow">→</span>}
                    <span className="wf-chain-chip">
                      {skills.find((k) => k.id === s.skill)?.name || "未选择"}
                    </span>
                  </span>
                ))}
                {w.steps.length > 4 && (
                  <span className="wf-chain-chip">＋{w.steps.length - 4}</span>
                )}
              </div>
              {!!invalid.length && (
                <p className="wf-invalid">配置待处理：{invalid[0]}</p>
              )}
              <footer>
                <div className="wf-meta">
                  <span>{w.steps.length} 个步骤</span>
                  <span>
                    {new Set(w.steps.map((s) => s.skill)).size} 个 Skill
                  </span>
                  <span>更新于 {w.updated}</span>
                </div>
                <div className="wf-actions">
                  <button className="sc-secondary" onClick={() => edit(w)}>
                    编辑
                  </button>
                  <button className="sc-secondary" onClick={() => toggle(w)}>
                    {w.enabled ? "停用" : "启用"}
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
      {!matches.length && (
        <div className="wf-empty">
          <GitBranch size={30} />
          <h2>没有找到匹配的工作流</h2>
          <p>调整搜索和状态筛选，或创建新的工作流。</p>
        </div>
      )}
      <p className="wf-permanent-note">
        工作流不可删除，停用前会提示正在使用它的任务。配置自动保存在当前浏览器，运行演练为模拟。
      </p>

      {draft && (
        <Dialog
          className="wf-overlay"
          title={
            workflows.some((w) => w.id === draft.id)
              ? "编辑工作流"
              : "新建工作流"
          }
          close={() => setDraft(undefined)}
        >
          <div className="wf-overlay-tools">
            <span>按顺序连接已发布的 Skill</span>
            <label className="wf-enable-control">
              {draft.enabled ? "已启用" : "已停用"}
              <button
                role="switch"
                aria-label="启用工作流"
                aria-checked={draft.enabled}
                className="mr-switch"
                onClick={() => toggle(draft, true)}
              >
                <i />
              </button>
            </label>
          </div>
          <div className="wf-overlay-body">
            <div className="wf-editor-wrap">
              <section className="wf-form-card">
                <div className="wf-two-col">
                  <label>
                    工作流名称 <span className="wf-required">*</span>
                    <input
                      aria-label="工作流名称"
                      placeholder="例如 需求测试"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    最终输出（可选）
                    <input
                      aria-label="最终输出"
                      placeholder="例如 测试报告"
                      value={draft.finalOutput}
                      onChange={(e) =>
                        setDraft({ ...draft, finalOutput: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  描述
                  <textarea
                    aria-label="工作流描述"
                    placeholder="说明这个工作流适用于什么任务"
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <fieldset className="wf-roles">
                  <legend>适用角色</legend>
                  {roles.map((r) => (
                    <label key={r}>
                      <input
                        type="checkbox"
                        checked={draft.roles.includes(r)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            roles: e.target.checked
                              ? [...draft.roles, r]
                              : draft.roles.filter((x) => x !== r),
                          })
                        }
                      />
                      {roleNames[r]}
                    </label>
                  ))}
                </fieldset>
              </section>
              <section className="wf-form-card">
                <div className="wf-section-head">
                  <div>
                    <h3>步骤编排</h3>
                    <p>每一步声明 Skill、输入输出、确认方式和模型</p>
                  </div>
                  <span className="wf-badge human">默认人工确认</span>
                </div>
                <div className="wf-step-list">
                  {draft.steps.map((s, i) => (
                    <StepEditor
                      key={s.id}
                      step={s}
                      index={i}
                      workflow={draft}
                      skills={skills}
                      patch={(p) => patchStep(i, p)}
                      move={(d) => move(i, d)}
                      remove={() => {
                        setDraft({
                          ...draft,
                          steps: draft.steps.filter((x) => x.id !== s.id),
                        });
                        setErrors([]);
                      }}
                    />
                  ))}
                </div>
                <button
                  className="wf-add-step"
                  onClick={() => {
                    const step = newStep(published[0]?.id, draft.steps.length);
                    let n = draft.steps.length + 1;
                    while (
                      draft.steps.some((s) => s.output === `step${n}_output`)
                    )
                      n++;
                    step.output = `step${n}_output`;
                    setDraft({ ...draft, steps: [...draft.steps, step] });
                    setErrors([]);
                  }}
                >
                  <Plus size={16} />
                  添加步骤
                </button>
              </section>
              {!published.length && (
                <p className="wf-invalid" role="alert">
                  暂无已发布技能，请先在技能中心发布技能。
                </p>
              )}
              {!!errors.length && (
                <div className="wf-errors" role="alert">
                  {errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
              <p className="wf-permanent-note">
                工作流不可删除，停用后将无法被新任务选用。
              </p>
            </div>
          </div>
          <footer className="wf-editor-footer">
            <span>仅已发布的 Skill 可被选择</span>
            <div className="wf-actions">
              <button
                className="sc-secondary"
                onClick={() => setDraft(undefined)}
              >
                取消
              </button>
              <button className="ad-primary" onClick={save}>
                保存工作流
              </button>
            </div>
          </footer>
        </Dialog>
      )}

      {detail && (
        <Dialog
          className="wf-overlay"
          title="工作流详情"
          close={() => {
            setDetailId("");
            setRun(emptyRun());
          }}
        >
          <div className="wf-overlay-tools">
            <span>查看链路并模拟一次完整运行</span>
            <div className="wf-actions">
              <button
                className="sc-secondary"
                disabled={active}
                onClick={() => edit(detail)}
              >
                编辑
              </button>
              <button className="sc-secondary" onClick={() => toggle(detail)}>
                {detail.enabled ? "停用" : "启用"}
              </button>
              {active ? (
                <button className="sc-secondary" onClick={() => stop()}>
                  停止运行
                </button>
              ) : (
                <button
                  className="ad-primary"
                  disabled={!detail.enabled || !!detailErrors.length}
                  onClick={start}
                >
                  {run.phase === "completed" ? "再次运行" : "模拟运行"}
                </button>
              )}
            </div>
          </div>
          <div className="wf-overlay-body">
            <div className="wf-editor-wrap">
              <section className="wf-form-card wf-detail-hero">
                <h2>{detail.name}</h2>
                <p>{detail.description}</p>
                <div className="wf-badges">
                  <span className={`wf-badge ${detail.source}`}>
                    {detail.source === "builtin" ? "系统内置" : "自建"}
                  </span>
                  <span
                    className={`wf-badge ${detail.enabled ? "enabled" : "disabled"}`}
                  >
                    {detail.enabled ? "已启用" : "已停用"}
                  </span>
                </div>
                <div className="wf-detail-meta">
                  <span>
                    适用角色{" "}
                    <b>{detail.roles.map((r) => roleNames[r]).join(" / ")}</b>
                  </span>
                  <span>
                    最终输出 <b>{detail.finalOutput || "未指定"}</b>
                  </span>
                  <span>
                    {detail.steps.length} 个步骤 ·{" "}
                    {new Set(detail.steps.map((s) => s.skill)).size} 个 Skill
                  </span>
                </div>
                {!detail.enabled && (
                  <p className="wf-invalid">已停用的工作流不可运行。</p>
                )}
                {!!detailErrors.length && (
                  <div className="wf-errors" role="alert">
                    {detailErrors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}
              </section>
              <section className="wf-form-card">
                <h3>Skill 链路</h3>
                {flow(detail)}
              </section>
              {run.phase !== "idle" && run.snapshot && (
                <section className="wf-form-card wf-runtime">
                  <h3>运行模拟</h3>
                  <p>人工确认节点会暂停等待操作；不调用真实模型。</p>
                  {run.phase === "completed" && (
                    <div className="wf-run-summary" role="status">
                      <strong>✓ 工作流运行完成</strong>
                      <p>
                        {run.snapshot.steps.length} 个步骤 · {run.approvals}{" "}
                        次人工确认 · {run.reruns} 次驳回重跑
                      </p>
                    </div>
                  )}
                  {flow(run.snapshot, true)}
                  <h4>运行日志</h4>
                  <div className="wf-log" role="log" aria-live="polite">
                    {run.logs.map((line, i) => (
                      <div key={i}>
                        {String(i + 1).padStart(2, "0")}　{line}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {disableTarget && (
        <DisableWorkflowDialog
          name={disableTarget.workflow.name}
          tasks={disableTarget.workflow.tasks}
          close={() => setDisableTarget(undefined)}
          confirm={() => {
            const id = disableTarget.workflow.id;
            if (disableTarget.editor)
              setDraft((d) => d && { ...d, enabled: false });
            else {
              setWorkflows((ws) =>
                ws.map((w) =>
                  w.id === id ? { ...w, enabled: false, updated: "刚刚" } : w,
                ),
              );
              if (detailId === id && active) stop("工作流已停用，模拟运行停止");
            }
            setDisableTarget(undefined);
            setNotice(
              disableTarget.editor
                ? "已设为停用，保存工作流后生效。"
                : "工作流已停用。",
            );
          }}
        />
      )}
      {notice && (
        <div className="ad-toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}

function StepEditor({
  step,
  index,
  workflow,
  skills,
  patch,
  move,
  remove,
}: {
  step: WorkflowStep;
  index: number;
  workflow: WorkflowDesign;
  skills: Skill[];
  patch: (p: Partial<WorkflowStep>) => void;
  move: (d: number) => void;
  remove: () => void;
}) {
  const [search, setSearch] = useState("");
  const published = skills.filter((s) => s.state === "published");
  const options = published.filter(
    (s) =>
      `${s.name} ${s.id}`.toLowerCase().includes(search.toLowerCase()) ||
      s.id === step.skill,
  );
  const selectable = published.some((s) => s.id === step.skill);
  const validInput =
    step.input === "workflow" ||
    (step.input === "previous" && index > 0) ||
    workflow.steps.slice(0, index).some((s) => `step:${s.id}` === step.input);
  const modelExists =
    step.model === "default" ||
    step.model.startsWith("tier:") ||
    configuredModels.some(
      (m) => `model:${m.id}` === step.model && isModelEnabled(m),
    );
  return (
    <article className="wf-step-card" aria-label={`步骤 ${index + 1}`}>
      <span className="wf-step-index">{index + 1}</span>
      <div>
        <div className="wf-step-top">
          <h4>步骤 {index + 1}</h4>
          <div className="wf-actions">
            <button
              aria-label="上移步骤"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              aria-label="下移步骤"
              disabled={index === workflow.steps.length - 1}
              onClick={() => move(1)}
            >
              <ArrowDown size={15} />
            </button>
            <button aria-label="删除步骤" onClick={remove}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="wf-step-grid">
          <label>
            Skill
            <input
              aria-label={`步骤 ${index + 1} 搜索技能`}
              placeholder="搜索已发布 Skill"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label={`步骤 ${index + 1} 技能`}
              value={step.skill}
              onChange={(e) => patch({ skill: e.target.value })}
            >
              <option value="">请选择已发布技能</option>
              {!selectable && step.skill && (
                <option value={step.skill} disabled>
                  原引用未发布，请重新选择
                </option>
              )}
              {options.map((s) => (
                <option value={s.id} key={s.key}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
            {!selectable && (
              <small className="wf-invalid">仅已发布技能可被工作流引用。</small>
            )}
            {search &&
              !published.some((s) =>
                `${s.name} ${s.id}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && <small>没有匹配的已发布技能</small>}
          </label>
          <label>
            输入来源
            <select
              aria-label={`步骤 ${index + 1} 输入来源`}
              value={step.input}
              onChange={(e) => patch({ input: e.target.value })}
            >
              {!validInput && (
                <option value={step.input} disabled>
                  输入来源已失效，请重新选择
                </option>
              )}
              <option value="workflow">工作流输入</option>
              {index > 0 && <option value="previous">上一步输出</option>}
              {workflow.steps.slice(0, index).map((s, i) => (
                <option value={`step:${s.id}`} key={s.id}>
                  步骤 {i + 1} · {s.output || "未命名输出"}
                </option>
              ))}
            </select>
          </label>
          <label>
            输出命名
            <input
              aria-label={`步骤 ${index + 1} 输出命名`}
              value={step.output}
              placeholder={`step${index + 1}_output`}
              onChange={(e) => patch({ output: e.target.value })}
            />
          </label>
          <label>
            模型
            <div className="wf-model-line">
              <select
                aria-label={`步骤 ${index + 1} 模型`}
                value={step.model}
                onChange={(e) => patch({ model: e.target.value })}
              >
                {!modelExists && (
                  <option value={step.model} disabled>
                    原模型不可用，请重新选择
                  </option>
                )}
                <option value="default">使用 Skill 默认</option>
                <optgroup label="按档位">
                  {tiers.map((t) => (
                    <option key={t} value={`tier:${t}`}>
                      {t}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="指定模型">
                  {configuredModels.filter(isModelEnabled).map((m) => (
                    <option key={m.id} value={`model:${m.id}`}>
                      {m.provider} · {m.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              {step.model !== "default" && (
                <span className="wf-badge override">已覆盖</span>
              )}
            </div>
          </label>
          <fieldset className="wf-confirmation">
            <legend>确认方式</legend>
            {[
              ["human", "人工确认"],
              ["auto", "自动确认"],
            ].map(([value, name]) => (
              <label
                className={step.confirmation === value ? "selected" : ""}
                key={value}
              >
                <input
                  type="radio"
                  name={`confirmation-${step.id}`}
                  checked={step.confirmation === value}
                  onChange={() =>
                    patch({ confirmation: value as "human" | "auto" })
                  }
                />
                {name}
              </label>
            ))}
            <p>人工确认：运行时暂停，确认后继续；自动确认：直接进入下一步。</p>
          </fieldset>
        </div>
      </div>
    </article>
  );
}
