import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  CircleAlert,
  CircleHelp,
  CircleX,
  FileText,
  Folder,
  Plus,
  X,
} from "lucide-react";
import { request } from "../../api";
import { loadModelLibrary, type Catalog } from "./model-api";
import type { PackageFile, Skill, SkillRole } from "./skill-state";
import "./skill-create.css";

type HelpEntry = { title: string; html: string };
type Options = {
  help: Record<"name" | "description" | "descriptionMistake", HelpEntry>;
  instructions: string;
  descriptionTemplate: string;
  icons: string[];
  roles: { id: SkillRole; name: string }[];
  directories: { path: string; name: string; description: string }[];
};
type Form = {
  id: string;
  name: string;
  description: string;
  roles: SkillRole[];
  icon: string;
  modelPreference: {
    mode: "inherit" | "specific";
    model: string;
    capabilities: string[];
  };
  body: string;
  files: PackageFile[];
};
const steps = ["基本信息", "技能编写", "资源文件", "发布检查"];
const headings = [
  "先给技能一张名片",
  "技能编写",
  "为技能准备参考与素材",
  "检查完整后，再发布技能",
];
const leads = [
  "清晰的名称和描述，帮您在工作流和任务中快速找到它。",
  "说明怎么做、需要什么、产出什么，统一整理到技能说明中。",
  "只添加需要的资料。模板是静态资源，执行结果归任务所有。",
  "验证检查结构与配置；实际执行效果需要通过任务试用确认。",
];

function formOf(s: Skill): Form {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    roles: s.roles || [s.role],
    icon: s.icon || "🧩",
    modelPreference: {
      mode: s.modelPreference?.mode === "specific" ? "specific" : "inherit",
      model:
        s.modelPreference?.mode === "specific" ? s.modelPreference.model : "",
      capabilities: [],
    },
    body: s.body,
    files: s.files,
  };
}
function content(f: Form) {
  return `---\nname: ${JSON.stringify(f.id)}\ndescription: ${JSON.stringify(f.description)}\n---\n\n${/^#\s+\S/m.test(f.body) ? f.body : `# ${f.name || "需求名称"}\n\n${f.body}`}`;
}
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}

export default function SkillCreate({
  initial,
  readOnly: viewOnly = false,
  close,
  changed,
}: {
  initial?: Skill;
  readOnly?: boolean;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    overlay = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLInputElement>(null),
    main = useRef<HTMLElement>(null),
    identifierFlight = useRef(0),
    idCheckFlight = useRef(0);
  const [options, setOptions] = useState<Options>(),
    [models, setModels] = useState<Catalog>(),
    [form, setForm] = useState<Form>(),
    [saved, setSaved] = useState<Skill | undefined>(initial),
    [baseline, setBaseline] = useState(""),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [generating, setGenerating] = useState(false),
    [checkingId, setCheckingId] = useState(false),
    [idMessage, setIdMessage] = useState(""),
    [identifierHint, setIdentifierHint] = useState(""),
    [idEdited, setIdEdited] = useState(!!initial),
    [preview, setPreview] = useState("SKILL.md"),
    [uploadDir, setUploadDir] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [leave, setLeave] = useState(false),
    [tip, setTip] = useState<HelpEntry | null>(null);
  const readOnly = viewOnly || saved?.state === "published";
  useEffect(() => {
    if (tip || leave)
      dialog.current
        ?.querySelector<HTMLButtonElement>(".sa-subdialog button")
        ?.focus();
  }, [tip, leave]);
  useEffect(() => {
    let active = true;
    const refreshModels = () => {
      void loadModelLibrary()
        .then((m) => {
          if (active) setModels(m);
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        });
    };
    window.addEventListener("focus", refreshModels);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshModels);
    };
  }, []);
  const dirty = !!form && JSON.stringify(form) !== baseline;
  useEffect(() => {
    const root = document.documentElement,
      body = document.body;
    const before = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      root.style.overflow = before.rootOverflow;
      body.style.overflow = before.bodyOverflow;
    };
  }, []);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      request<Options>("/skill-authoring/options"),
      loadModelLibrary(),
    ])
      .then(([o, m]) => {
        if (!active) return;
        setOptions(o);
        setModels(m);
        const f = initial
          ? formOf(initial)
          : {
              id: "",
              name: "",
              description: o.descriptionTemplate,
              roles: ["common" as SkillRole],
              icon: o.icons[0],
              modelPreference: {
                mode: "inherit" as const,
                model: "",
                capabilities: [],
              },
              body: o.instructions,
              files: [],
            };
        setForm(f);
        setBaseline(JSON.stringify(f));
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [initial]);
  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [step]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const patch = (p: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...p } : f));
    setReviewed(false);
    setStatus("");
    setError("");
  };
  const dismiss = () => {
    if (busy) return;
    if (dirty && !readOnly) setLeave(true);
    else close();
  };
  const showError = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    main.current?.scrollTo({ top: 0 });
  };
  async function identify(name: string) {
    if (idEdited || saved || readOnly || !name.trim()) return;
    const flight = ++identifierFlight.current;
    setGenerating(true);
    try {
      const r = await request<{ id: string; message?: string }>(
        "/skill-authoring/identifier",
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );
      if (flight === identifierFlight.current) {
        idCheckFlight.current++;
        setIdMessage("");
        setIdentifierHint(r.message || "");
        setCheckingId(false);
        setForm((f) => (f && f.name === name ? { ...f, id: r.id } : f));
      }
    } catch (e) {
      if (flight === identifierFlight.current) showError(e);
    } finally {
      if (flight === identifierFlight.current) setGenerating(false);
    }
  }
  function patchName(name: string) {
    if (!form) return;
    const first = form.body.split("\n")[0];
    const automatic = first === "# 需求名称" || first === "# " + form.name;
    patch({
      name,
      ...(automatic
        ? {
            body:
              "# " +
              (name.trim() || "需求名称") +
              form.body.slice(first.length),
          }
        : {}),
    });
    setIdMessage("");
    setIdentifierHint("");
    idCheckFlight.current++;
  }
  async function checkId(id: string) {
    const token = ++idCheckFlight.current;
    setCheckingId(true);
    try {
      const result = await request<{ available: boolean; message: string }>(
        "/skill-authoring/identifier/check",
        {
          method: "POST",
          body: JSON.stringify({ id, revision: saved?.revision }),
        },
      );
      if (token === idCheckFlight.current) setIdMessage(result.message);
      return result.available;
    } catch (e) {
      if (token === idCheckFlight.current) setIdMessage((e as Error).message);
      return false;
    } finally {
      if (token === idCheckFlight.current) setCheckingId(false);
    }
  }
  async function persist() {
    if (!form) throw Error("技能内容尚未载入");
    if (!form.name.trim() || !form.id)
      throw Error("请先填写技能名称和唯一标识，再保存草稿。");
    const idCheck = await request<{ available: boolean; message: string }>(
      "/skill-authoring/identifier/check",
      {
        method: "POST",
        body: JSON.stringify({ id: form.id, revision: saved?.revision }),
      },
    );
    if (!idCheck.available) {
      setIdMessage(idCheck.message);
      setStep(0);
      throw new Error(idCheck.message);
    }
    const value = await request<Skill>(
      "/skill-authoring",
      {
        method: "PUT",
        body: JSON.stringify({ ...form, revision: saved?.revision }),
      },
      60000,
    );
    setSaved(value);
    const f = formOf(value);
    setForm(f);
    setBaseline(JSON.stringify(f));
    await changed();
    return value;
  }
  async function saveDraft() {
    if (busy) return;
    setBusy(true);
    try {
      await persist();
      setReviewed(false);
      setStatus("");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (busy) return;
    setBusy(true);
    try {
      const value = dirty || !saved ? await persist() : saved;
      setModels(await loadModelLibrary());
      const result = await request<Skill>(
        `/skill-authoring/${encodeURIComponent(value.id)}/state`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "validate",
            revision: value.revision,
          }),
        },
      );
      setSaved(result);
      await changed();
      if (result.validationErrors?.length)
        showError(new Error(result.validationErrors.join("；")));
      else {
        setError("");
        setStatus("");
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!saved || dirty || busy || !reviewed) return;
    setBusy(true);
    try {
      const result = await request<Skill>(
        `/skill-authoring/${encodeURIComponent(saved.id)}/state`,
        {
          method: "POST",
          body: JSON.stringify({ action: "publish", revision: saved.revision }),
        },
      );
      setSaved(result);
      await changed();
      setStatus("技能已发布。");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!form || files.length === 0) return;
    try {
      const added: PackageFile[] = [];
      for (const file of files) {
        const path = uploadDir + "/" + file.name;
        if (
          /[\\/:]/.test(file.name) ||
          file.name.startsWith(".") ||
          file.name === "SKILL.md"
        )
          throw Error("资源名称无效，请使用普通文件名。");
        if (file.size > 5 * 1024 * 1024)
          throw Error("单个资源文件不能超过5MB。");
        if ([...form.files, ...added].some((x) => x.path === path))
          throw Error("已存在同名资源，请改名或先移除原文件。");
        const bytes = new Uint8Array(await file.arrayBuffer());
        added.push({ path, size: bytes.length, content: base64(bytes) });
      }
      if (
        form.files.length + added.length > 99 ||
        [...form.files, ...added].reduce((n, x) => n + x.size, 0) >
          20 * 1024 * 1024
      )
        throw Error("技能包不能超过100个文件或20MB。");
      patch({ files: [...form.files, ...added] });
    } catch (e) {
      showError(e);
    }
  }
  const defaultId = models?.defaults.skill || models?.defaults.general;
  const available =
    models?.models.filter(
      (m) =>
        m.enabled &&
        !m.unavailableReason &&
        m.capabilities.includes("text") &&
        models.services.some(
          (s) => s.id === m.serviceId && s.enabled && s.configured,
        ),
    ) || [];
  const chosen =
    form?.modelPreference.mode === "specific"
      ? form.modelPreference.model
      : defaultId;
  const selected = models?.models.find((m) => m.id === chosen);
  const fieldsMissing = form
    ? [
        !form.name.trim() && "技能名称",
        !form.description.trim() && "技能描述",
        (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.id) || form.id.length > 64) &&
          "合规的唯一标识",
        form.description.length > 1024 && "1024字以内的描述",
        !form.roles.length && "适用角色",
      ].filter(Boolean)
    : ["正在读取"];
  const missing =
    step === 0
      ? fieldsMissing
      : step === 1
        ? !form?.body.trim() ||
          form.body.trim() === options?.instructions.trim()
          ? ["填写实际技能内容"]
          : []
        : [];
  const validated = !dirty && saved?.state === "validated",
    published = !dirty && saved?.state === "published";
  const defaults = new Set(
    options?.instructions
      .split("\n")
      .filter((l) => l.trim() && !/^#{1,6}\s/.test(l)) || [],
  );
  const hasHints = !!form?.body.split("\n").some((l) => defaults.has(l));
  const file = form?.files.find((f) => f.path === preview);
  let previewText = form ? content(form) : "";
  if (preview !== "SKILL.md" && file) {
    if (file.text !== undefined) previewText = file.text;
    else {
      try {
        const bytes = Uint8Array.from(atob(file.content || ""), (c) =>
          c.charCodeAt(0),
        );
        previewText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        previewText = `静态资源：${preview}\n\n二进制资源按原字节保存，不执行、不修改。`;
      }
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="sa-dialog"
      aria-labelledby="sa-title"
      onCancel={(e) => {
        // File inputs also emit cancel; only this dialog's own event closes it.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (tip) setTip(null);
        else if (leave) setLeave(false);
        else dismiss();
      }}
    >
      <header className="sa-header">
        <div>
          <h1 id="sa-title">
            {initial ? (readOnly ? "查看技能" : "编辑技能") : "新建技能"}
          </h1>
          <p>把您的工作方法，变成可以重复使用的能力。</p>
        </div>
        <div className="sa-header-right">
          <span className="sa-pill">
            {dirty
              ? "草稿"
              : published
                ? "已发布"
                : validated
                  ? "已验证"
                  : saved?.state === "invalid"
                    ? "校验失败"
                    : "草稿"}
          </span>
          <button
            type="button"
            className="sa-icon"
            aria-label="关闭新建技能"
            disabled={busy}
            onClick={dismiss}
          >
            <X />
          </button>
        </div>
      </header>
      <div className="sa-body" inert={!!tip || leave}>
        <nav className="sa-steps" aria-label="新建技能步骤">
          <ol className="sa-step-list">
            {steps.map((title, i) => (
              <li
                key={title}
                className={step === i ? "active" : ""}
                aria-current={step === i ? "step" : undefined}
                aria-label={title}
              >
                <span className="sa-number">
                  {i < step ? <Check /> : i + 1}
                </span>
                {title}
              </li>
            ))}
          </ol>
          <div className="sa-step-hint">
            修改内容后需重新验证。
            <br />
            只有发布的技能，工作流才可使用。
          </div>
        </nav>
        <main ref={main} className="sa-content">
          <div className="sa-page-heading">
            <div className="sa-eyebrow">
              第{["一", "二", "三", "四"][step]}步
            </div>
            <div>
              <h2>{headings[step]}</h2>
              <p>{leads[step]}</p>
            </div>
            {step === 2 && (
              <button
                type="button"
                className="sa-quiet sa-skip"
                onClick={() => setStep(3)}
              >
                跳过此步 →
              </button>
            )}
          </div>
          {error && (
            <div className="sa-alert" role="alert">
              {error}
            </div>
          )}
          {!form || !options ? (
            <p role="status">
              {error ? "无法读取编辑器，请关闭后重试。" : "正在读取技能配置…"}
            </p>
          ) : (
            <fieldset className="sa-fields" disabled={busy || readOnly}>
              {step === 0 && (
                <>
                  <div className="sa-identity">
                    <label className="sa-field">
                      图标
                      <select
                        aria-label="图标"
                        value={form.icon}
                        onChange={(e) => patch({ icon: e.target.value })}
                      >
                        {Array.from(new Set([form.icon, ...options.icons])).map(
                          (v) => (
                            <option key={v}>{v}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <div className="sa-field">
                      <div className="sa-field-heading">
                        <label className="sa-required" htmlFor="sa-name">
                          技能名称
                        </label>
                        <button
                          type="button"
                          className="sa-help warning"
                          aria-label="技能名称·错误写法"
                          onClick={() => setTip(options.help.name)}
                        >
                          <CircleAlert />
                        </button>
                      </div>
                      <input
                        id="sa-name"
                        maxLength={120}
                        placeholder="给技能起个名字"
                        value={form.name}
                        onChange={(e) => {
                          identifierFlight.current++;
                          setGenerating(false);
                          patchName(e.target.value);
                        }}
                        onBlur={() => void identify(form.name)}
                      />
                    </div>
                    <label className="sa-field">
                      <span className="sa-required">唯一标识</span>
                      <input
                        aria-label="唯一标识"
                        readOnly={!!saved}
                        aria-invalid={!!idMessage}
                        onBlur={() => {
                          if (!saved) void checkId(form.id);
                        }}
                        maxLength={64}
                        value={form.id}
                        onChange={(e) => {
                          identifierFlight.current++;
                          setGenerating(false);
                          setIdentifierHint("");
                          setIdEdited(true);
                          idCheckFlight.current++;
                          setIdMessage("");
                          setCheckingId(false);
                          patch({ id: e.target.value });
                        }}
                      />
                      <small className="sa-id-status" role="status">
                        {generating
                          ? "正在生成标识…"
                          : checkingId
                            ? "正在校验标识…"
                            : identifierHint}
                      </small>
                    </label>
                    <div className="sa-identity-note">
                      <p>
                        示例：
                        <button
                          type="button"
                          className="sa-example"
                          onClick={() => {
                            patchName("需求理解");
                            void identify("需求理解");
                          }}
                        >
                          需求理解
                        </button>
                        （点一下填入，再修改）
                      </p>
                      <small
                        className={idMessage ? "sa-id-error" : ""}
                        aria-live="polite"
                      >
                        {idMessage ||
                          "唯一标识由小写字母、数字或连接符组成，最多64个字符。"}
                      </small>
                    </div>
                  </div>
                  <div className="sa-field">
                    <div className="sa-field-heading">
                      <label className="sa-required" htmlFor="sa-description">
                        技能描述
                      </label>
                      <button
                        type="button"
                        className="sa-help"
                        aria-label="技能描述帮助"
                        onClick={() => setTip(options.help.description)}
                      >
                        <CircleHelp />
                      </button>
                      <button
                        type="button"
                        className="sa-help warning"
                        aria-label="技能描述反例"
                        onClick={() => setTip(options.help.descriptionMistake)}
                      >
                        <CircleX />
                      </button>
                    </div>
                    <div className="sa-description">
                      <textarea
                        id="sa-description"
                        placeholder={options.descriptionTemplate}
                        maxLength={1024}
                        value={form.description}
                        onChange={(e) => patch({ description: e.target.value })}
                      />
                    </div>
                    <span className="sa-count" aria-live="polite">
                      {form.description.length} / 1024 字
                    </span>
                  </div>
                  <div className="sa-field">
                    适用角色
                    <div className="sa-checks">
                      {options.roles.map((r) => (
                        <label key={r.id}>
                          <input
                            type="checkbox"
                            checked={form.roles.includes(r.id)}
                            onChange={(e) =>
                              patch({
                                roles: e.target.checked
                                  ? r.id === "common"
                                    ? [r.id]
                                    : [
                                        ...form.roles.filter(
                                          (v) => v !== "common",
                                        ),
                                        r.id,
                                      ]
                                  : form.roles.filter((v) => v !== r.id),
                              })
                            }
                          />
                          {r.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="sa-model">
                    <b>模型选择</b>
                    <div className="sa-checks">
                      <label>
                        <input
                          type="radio"
                          name="sa-model"
                          checked={form.modelPreference.mode === "inherit"}
                          onChange={() =>
                            patch({
                              modelPreference: {
                                mode: "inherit",
                                model: "",
                                capabilities: [],
                              },
                            })
                          }
                        />
                        默认模型
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="sa-model"
                          checked={form.modelPreference.mode === "specific"}
                          onChange={() =>
                            patch({
                              modelPreference: {
                                mode: "specific",
                                model: "",
                                capabilities: [],
                              },
                            })
                          }
                        />
                        自定义模型
                      </label>
                    </div>
                    <label className="sa-field">
                      <span>
                        {form.modelPreference.mode === "inherit"
                          ? "技能使用模型配置中的默认模型。"
                          : "选择自定义模型"}
                      </span>
                      <select
                        aria-label="技能使用模型"
                        disabled={form.modelPreference.mode === "inherit"}
                        value={chosen || ""}
                        onChange={(e) =>
                          patch({
                            modelPreference: {
                              mode: "specific",
                              model: e.target.value,
                              capabilities: [],
                            },
                          })
                        }
                      >
                        <option value="">
                          {form.modelPreference.mode === "inherit"
                            ? "尚未配置默认技能模型"
                            : "请选择模型"}
                        </option>
                        {chosen && !available.some((m) => m.id === chosen) && (
                          <option value={chosen} disabled>
                            {selected?.name || "原模型已删除"}（不可用）
                          </option>
                        )}
                        {available.map((m) => (
                          <option key={m.id} value={m.id}>
                            {
                              models?.services.find((s) => s.id === m.serviceId)
                                ?.name
                            }{" "}
                            / {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!available.some((m) => m.id === chosen) && (
                      <p className="sa-help-text">
                        模型尚未配置或不可用，可以先保存草稿；发布前请在模型配置中处理。
                      </p>
                    )}
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <div className="sa-writing-toolbar">
                    <span>
                      技能内容 <span className="sa-required-badge">必填</span>
                    </span>
                    <div>
                      <a
                        href="/api/v1/skill-authoring/documents/guide"
                        target="_blank"
                        rel="noopener"
                      >
                        <BookOpen />
                        帮助手册
                      </a>
                      <a
                        href="/api/v1/skill-authoring/documents/example"
                        target="_blank"
                        rel="noopener"
                      >
                        <FileText />
                        技能示例
                      </a>
                    </div>
                  </div>
                  <div className="sa-instruction">
                    <textarea
                      ref={editor}
                      aria-label="技能内容"
                      className={hasHints ? "show-hints" : ""}
                      spellCheck={false}
                      value={form.body}
                      onChange={(e) => patch({ body: e.target.value })}
                      onScroll={(e) => {
                        if (overlay.current) {
                          overlay.current.scrollTop = e.currentTarget.scrollTop;
                          overlay.current.scrollLeft =
                            e.currentTarget.scrollLeft;
                        }
                      }}
                    />
                    {hasHints && (
                      <div
                        className="sa-instruction-hints"
                        ref={overlay}
                        aria-hidden="true"
                      >
                        {form.body.split("\n").map((l, i) => (
                          <span
                            key={i}
                            className={defaults.has(l) ? "sa-hint-line" : ""}
                          >
                            {l}
                            {i < form.body.split("\n").length - 1 ? "\n" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="sa-info">
                    技能说明已由前两步整理。这里添加技能长期使用的静态资料和模板；每次任务的附件或路径在任务中提供。可选目录不必全部创建。
                  </div>
                  {options.directories.map((d) => (
                    <section className="sa-resource" key={d.path}>
                      <div>
                        <div>
                          <h3>{d.name}</h3>
                          <p>{d.description}</p>
                          <code>{d.path}/</code>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadDir(d.path);
                            picker.current?.click();
                          }}
                        >
                          <Plus />
                          添加
                        </button>
                      </div>
                      {form.files
                        .filter((f) =>
                          d.path === "assets"
                            ? f.path.startsWith("assets/") &&
                              !f.path.startsWith("assets/templates/")
                            : f.path.startsWith(d.path + "/"),
                        )
                        .map((f) => (
                          <div className="sa-file-row" key={f.path}>
                            <FileText />
                            <span>{f.path.split("/").pop()}</span>
                            <small>
                              {Math.max(1, Math.round(f.size / 1024))} KB
                            </small>
                            <button
                              type="button"
                              className="sa-icon"
                              aria-label={`移除 ${f.path}`}
                              onClick={() =>
                                patch({
                                  files: form.files.filter(
                                    (x) => x.path !== f.path,
                                  ),
                                })
                              }
                            >
                              <X />
                            </button>
                          </div>
                        ))}
                    </section>
                  ))}
                  <p className="sa-help-text">
                    添加脚本不会执行脚本。可运行的脚本环境与权限需另行确认。
                  </p>
                  <input
                    ref={picker}
                    type="file"
                    multiple
                    hidden
                    aria-label="添加资源文件"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      void upload(files);
                    }}
                  />
                </>
              )}
              {step === 3 && (
                <>
                  <div className="sa-summary">
                    <span className="sa-skill-icon">{form.icon}</span>
                    <div>
                      <strong>{form.name || "未命名技能"}</strong>
                      <p>{form.id || "尚未填写标识"} · 技能正文统一编写</p>
                    </div>
                    <span className="sa-pill">
                      {published ? "已发布" : validated ? "已验证" : "草稿"}
                    </span>
                  </div>
                  {[
                    ["基本信息", "名称、描述、标识和适用角色完整"],
                    [
                      "技能内容",
                      "已用实际业务内容替换初始提示；不要求实际资料或具体交付模板",
                    ],
                    [
                      "要求完整性",
                      "请核对目标、资料与缺失处理、方法、结果、边界及验收；标题顺序与示例不设门槛",
                    ],
                    ["模型设置", "使用默认技能模型，或已明确选择独立模型"],
                  ].map(([title, desc]) => (
                    <div className="sa-check-row" key={title}>
                      <span>
                        {validated || published ? <Check /> : <CircleHelp />}
                      </span>
                      <div>
                        <b>{title}</b>
                        <small>{desc}</small>
                      </div>
                      <em>{validated || published ? "通过" : "待检查"}</em>
                    </div>
                  ))}
                  <div className="sa-info">
                    此处检查包结构、内容和资源，不调用模型、不执行脚本，也不代表业务效果已验收。检查通过后仍需明确发布。
                  </div>
                  <label className="sa-review">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    我已核对技能目标、所需资料及缺失处理、工作方法、输出、边界和验收要求，已将填写说明改为本技能的实际业务内容。
                  </label>
                  <button
                    type="button"
                    disabled={published}
                    onClick={() => void check()}
                  >
                    {validated ? "重新检查" : "检查技能"}
                  </button>
                  {validated && (
                    <div className="sa-success">
                      结构与配置检查通过，可以确认发布。
                    </div>
                  )}
                  {published && (
                    <div className="sa-success">
                      技能已发布，内容及资源的本机发布记录已保存。
                    </div>
                  )}
                </>
              )}
            </fieldset>
          )}
          {status && (
            <p className="sa-status" role="status">
              {status}
            </p>
          )}
        </main>
        <aside className="sa-aside">
          <div>
            <b>技能包预览</b>
            <span className="sa-pill">自动生成</span>
          </div>
          <div className="sa-tree">
            <small>
              <Folder />
              {form?.id || "skill-name"}/
            </small>
            {["SKILL.md", ...(form?.files.map((f) => f.path) || [])].map(
              (path) => (
                <button
                  type="button"
                  className={preview === path ? "selected" : ""}
                  key={path}
                  onClick={() => setPreview(path)}
                >
                  <FileText />
                  {path}
                </button>
              ),
            )}
          </div>
          <p>{preview}</p>
          <pre>{previewText}</pre>
        </aside>
      </div>
      <footer className="sa-footer">
        <small>
          {busy
            ? "正在保存或检查…"
            : dirty
              ? "有未保存的修改"
              : saved
                ? "当前内容已保存。"
                : "尚未保存 · 可随时保存草稿"}
        </small>
        <button type="button" disabled={busy} onClick={dismiss}>
          取消
        </button>
        {step > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStep(step - 1)}
          >
            上一步
          </button>
        )}
        {readOnly && step < 3 && (
          <button
            type="button"
            className="sa-primary"
            onClick={() => setStep(step + 1)}
          >
            下一步 →
          </button>
        )}
        {!readOnly && (
          <>
            <button
              type="button"
              disabled={busy || generating || checkingId || !form}
              onClick={() => void saveDraft()}
            >
              保存草稿
            </button>
            <button
              type="button"
              className="sa-primary"
              disabled={
                busy ||
                generating ||
                !form ||
                (step < 3
                  ? !!missing.length || !!idMessage
                  : !validated || !reviewed)
              }
              onClick={() => {
                if (step === 0 && form) {
                  void checkId(form.id).then((ok) => {
                    if (ok) setStep(1);
                  });
                } else if (step < 3) setStep(step + 1);
                else void publish();
              }}
            >
              {step === 3 ? (published ? "已发布" : "发布技能") : "下一步 →"}
            </button>
          </>
        )}
        <p className="sa-footer-hint">
          {step === 3
            ? published
              ? "技能已发布。"
              : validated
                ? reviewed
                  ? "检查通过，可以发布技能。"
                  : "检查通过，请核对内容并勾选确认后发布。"
                : "先检查当前内容，再明确发布。"
            : missing.length
              ? "还差：" + missing.join("、")
              : step === 2
                ? "资源文件按需提供，没有可以直接下一步。"
                : "本页已填写，可以继续。"}
        </p>
      </footer>
      {(tip || leave) && (
        <div className="sa-sub-backdrop">
          <section
            className="sa-subdialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={tip?.title || "尚有未保存的修改"}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              );
              if (!buttons.length) return;
              const first = buttons[0],
                last = buttons[buttons.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <header>
              <h2>{tip?.title || "尚有未保存的修改"}</h2>
              <button
                type="button"
                className="sa-icon"
                aria-label="关闭提示"
                onClick={() => {
                  setTip(null);
                  setLeave(false);
                }}
              >
                <X />
              </button>
            </header>
            <div className="sa-help-content">
              {tip ? (
                <div dangerouslySetInnerHTML={{ __html: tip.html }} />
              ) : (
                <p>尚未保存的内容会丢失，确定退出吗？</p>
              )}
            </div>
            <footer>
              {leave ? (
                <>
                  <button type="button" onClick={() => setLeave(false)}>
                    继续编辑
                  </button>
                  <button type="button" className="sa-primary" onClick={close}>
                    放弃修改
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="sa-primary"
                  onClick={() => setTip(null)}
                >
                  知道了
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
