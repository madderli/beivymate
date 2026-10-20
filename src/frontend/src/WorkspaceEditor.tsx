import { useId, useState } from "react";
import { Check, FolderOpen, LockKeyhole, Plus, X } from "lucide-react";
import { Dialog } from "./components";
import { RequiredMark } from "./RequiredMark";
import "./workspace-editor.css";
export type WorkspaceDraft = {
  key: string;
  id: string;
  name: string;
  description: string;
  products: string[];
  projects: string[];
  directories: string[];
  isDefault: boolean;
  pending: { name: string; status: string }[];
};
const blank = (): WorkspaceDraft => ({
  key: crypto.randomUUID(),
  id: "",
  name: "",
  description: "",
  products: [],
  projects: [],
  directories: [""],
  isDefault: false,
  pending: [],
});

function TagInput({
  title,
  values,
  change,
  disabled,
}: {
  title: string;
  values: string[];
  change: (values: string[]) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const inputId = useId();
  const hintId = useId();
  function add() {
    if (disabled) return;
    const next = text.trim();
    if (!next) return;
    if (!values.includes(next)) change([...values, next]);
    setText("");
  }
  return (
    <div className="wsd-multi">
      <label className="wsd-field-label" htmlFor={inputId}>
        {title}
        <span>可添加多个</span>
      </label>
      <div className="wsd-tag-input-box">
        {values.length > 0 && (
          <div className="wsd-selected">
            {values.map((value) => (
              <span className="wsd-tag" key={value}>
                {value}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`移除${value}`}
                  onClick={() => change(values.filter((v) => v !== value))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="wsd-tag-entry">
          <input
            id={inputId}
            aria-label={title}
            aria-describedby={hintId}
            disabled={disabled}
            placeholder={`输入${title === "覆盖产品" ? "产品" : "项目"}名称，按回车添加`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            className="wsd-add-tag"
            disabled={disabled || !text.trim()}
            aria-label={`添加${title}`}
            onClick={add}
          >
            <Plus size={14} />
            添加
          </button>
        </div>
      </div>
      <small id={hintId}>
        直接输入名称，可添加多项；点击标签上的 × 可移除。
      </small>
    </div>
  );
}

export function WorkspaceEditor({
  initial,
  defaultChecked = false,
  existing,
  close,
  save,
}: {
  initial?: WorkspaceDraft;
  defaultChecked?: boolean;
  existing: WorkspaceDraft[];
  close: () => void;
  save: (value: WorkspaceDraft) => void | Promise<void>;
}) {
  const [value, setValue] = useState<WorkspaceDraft>(() =>
    initial
      ? structuredClone(initial)
      : { ...blank(), isDefault: defaultChecked },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = Boolean(initial?.pending.length);
  const patch = <K extends keyof WorkspaceDraft>(
    key: K,
    next: WorkspaceDraft[K],
  ) => {
    setValue((old) => ({ ...old, [key]: next }));
    setError("");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    const id = value.id.trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      setError("工作区标识请使用 1～80 位字母、数字、短横线或下划线。");
      return;
    }
    if (
      existing.some(
        (w) => w.key !== value.key && w.id.toLowerCase() === id.toLowerCase(),
      )
    ) {
      setError("这个工作区标识已被使用，请换一个简称。");
      return;
    }
    if (!value.name.trim()) {
      setError("请填写工作区名称。");
      return;
    }
    const directories = value.directories.map((v) => v.trim()).filter(Boolean);
    if (new Set(directories).size !== directories.length) {
      setError("知识来源目录重复了，请保留一份。");
      return;
    }
    setBusy(true);
    try {
      await save({
        ...value,
        id,
        name: value.name.trim(),
        description: value.description.trim(),
        directories,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={locked ? "查看工作区" : initial ? "编辑工作区" : "新增工作区"}
      close={() => {
        if (!busy) close();
      }}
      className="wsd-dialog"
    >
      <form onSubmit={submit} noValidate>
        <div className="wsd-form-scroll">
          <p className="wsd-intro">
            {locked
              ? "这里保留着当前任务使用的工作区配置。"
              : "给工作一个清晰的归属，让资料、产品和项目在这里连接起来。"}
          </p>
          {locked ? (
            <div className="wsd-lock-notice">
              <LockKeyhole size={18} />
              <div>
                <strong>
                  还有 {initial!.pending.length} 项任务未完成，暂时无法编辑
                </strong>
                <p>完成所有任务后，即可修改工作区的全部内容，包括标识。</p>
                <ul>
                  {initial!.pending.map((task) => (
                    <li key={task.name}>
                      {task.name}
                      <span>{task.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            initial && (
              <div className="wsd-edit-note">
                <Check size={15} />
                当前没有未完成任务，所有字段均可修改。
              </div>
            )
          )}
          <fieldset disabled={locked || busy} className="wsd-fields">
            <section className="wsd-section">
              <h3>
                <span>01</span>基本信息
              </h3>
              <div className="wsd-basics">
                <label>
                  工作区标识（简称）
                  <RequiredMark />
                  <input
                    aria-label="工作区标识（简称）"
                    aria-required="true"
                    value={value.id}
                    onChange={(e) => patch("id", e.target.value)}
                    placeholder="例如 HIS"
                    maxLength={80}
                    autoComplete="off"
                  />
                  <small>用于快速识别工作区，保持简短、好记。</small>
                </label>
                <label>
                  工作区名称
                  <RequiredMark />
                  <input
                    aria-label="工作区名称"
                    aria-required="true"
                    value={value.name}
                    onChange={(e) => patch("name", e.target.value)}
                    placeholder="例如 医院业务协同工作区"
                    maxLength={120}
                  />
                </label>
              </div>
              <label>
                工作区描述
                <textarea
                  value={value.description}
                  onChange={(e) => patch("description", e.target.value)}
                  placeholder="说说这个工作区负责哪些工作，以及你希望达成的目标…"
                  maxLength={2000}
                  rows={2}
                />
              </label>
            </section>
            <section className="wsd-section">
              <h3>
                <span>02</span>覆盖范围
              </h3>
              <p className="wsd-section-description">
                填写这个工作区覆盖的产品与项目名称，支持自由输入多个。
              </p>
              <TagInput
                title="覆盖产品"
                values={value.products}
                change={(v) => patch("products", v)}
                disabled={locked}
              />
              <TagInput
                title="覆盖项目"
                values={value.projects}
                change={(v) => patch("projects", v)}
                disabled={locked}
              />
            </section>
            <section className="wsd-section">
              <h3>
                <span>03</span>知识来源
              </h3>
              <p className="wsd-section-description">
                添加需求文档、产品手册等资料所在的目录，支持多个路径。
              </p>
              <div className="wsd-directories">
                {value.directories.map((path, index) => (
                  <div className="wsd-directory" key={index}>
                    <FolderOpen size={17} />
                    <input
                      aria-label={`知识目录 ${index + 1}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing)
                          e.preventDefault();
                      }}
                      value={path}
                      onChange={(e) =>
                        patch(
                          "directories",
                          value.directories.map((v, i) =>
                            i === index ? e.target.value : v,
                          ),
                        )
                      }
                      placeholder="输入目录路径，例如 /knowledge/product-docs"
                    />
                    <button
                      type="button"
                      aria-label={`移除知识目录 ${index + 1}`}
                      onClick={() =>
                        patch(
                          "directories",
                          value.directories.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="wsd-add-directory"
                onClick={() => patch("directories", [...value.directories, ""])}
              >
                <Plus size={15} />
                添加知识目录
              </button>
            </section>
            <label className="wsd-default">
              <input
                type="checkbox"
                checked={value.isDefault}
                onChange={(e) => patch("isDefault", e.target.checked)}
              />
              <span>
                <strong>设为默认工作区</strong>
                <small>登录后直接进入这个工作区，让常用的工作触手可及。</small>
              </span>
            </label>
          </fieldset>
          {error && (
            <p className="wsd-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="wsd-form-footer">
          <span>
            {locked ? "工作区配置只读" : "让每一项工作，都有自己的空间。"}
          </span>
          <button
            type="button"
            className="wsd-secondary"
            disabled={busy}
            onClick={close}
          >
            {locked ? "关闭" : "取消"}
          </button>
          {!locked && (
            <button type="submit" className="wsd-primary" disabled={busy}>
              {busy ? "保存中…" : initial ? "保存修改" : "创建工作区"}
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
