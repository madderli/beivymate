import { useId, useState } from "react";
import { Check, CircleHelp, FileText, FolderOpen, LockKeyhole, Plus, X } from "lucide-react";
import { Dialog } from "./components";
import { RequiredMark } from "./RequiredMark";
import "./workspace-editor.css";
export type WorkspaceDraft = {
  key: string;
  id: string;
  name: string;
  description: string;
  knowledgeSourceIds?: string[];
  directories: string[];
  isDefault: boolean;
  pending: { name: string; status: string }[];
};
const blank = (): WorkspaceDraft => ({
  key: crypto.randomUUID(),
  id: "",
  name: "",
  description: "",
  directories: [""],
  isDefault: false,
  pending: [],
});

export function WorkspaceEditor({
  initial,
  defaultChecked = false,
  existing,
  knowledge = [],
  knowledgeError = "",
  pickPath,
  canSetDefault = true,
  close,
  save,
}: {
  initial?: WorkspaceDraft;
  defaultChecked?: boolean;
  existing: WorkspaceDraft[];
  knowledge?: { id: string; name: string }[];
  knowledgeError?: string;
  pickPath?: (kind: "file" | "directory") => Promise<string | null>;
  canSetDefault?: boolean;
  close: () => void;
  save: (value: WorkspaceDraft) => void | Promise<void>;
}) {
  const [value, setValue] = useState<WorkspaceDraft>(() =>
    initial
      ? structuredClone(initial)
      : { ...blank(), isDefault: defaultChecked },
  );
  const shortNameId = useId();
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const matchingKnowledge = knowledge.filter(({ name }) => name.toLowerCase().includes(knowledgeQuery.trim().toLowerCase()));
  const selectedKnowledge = knowledge.filter(({ id }) => value.knowledgeSourceIds?.includes(id));
  const locked = Boolean(initial?.pending.length);
  const patch = <K extends keyof WorkspaceDraft>(
    key: K,
    next: WorkspaceDraft[K],
  ) => {
    setValue((old) => ({ ...old, [key]: next }));
    setError("");
  };
  async function selectPath(index: number, kind: "file" | "directory") {
    if (!pickPath || busy) return;
    setBusy(true);
    setError("");
    try {
      const path = await pickPath(kind);
      if (path) patch("directories", value.directories.map((entry, i) => i === index ? path : entry));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    const id = value.id.trim();
    if (!initial && (!/^[A-Z0-9]{1,4}$/.test(id) || !/[A-Z]/.test(id))) {
      setError("简称须为 1～4 位大写字母或数字，至少含一个字母。");
      return;
    }
    if (
      existing.some(
        (w) => w.key !== value.key && w.id.toLowerCase() === id.toLowerCase(),
      )
    ) {
      setError("这个工作空间标识已被使用，请换一个简称。");
      return;
    }
    if (!value.name.trim()) {
      setError("请填写工作空间名称。");
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
      title={locked ? "查看工作空间" : initial ? "编辑工作空间" : "新增工作空间"}
      close={() => {
        if (!busy) close();
      }}
      className="wsd-dialog"
    >
      <form onSubmit={submit} noValidate>
        <div className="wsd-form-scroll">
          <p className="wsd-intro">
            {locked
              ? "这里保留着当前任务使用的工作空间配置。"
              : "给工作一个清晰的归属，并按需配置常用知识。"}
          </p>
          {locked ? (
            <div className="wsd-lock-notice">
              <LockKeyhole size={18} />
              <div>
                <strong>
                  还有 {initial!.pending.length} 项任务未关闭，暂时无法编辑
                </strong>
                <p>关闭相关任务后，即可修改工作空间配置。</p>
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
                当前没有未关闭任务，可以编辑配置。
              </div>
            )
          )}
          <fieldset disabled={locked || busy} className="wsd-fields">
            <section className="wsd-section">
              <h3>
                <span>01</span>基本信息
              </h3>
              <div className="wsd-basics">
                <div>
                  <div className="wsd-short-name-heading">
                    <label htmlFor={shortNameId}>工作空间简称 <RequiredMark /></label>
                    <details className="wsd-short-name-help">
                      <summary aria-label="工作空间简称命名规则"><CircleHelp size={14} aria-hidden="true" /></summary>
                      <p>使用 1～4 位大写英文字母或数字，至少包含一个字母。简称不能重复，保存后不可修改。</p>
                    </details>
                  </div>
                  <input
                    id={shortNameId}
                    aria-label="工作空间简称"
                    aria-required="true"
                    value={value.id}
                    onChange={(e) => patch("id", e.target.value.toUpperCase())}
                    placeholder="例如 HIS"
                    maxLength={4}
                    readOnly={Boolean(initial)}
                    autoComplete="off"
                  />
                </div>
                <label>
                  工作空间名称
                  <RequiredMark />
                  <input
                    aria-label="工作空间名称"
                    aria-required="true"
                    value={value.name}
                    onChange={(e) => patch("name", e.target.value)}
                    placeholder="例如 医院业务协同工作空间"
                    maxLength={120}
                  />
                </label>
                <label className="wsd-default">
                  <input
                    type="checkbox"
                    checked={value.isDefault}
                    disabled={Boolean(initial?.isDefault) || !canSetDefault}
                    onChange={(e) => patch("isDefault", e.target.checked)}
                  />
                  <span>
                    <strong>{initial?.isDefault ? "默认工作空间" : "设为默认工作空间"}</strong>
                  </span>
                </label>
              </div>
              <label>
                工作空间描述
                <textarea
                  value={value.description}
                  onChange={(e) => patch("description", e.target.value)}
                  placeholder="说说这个工作空间负责哪些工作，以及你希望达成的目标…"
                  maxLength={2000}
                  rows={2}
                />
              </label>
            </section>
            <section className="wsd-section">
              <h3>
                <span>02</span>知识来源
              </h3>
              <h4>从知识库选择</h4>
              {knowledge.length > 0 && (
                <details className="wsd-knowledge-picker">
                  <summary>选择知识 <small>已选 {value.knowledgeSourceIds?.length ?? 0} 项</small></summary>
                  <input
                    type="search"
                    aria-label="搜索知识名称"
                    placeholder="搜索知识名称…"
                    value={knowledgeQuery}
                    onChange={(event) => setKnowledgeQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                  />
                  <div className="wsd-knowledge-options" role="group" aria-label="知识库条目">
                    {matchingKnowledge.length === 0 && <small>没有匹配的知识。</small>}
                    {matchingKnowledge.map(({ id, name }) => (
                      <label key={id}>
                        <input type="checkbox" checked={value.knowledgeSourceIds?.includes(id) ?? false}
                          onChange={(event) => {
                            const selected = value.knowledgeSourceIds ?? [];
                            patch("knowledgeSourceIds", event.target.checked ? [...selected, id] : selected.filter((item) => item !== id));
                          }} />
                        {name}
                      </label>
                    ))}
                  </div>
                </details>
              )}
              {selectedKnowledge.length > 0 && (
                <ul className="wsd-selected-knowledge" aria-label="已选知识">
                  {selectedKnowledge.map(({ id, name }) => <li key={id}>{name}</li>)}
                </ul>
              )}
              {knowledgeError && <p role="alert">{knowledgeError}</p>}
              <h4>补充知识来源</h4>
              <p className="wsd-section-description">
                可填写此工作空间专用的文件或文件夹绝对路径，任务可按需选用。
              </p>
              <div className="wsd-directories">
                {value.directories.map((path, index) => (
                  <div className="wsd-directory" key={index}>
                    {pickPath ? (
                      <>
                        <button type="button" aria-label="选择文件夹" title="选择文件夹" onClick={() => void selectPath(index, "directory")}>
                          <FolderOpen size={17} />
                        </button>
                        <button type="button" aria-label="选择文件" title="选择文件" onClick={() => void selectPath(index, "file")}>
                          <FileText size={17} />
                        </button>
                      </>
                    ) : <FolderOpen size={17} />}
                    <input
                      aria-label={`知识路径 ${index + 1}`}
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
                      placeholder="输入文件或文件夹路径，例如 /knowledge/product-docs"
                    />
                    <button
                      type="button"
                      aria-label={`移除知识路径 ${index + 1}`}
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
                添加知识路径
              </button>
            </section>
          </fieldset>
          {error && (
            <p className="wsd-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="wsd-form-footer">
          <span>
            {locked ? "工作空间配置只读" : "让每一项工作，都有自己的空间。"}
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
              {busy ? "保存中…" : initial ? "保存修改" : "创建工作空间"}
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
