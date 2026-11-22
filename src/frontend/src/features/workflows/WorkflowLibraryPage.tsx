import { formatModifiedTime } from "../formatModifiedTime";
import {
  BuiltinResourceIcon,
  ResourceIconPicker,
} from "../../BuiltinResourceIcon";
import { createPortal } from "react-dom";
import "../skills/skill-create.css";
import { useEffect, useState, useRef } from "react";
import {
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  X,
  Pause,
  TriangleAlert,
} from "lucide-react";
import { request } from "../../api";
import { Dialog } from "../../components";
import {
  configuredModels,
  isModelEnabled,
  roleNames,
  stateNames,
  type Skill,
  type SkillRole,
} from "../skills/skill-state";
import { loadModelLibrary } from "../skills/model-api";
import "./workflow-center.css";

type Step = {
  id: string;
  skill: string;
  model: string;
  confirmation: "inherit" | "human" | "auto";
  supplement?: string;
  analysisStrategy?: string | null;
};
type Definition = {
  name: string;
  description: string;
  icon: string;
  roles: SkillRole[];
  confirmation: "human" | "auto";
  steps: Step[];
};
type Flow = Definition & {
  id: string;
  revision: string;
  state: string;
  enabled: boolean;
  updated: string;
  errors: string[];
  references: string[];
  source: string;
  legacyRequirements?: boolean;
  legacyNotes?: { input: string; outputs: { step: number; text: string }[] };
};
const states: Record<string, string> = {
  draft: "草稿",
  discovered: "草稿",
  invalid: "草稿",
  validated: "待启用",
  published: "已启用",
  paused: "已停用",
};

const newStep = (): Step => ({
  id: "s" + crypto.randomUUID().replaceAll("-", ""),
  skill: "",
  model: "default",
  confirmation: "inherit",
});
const define = (f: Flow): Definition => ({
  name: f.name,
  description: f.description,
  icon: f.icon,
  roles: f.roles,
  confirmation: f.confirmation,
  steps: f.steps.map(
    ({ id, skill, model, confirmation, analysisStrategy, supplement }) => ({
      id,
      skill,
      model,
      confirmation,
      analysisStrategy,
      supplement,
    }),
  ),
});

export default function WorkflowLibraryPage({
  skills,
  activeRole,
  active = true,
  onOpenSkills,
}: {
  skills: Skill[];
  activeRole?: SkillRole;
  active?: boolean;
  onOpenSkills?: () => void;
}) {
  const [icons, setIcons] = useState<string[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]),
    [role, setRole] = useState<SkillRole>(activeRole || "tester"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("全部");
  const [draft, setDraft] = useState<Definition>(),
    [editing, setEditing] = useState<Flow>(),
    [detail, setDetail] = useState<Flow>(),
    [confirm, setConfirm] = useState<{
      flow: Flow;
      action: "pause" | "delete";
    }>();
  const [errors, setErrors] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [, modelsChanged] = useState(0);
  const [editorStep, setEditorStep] = useState(0);
  const editorDialog = useRef<HTMLDialogElement>(null);
  const editorOpen = Boolean(draft) && active;
  useEffect(() => {
    if (!editorOpen) return;
    const dialog = editorDialog.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
    };
  }, [editorOpen]);
  useEffect(() => {
    if (
      editorOpen &&
      errors.some((message) => /(^|\n)第\s*\d+\s*步[：:]/.test(message))
    )
      setEditorStep(1);
    if (editorOpen && errors.length)
      editorDialog.current
        ?.querySelector('[role="alert"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [errors, editorOpen]);
  const nextEditorStep = () => {
    if (!draft) return;
    if (editorStep === 0 && (!draft.name.trim() || !draft.roles.length)) {
      setErrors(["请填写工作流名称并选择适用角色。"]);
      return;
    }
    if (editorStep === 1 && draft.steps.some((s) => !s.skill)) {
      setErrors(
        draft.steps.flatMap((step, i) =>
          step.skill ? [] : [`第${i + 1}步：请选择技能。`],
        ),
      );
      return;
    }
    setErrors([]);
    setEditorStep((n) => Math.min(2, n + 1));
  };
  useEffect(() => {
    if (activeRole) setRole(activeRole);
  }, [activeRole]);
  const [skillOptions, setSkillOptions] = useState(skills);
  const [skillOptionError, setSkillOptionError] = useState("");
  const [skillsRefreshing, setSkillsRefreshing] = useState(false);
  useEffect(() => setSkillOptions(skills), [skills]);
  const refreshSkillOptions = async () => {
    setSkillsRefreshing(true);
    try {
      const result = await request<{
        items: Skill[];
        errors: { message: string }[];
      }>("/skill-center");
      setSkillOptions(result.items);
      setSkillOptionError(result.errors.map((e) => e.message).join("；"));
    } catch (e) {
      setSkillOptionError(
        e instanceof Error ? e.message : "技能读取失败，请重试",
      );
    } finally {
      setSkillsRefreshing(false);
    }
  };
  useEffect(() => {
    if (!editorOpen) return;
    void refreshSkillOptions();
    const refresh = () => void refreshSkillOptions();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [editorOpen]);
  const visibleSkillOptions = skillOptions.filter((s) =>
    (s.roles || [s.role]).some((r) => r === "common" || r === role),
  );
  const eligible = visibleSkillOptions.filter((s) => s.state === "published");
  const refresh = async () => {
    const result = await request<{
      items: Flow[];
      warnings: string[];
      role: SkillRole;
    }>("/workflow-center");
    setFlows(result.items);
    setRole(activeRole || result.role || "tester");
    if (result.warnings.length) setErrors(result.warnings);
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      request<{ items: Flow[]; warnings: string[]; role: SkillRole }>(
        "/workflow-center",
      ),
      loadModelLibrary(),
      request<{ icons: string[] }>("/workflow-center/options"),
    ])
      .then(([r, , options]) => {
        if (active) {
          setFlows(r.items);
          setIcons(options.icons);
          setRole(activeRole || r.role || "tester");
          setErrors(r.warnings);
          modelsChanged((n) => n + 1);
        }
      })
      .catch((e) => {
        if (active) setErrors([e.message]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    setNotice("");
    try {
      await work();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "操作失败，请重试"]);
    } finally {
      setBusy(false);
    }
  };
  const start = (f?: Flow, copy = false) => {
    setErrors([]);
    setNotice("");
    setEditorStep(0);
    setEditing(copy ? undefined : f);
    setDraft(
      f
        ? structuredClone({
            ...define(f),
            name: f.name + (copy ? "（副本）" : ""),
          })
        : {
            name: "",
            description: "",
            icon: icons[0] || "wf:branch",
            roles: [role],
            confirmation: "human",
            steps: [newStep()],
          },
    );
    setDetail(undefined);
  };
  const change = (patch: Partial<Definition>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const stepChange = (i: number, patch: Partial<Step>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            steps: d.steps.map((s, n) => (n === i ? { ...s, ...patch } : s)),
          }
        : d,
    );
  const stepErrors = (index: number) =>
    errors
      .flatMap((message) => message.split("\n"))
      .filter((message) =>
        new RegExp(`^第\\s*${index + 1}\\s*步[：:]`).test(message),
      );
  const save = (validate: boolean) =>
    run(async () => {
      if (!draft) return;
      const f = await request<Flow>(
        "/workflow-center" + (editing ? "/" + editing.id : ""),
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            definition: draft,
            revision: editing?.revision,
          }),
        },
      );
      setEditing(f);
      setDraft(define(f));
      if (validate) {
        const checked = await request<Flow>(
          `/workflow-center/${f.id}/actions`,
          {
            method: "POST",
            body: JSON.stringify({ action: "validate", revision: f.revision }),
          },
        );
        setEditing(checked);
        if (checked.errors.length) {
          setEditing(checked);
          await refresh();
          setErrors(checked.errors);
          return;
        }
      }
      await refresh();
      setNotice(validate ? "检查通过，工作流待启用。" : "草稿已保存。");
    });
  const openSkillLibrary = () =>
    run(async () => {
      if (!draft) return;
      await request<Flow>(
        "/workflow-center" + (editing ? "/" + editing.id : ""),
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            definition: draft,
            revision: editing?.revision,
          }),
        },
      );
      await refresh();
      setDraft(undefined);
      setEditing(undefined);
      setErrors([]);
      setNotice("已保存当前工作流草稿。");
      if (onOpenSkills) onOpenSkills();
      else location.hash = "skills";
    });
  const act = (f: Flow, action: string) =>
    run(async () => {
      const result = await request<Flow>(`/workflow-center/${f.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, revision: f.revision }),
      });
      await refresh();
      if (result.errors.length) setErrors(result.errors);
      else
        setNotice(
          action === "enable"
            ? `“${f.name}”工作流已启用。`
            : `“${f.name}”工作流已停用。`,
        );
      setConfirm(undefined);
      setDetail(undefined);
    });
  const move = (i: number, delta: number) => {
    if (!draft) return;
    const steps = [...draft.steps];
    [steps[i], steps[i + delta]] = [steps[i + delta], steps[i]];
    change({ steps });
    setNotice("步骤顺序已调整。");
  };
  const shown = flows.filter(
    (f) =>
      (filter === "全部" || states[f.state] === filter) &&
      (f.name + " " + f.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const alerts = (
    <>
      {errors.length > 0 && (
        <div className="wfc-alert" role="alert">
          <b>⚠ 请处理以下问题</b>
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {notice && (
        <div className="wfc-notice" role="status">
          {notice}
        </div>
      )}
    </>
  );
  const skillName = (id: string) =>
    skillOptions.find((s) => s.id === id)?.name || "技能缺失";
  const strategyNames: Record<string, string> = {
    simple: "简单",
    standard: "标准",
    deep: "复杂",
  };
  const strategiesFor = (id: string) =>
    skillOptions.find((s) => s.id === id)?.analysisStrategies || [];
  const modelName = (id: string) =>
    id === "default"
      ? "使用技能设置"
      : configuredModels.find((m) => m.id === id)?.name || "模型缺失";
  const legacyNotes = (flow: Flow) => (
    <details className="wfc-legacy-notes">
      <summary>旧版补充内容（仅供迁移参考）</summary>
      {flow.legacyNotes?.input && <p>旧输入要求：{flow.legacyNotes.input}</p>}
      {flow.legacyNotes?.outputs.map((v) => (
        <p key={v.step}>
          步骤 {v.step} 旧输出要求：{v.text}
        </p>
      ))}
    </details>
  );
  if (!active) return null;
  if (draft)
    return createPortal(
      <dialog
        ref={editorDialog}
        className="sa-dialog wfc-dialog"
        aria-labelledby="workflow-editor-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) {
            setDraft(undefined);
            setEditing(undefined);
            setErrors([]);
          }
        }}
      >
        <header className="sa-header">
          <div>
            <h1 id="workflow-editor-title">
              {editing ? "编辑工作流" : "新建工作流"}
            </h1>
            <p>把技能按工作顺序编排，形成可重复使用的流程。</p>
          </div>
          <div className="sa-header-right">
            <span className="sa-pill">
              {editing &&
              JSON.stringify(draft) === JSON.stringify(define(editing))
                ? states[editing.state] || "草稿"
                : "草稿（未保存）"}
            </span>
            <button
              className="sa-icon"
              aria-label="关闭工作流编辑"
              disabled={busy}
              onClick={() => {
                setDraft(undefined);
                setEditing(undefined);
                setErrors([]);
              }}
            >
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="sa-body">
          <nav className="sa-steps" aria-label="工作流步骤">
            <ol className="sa-step-list">
              {["基本信息", "技能编排", "配置检查"].map((title, i) => (
                <li
                  key={title}
                  className={editorStep === i ? "active" : ""}
                  aria-current={editorStep === i ? "step" : undefined}
                >
                  <span className="sa-number">{i + 1}</span>
                  {title}
                </li>
              ))}
            </ol>
            <div className="sa-step-hint">
              检查配置后再启用。
              <br />
              只有启用的工作流可用于任务。
            </div>
          </nav>
          <main className="sa-content wfc">
            <div className="sa-page-heading">
              <div className="sa-eyebrow">
                第{["一", "二", "三"][editorStep]}步
              </div>
              <div>
                <h2>
                  {
                    [
                      "先给工作流一张名片",
                      "按工作顺序编排技能",
                      "检查配置，准备启用",
                    ][editorStep]
                  }
                </h2>
                <p>
                  {
                    [
                      "设置名称、角色和默认确认方式。",
                      "从已发布的角色可使用技能和通用技能中选择，按需选择模型、确认方式及分析策略",
                      "检查配置完整性；保存后仍需手动启用。",
                    ][editorStep]
                  }
                </p>
              </div>
            </div>
            {alerts}
            {editing?.legacyRequirements && (
              <div className="wfc-notice">
                此工作流含旧版输入／输出补充。保存时会保留原文件历史副本，并移除流程内的补充要求；请按需在后续任务中配置。
                {legacyNotes(editing)}
              </div>
            )}
            <form
              id="wfc-editor-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (editorStep < 2) nextEditorStep();
                else void save(true);
              }}
            >
              <div className="wfc-basics" hidden={editorStep !== 0}>
                <label>
                  图标
                  <ResourceIconPicker
                    value={draft.icon}
                    options={icons}
                    onChange={(icon) => change({ icon })}
                    disabled={busy}
                  />
                </label>
                <label>
                  工作流名称 *
                  <input
                    required
                    maxLength={100}
                    value={draft.name}
                    placeholder="给工作流起个名字"
                    onChange={(e) => change({ name: e.target.value })}
                  />
                </label>
                <label>
                  默认确认方式
                  <select
                    value={draft.confirmation}
                    onChange={(e) =>
                      change({
                        confirmation: e.target
                          .value as Definition["confirmation"],
                      })
                    }
                  >
                    <option value="human">人工确认</option>
                    <option value="auto">自动继续</option>
                  </select>
                </label>
                <label className="wfc-full">
                  描述
                  <textarea
                    rows={3}
                    className="wfc-description"
                    value={draft.description}
                    maxLength={1024}
                    placeholder="说明这套流程完成什么工作、适合什么场景"
                    onChange={(e) => change({ description: e.target.value })}
                  />
                </label>
                <div className="wfc-full">
                  <b>适用角色 *</b>
                  <div className="wfc-roles">
                    {Object.entries(roleNames).map(([r, label]) => (
                      <label key={r}>
                        <input
                          type="checkbox"
                          checked={draft.roles.includes(r as SkillRole)}
                          onChange={(e) =>
                            change({
                              roles: e.target.checked
                                ? [...draft.roles, r as SkillRole]
                                : draft.roles.filter((v) => v !== r),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div hidden={editorStep !== 1}>
                <div className="wfc-stephead">
                  <h3>
                    技能编排 <small>{draft.steps.length} 个步骤</small>
                  </h3>
                  <button
                    type="button"
                    disabled={busy || draft.steps.length >= 100}
                    onClick={() =>
                      change({ steps: [...draft.steps, newStep()] })
                    }
                  >
                    <Plus size={15} />
                    添加步骤
                  </button>
                </div>
                {skillOptionError && (
                  <div className="wfc-alert" role="alert">
                    技能读取提示：{skillOptionError}
                  </div>
                )}
                <div className="wfc-skill-availability" role="status">
                  {eligible.length
                    ? `当前可选 ${eligible.length} 个已启用技能。`
                    : visibleSkillOptions.length
                      ? "当前角色暂无已启用技能。已验证的技能还需在技能库中启用，草稿需先完成检查与启用。"
                      : "当前角色暂无可用技能，请先在技能库中创建或导入。"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      void openSkillLibrary();
                    }}
                  >
                    打开技能库
                  </button>
                  <button
                    type="button"
                    disabled={skillsRefreshing}
                    onClick={() => void refreshSkillOptions()}
                  >
                    {skillsRefreshing ? "读取中…" : "刷新技能"}
                  </button>
                </div>
                {draft.steps.map((s, i) => (
                  <div
                    className={`wfc-step${stepErrors(i).length ? " wfc-step-invalid" : ""}`}
                    key={s.id}
                  >
                    {stepErrors(i).map((error) => (
                      <p className="wfc-step-error" key={error}>
                        {error}
                      </p>
                    ))}
                    <div className="wfc-steprow">
                      <span>步骤 {i + 1}</span>
                      <select
                        aria-label={`第${i + 1}步技能`}
                        required
                        value={s.skill}
                        onChange={(e) =>
                          stepChange(i, {
                            skill: e.target.value,
                            analysisStrategy: null,
                          })
                        }
                      >
                        <option value="">请选择技能</option>
                        {s.skill &&
                          !visibleSkillOptions.some(
                            (v) => v.id === s.skill,
                          ) && (
                            <option value={s.skill}>技能已失效／不可用</option>
                          )}
                        {visibleSkillOptions.map((v) => (
                          <option
                            key={v.id}
                            value={v.id}
                            disabled={v.state !== "published"}
                          >
                            {v.name}
                            {v.state !== "published"
                              ? `（${stateNames[v.state]}，需启用）`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`第${i + 1}步模型`}
                        value={s.model}
                        onChange={(e) =>
                          stepChange(i, { model: e.target.value })
                        }
                      >
                        <option value="default">使用技能设置</option>
                        {s.model !== "default" &&
                          !configuredModels.some((m) => m.id === s.model) && (
                            <option value={s.model}>模型已缺失</option>
                          )}
                        {configuredModels.filter(isModelEnabled).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`第${i + 1}步确认方式`}
                        value={s.confirmation}
                        onChange={(e) =>
                          stepChange(i, {
                            confirmation: e.target
                              .value as Step["confirmation"],
                          })
                        }
                      >
                        <option value="inherit">使用默认确认方式</option>
                        <option value="human">人工确认</option>
                        <option value="auto">自动继续</option>
                      </select>
                      <div className="wfc-controls">
                        <button
                          aria-label="上移"
                          type="button"
                          disabled={i === 0 || busy}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          aria-label="下移"
                          type="button"
                          disabled={i === draft.steps.length - 1 || busy}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          aria-label="移除"
                          type="button"
                          disabled={draft.steps.length === 1 || busy}
                          onClick={() => {
                            change({
                              steps: draft.steps.filter((_, n) => n !== i),
                            });
                            setNotice("步骤已移除。");
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    {strategiesFor(s.skill).length > 0 && (
                      <div className="wfc-stepmore">
                        <label>
                          分析策略
                          <select
                            value={s.analysisStrategy || ""}
                            onChange={(e) =>
                              stepChange(i, {
                                analysisStrategy: e.target.value || null,
                              })
                            }
                          >
                            <option value="">使用技能默认策略</option>
                            {strategiesFor(s.skill).map((key) => (
                              <option key={key} value={key}>
                                {strategyNames[key]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    <details className="wfc-stepmore">
                      <summary>
                        {s.supplement?.trim()
                          ? "补充说明（已填写）"
                          : "补充说明（选填）"}
                        <small>任务中说明优先级高于工作流中说明。</small>
                      </summary>
                      <input
                        className="wfc-supplement-input"
                        aria-label="补充说明"
                        maxLength={100}
                        value={s.supplement || ""}
                        onChange={(e) =>
                          stepChange(i, { supplement: e.target.value })
                        }
                        placeholder="例如：深入分析，重点检查退款规则。"
                      />
                    </details>
                  </div>
                ))}
              </div>
              <div hidden={editorStep !== 2} className="wfc-review">
                <h3>
                  <BuiltinResourceIcon value={draft.icon} /> {draft.name}
                </h3>
                <p>{draft.description}</p>
                <p>
                  适用角色：{draft.roles.map((r) => roleNames[r]).join("、")} ·
                  默认确认：
                  {draft.confirmation === "human" ? "人工确认" : "自动继续"}
                  （步骤可覆盖）
                </p>
                {draft.steps.map((s, i) => (
                  <div className="wfc-viewstep" key={s.id}>
                    <div className="wfc-review-step-heading">
                      <b>
                        步骤 {i + 1}：{skillName(s.skill)}
                      </b>
                      {editing?.state === "validated" &&
                        JSON.stringify(draft) ===
                          JSON.stringify(define(editing)) && (
                          <span className="wfc-review-pass">✓ 检查通过</span>
                        )}
                    </div>
                    <p>
                      模型：{modelName(s.model)} · 确认方式：{" "}
                      {s.confirmation === "inherit"
                        ? "使用默认确认方式"
                        : s.confirmation === "human"
                          ? "人工确认"
                          : "自动继续"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="wfc-help">
                检查配置完整性，不代替真实业务试用。自动继续不绕过资料缺失与冲突确认。
              </p>
            </form>
          </main>
          <aside className="sa-aside wfc-preview">
            <h3>工作流预览</h3>
            <p>
              <BuiltinResourceIcon value={draft.icon} />{" "}
              {draft.name || "未命名工作流"}
            </p>
            <small>
              适用角色：
              {draft.roles.map((r) => roleNames[r]).join("、") ||
                "尚未选择角色"}
            </small>
            {draft.steps.map((s, i) => (
              <div className="wfc-viewstep" key={s.id}>
                <b>
                  步骤 {i + 1}： {s.skill ? skillName(s.skill) : "待选择技能"}
                </b>
                <p>模型：{modelName(s.model)}</p>
                <p>
                  确认方式：
                  {s.confirmation === "inherit"
                    ? "使用默认确认方式"
                    : s.confirmation === "human"
                      ? "人工确认"
                      : "自动继续"}
                </p>
              </div>
            ))}
            <p className="wfc-help">
              保存草稿不会启用。检查通过后为待启用，需手动启用。
            </p>
          </aside>
        </div>
        <footer className="sa-footer wfc-save">
          {editorStep > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditorStep((n) => n - 1);
                setErrors([]);
              }}
            >
              上一步
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
          >
            保存草稿
          </button>
          {editorStep < 2 ? (
            <button
              className="wfc-primary"
              type="button"
              disabled={busy}
              onClick={nextEditorStep}
            >
              下一步
            </button>
          ) : (
            <button
              className="wfc-primary sa-primary"
              type="button"
              onClick={() => void save(true)}
              disabled={busy}
            >
              {busy ? "处理中…" : "检查并保存"}
            </button>
          )}
        </footer>
      </dialog>,
      document.body,
    );
  return (
    <section className="wfc wfc-home sc-main homepage-main">
      <header className="sc-page-heading homepage-heading">
        <div>
          <span className="ad-kicker">WORKFLOWS</span>
          <h1>我的工作流</h1>
          <p>把技能按工作顺序编排，让重复工作有条不紊地完成。</p>
        </div>
        <button
          className="ad-primary homepage-heading-action"
          onClick={() => start()}
          disabled={busy || loading}
        >
          <Plus size={17} />
          新建工作流
        </button>
      </header>
      {alerts}
      <div className="sc-toolbar">
        <label className="sc-search">
          <Search size={16} />
          <input
            placeholder="搜索工作流名称或描述…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="sc-source-filter" aria-label="工作流状态筛选">
          {["全部", "草稿", "待启用", "已启用", "已停用"].map((v) => (
            <button
              key={v}
              className={filter === v ? "active" : ""}
              onClick={() => setFilter(v)}
            >
              {v}{" "}
              <span>
                {
                  flows.filter((f) => v === "全部" || states[f.state] === v)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p>正在读取工作流…</p>
      ) : shown.length ? (
        shown.map((f) => (
          <article className="wfc-card" key={f.id}>
            <div className="wfc-cardtop">
              <span className="wfc-icon">
                <BuiltinResourceIcon value={f.icon} />
              </span>
              <div>
                <h2>{f.name}</h2>
                <p>{f.description}</p>
              </div>
              <span className={"wfc-status " + (f.enabled ? "on" : "")}>
                {states[f.state] || "草稿"}
              </span>
              <div className="wfc-actions">
                <button onClick={() => setDetail(f)}>查看</button>
                <button
                  disabled={busy || f.enabled || !!f.references.length}
                  onClick={() => start(f)}
                >
                  编辑
                </button>
                <button
                  disabled={busy || (f.enabled && !!f.references.length)}
                  onClick={() =>
                    f.enabled
                      ? setConfirm({ flow: f, action: "pause" })
                      : void act(f, "enable")
                  }
                >
                  {f.enabled ? "停用" : "启用"}
                </button>
                <button
                  disabled={busy || f.enabled || !!f.references.length}
                  onClick={() => setConfirm({ flow: f, action: "delete" })}
                >
                  删除
                </button>
              </div>
            </div>
            <div className="wfc-chain">
              {f.steps.map((s, i) => (
                <span key={s.id}>
                  <b>
                    {i + 1}　{skillName(s.skill)}
                  </b>
                  {i < f.steps.length - 1 && " → "}
                </span>
              ))}
            </div>
            <div className="wfc-meta">
              <div className="wfc-card-settings">
                <div className="sc-card-tags">
                  <span
                    className={f.source === "builtin" ? "sc-builtin-tag" : ""}
                  >
                    {f.source === "builtin" ? "系统内置" : "自定义"}
                  </span>
                  {f.roles.map((role) => (
                    <span key={role} className={`sc-role-tag ${role}`}>
                      {roleNames[role]}
                    </span>
                  ))}
                </div>
              </div>
              <small>
                {f.references.length
                  ? `${f.references.length} 个未关闭任务引用`
                  : f.enabled
                    ? "任务可选"
                    : "任务不可选"}
              </small>
              <time
                className="sc-modified-time"
                dateTime={f.updated}
                title="最后修改时间"
              >
                最后修改：{formatModifiedTime(f.updated)}
              </time>
            </div>
          </article>
        ))
      ) : (
        <div className="wfc-empty">
          暂无符合条件的工作流，请从已发布技能开始编排。
        </div>
      )}
      {detail && (
        <Dialog
          title="查看工作流"
          className="wfc-subdialog wfc-detail-dialog"
          close={() => setDetail(undefined)}
        >
          <div className="wfc-subbody">
            {detail.legacyRequirements && legacyNotes(detail)}
            <div className="wfc-detail-heading">
              <span className="wfc-icon">
                <BuiltinResourceIcon value={detail.icon} />
              </span>
              <div>
                <h3>{detail.name}</h3>
                <p>{detail.description || "暂无描述"}</p>
              </div>
              <span className="wfc-status">
                {states[detail.state] || "草稿"}
              </span>
            </div>
            <dl className="wfc-detail-meta">
              <div>
                <dt>适用角色</dt>
                <dd>{detail.roles.map((r) => roleNames[r]).join("、")}</dd>
              </div>
              <div>
                <dt>默认确认</dt>
                <dd>
                  {detail.confirmation === "human" ? "人工确认" : "自动继续"}
                  （步骤可覆盖）
                </dd>
              </div>
              <div>
                <dt>资料与产出</dt>
                <dd>
                  沿用技能要求；任务提供实际资料，后续步骤自动接收上一步全部产出。
                </dd>
              </div>
            </dl>
            <h3 className="wfc-subsection">技能步骤 · {detail.steps.length}</h3>
            {detail.steps.map((s, i) => (
              <div className="wfc-viewstep" key={s.id}>
                <b>
                  步骤 {i + 1}：{skillName(s.skill)}
                </b>
                <p>
                  模型：{modelName(s.model)} · 确认方式：
                  {s.confirmation === "inherit"
                    ? "使用默认设置"
                    : s.confirmation === "human"
                      ? "人工确认"
                      : "自动继续"}
                </p>
                {s.supplement?.trim() && <p>补充说明：{s.supplement}</p>}
                {strategiesFor(s.skill).length > 0 && (
                  <p>
                    分析策略：
                    {s.analysisStrategy
                      ? strategyNames[s.analysisStrategy]
                      : "使用技能默认策略"}
                  </p>
                )}
              </div>
            ))}
            {detail.errors.map((e) => (
              <p key={e} role="alert">
                ⚠ {e}
              </p>
            ))}
          </div>
          <footer className="sc-dialog-actions wfc-subfooter">
            <button onClick={() => setDetail(undefined)}>关闭</button>
            <button
              className="wfc-subprimary"
              onClick={() => start(detail, true)}
            >
              创建副本
            </button>
          </footer>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          className="wfc-subdialog wfc-confirm-dialog"
          title={
            confirm.action === "delete" ? "删除工作流 · 影响确认" : "停用工作流"
          }
          close={() => {
            if (!busy) setConfirm(undefined);
          }}
        >
          <div className="wfc-subbody">
            <div className="wfc-confirm-summary">
              <span
                className={
                  "wfc-confirm-symbol " +
                  (confirm.action === "delete" ? "danger" : "")
                }
              >
                {confirm.action === "delete" ? (
                  <TriangleAlert size={24} />
                ) : (
                  <Pause size={24} />
                )}
              </span>
              <div>
                <h3>
                  {confirm.action === "delete" ? "确定删除" : "暂时停用"}“
                  {confirm.flow.name}”？
                </h3>
                <p>
                  {confirm.action === "delete"
                    ? "删除后无法恢复，请确认已不再需要此工作流。"
                    : "停用后，新任务将不能选择此工作流。"}
                </p>
              </div>
            </div>
            <div className="wfc-confirm-impact">
              <b>{confirm.action === "delete" ? "删除影响" : "停用后的影响"}</b>
              <ul>
                <li>
                  {confirm.action === "delete"
                    ? "移除工作流配置，已关闭任务的历史、快照和产物保留。"
                    : "技能编排和配置完整保留，需要时可重新启用。"}
                </li>
                <li>引用任务必须全部关闭后，才允许此操作。</li>
              </ul>
            </div>
            {errors.length > 0 && (
              <div className="wfc-alert" role="alert">
                {errors.map((e, i) => (
                  <div key={i}>⚠ {e}</div>
                ))}
              </div>
            )}
          </div>
          <footer className="sc-dialog-actions wfc-subfooter">
            <button disabled={busy} onClick={() => setConfirm(undefined)}>
              取消
            </button>
            <button
              className="wfc-subprimary"
              disabled={busy}
              onClick={() => {
                if (confirm.action === "pause") void act(confirm.flow, "pause");
                else
                  void run(async () => {
                    await request(`/workflow-center/${confirm.flow.id}`, {
                      method: "DELETE",
                      body: JSON.stringify({ revision: confirm.flow.revision }),
                    });
                    setConfirm(undefined);
                    await refresh();
                    setNotice("工作流已删除。");
                  });
              }}
            >
              {busy
                ? "处理中…"
                : `确认${confirm.action === "delete" ? "删除" : "停用"}`}
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
