import { useEffect, useRef, useState } from "react";
import { FileText, Folder, FolderOpen, LoaderCircle, Plus, Search, X } from "lucide-react";
import { request } from "../../api";
import { Dialog } from "../../components";
import "../../preview/model-settings.css";
import "./knowledge-settings.css";

type SourcePath = {
  kind: "file" | "directory";
  storage: "local" | "shared";
  path: string;
};
type Source = SourcePath & {
  id: string;
  name: string;
  revision: number;
  additional: SourcePath[];
};
type Draft = { name: string; paths: SourcePath[]; revision?: number };
type Access = {
  revision: number;
  accessible: boolean;
  message: string;
  checkedAt?: string;
  failures: { path: string; message: string }[];
};
const emptyPath: SourcePath = { kind: "directory", storage: "local", path: "" };
const pathsFor = (source: Source) => [source, ...source.additional];
type Reference = { id: string; name: string; path: string };
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试。";

function KnowledgePaths({ paths, failures }: {
  paths: SourcePath[];
  failures?: Access["failures"];
}) {
  const errors = new Map(failures?.map(({ path, message }) => [path, message]));
  return (
    <ul className="ks-path-list">
      {paths.map(({ kind, path, storage }) => {
        const Icon = kind === "directory" ? Folder : FileText;
        const name = path.split(/[\\/]/).filter(Boolean).at(-1) || path;
        return (
          <li key={path}>
            <span className="ks-path-icon"><Icon size={17} aria-hidden="true" /></span>
            <div>
              <strong>{name}</strong>
              <div className="ks-path">{path}</div>
              {errors.has(path) && <div className="ks-error">{errors.get(path)}</div>}
            </div>
            <small>{storage === "shared" ? "共享存储" : "本机存储"}</small>
          </li>
        );
      })}
    </ul>
  );
}

function WorkspaceReferences({ id, revision }: { id: string; revision: number }) {
  const [names, setNames] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setNames(undefined);
    void request<{ items: Reference[] }>(`/knowledge-sources/${id}/references`, {
      signal: controller.signal,
    }).then(({ items }) => {
      if (!controller.signal.aborted) setNames(items.map(({ name }) => name).join("、") || "暂无引用");
    }).catch(() => {
      if (!controller.signal.aborted) setNames("读取失败");
    });
    return () => controller.abort();
  }, [id, revision]);
  return <div className="ks-reference-names">引用工作空间：{names ?? "读取中…"}</div>;
}

export default function KnowledgeSettings() {
  const [items, setItems] = useState<Source[]>([]);
  const [access, setAccess] = useState<Record<string, Access>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editor, setEditor] = useState<{ id?: string; draft: Draft }>();
  const [editorError, setEditorError] = useState("");
  const [browseIndex, setBrowseIndex] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Source>();
  const [accessErrors, setAccessErrors] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<{
    name: string;
    items?: Reference[];
    error?: string;
  }>();
  const checks = useRef(new Map<string, symbol>());
  const manuallyChecked = useRef(new Map<string, number>());
  const [manualChecking, setManualChecking] = useState<Record<string, boolean>>({});

  async function verify(source: Source, manual = false) {
    if (!manual && manuallyChecked.current.get(source.id) === source.revision) return;
    if (manual) {
      manuallyChecked.current.set(source.id, source.revision);
      setManualChecking((old) => ({ ...old, [source.id]: true }));
    }
    const token = Symbol();
    checks.current.set(source.id, token);
    setAccessErrors((old) => ({ ...old, [source.id]: "" }));
    setChecking((old) => ({ ...old, [source.id]: true }));
    try {
      const result = await request<Access>(
        `/knowledge-sources/${source.id}/access`,
        { method: "POST" },
      );
      if (checks.current.get(source.id) !== token) return;
      setAccess((old) => ({ ...old, [source.id]: { ...result, checkedAt: manual ? new Date().toLocaleTimeString("zh-CN") : undefined } }));
    } catch (error) {
      if (checks.current.get(source.id) === token && manual)
        setAccessErrors((old) => ({ ...old, [source.id]: errorText(error) }));
    } finally {
      if (manual) setManualChecking((old) => ({ ...old, [source.id]: false }));
      if (checks.current.get(source.id) === token) {
        checks.current.delete(source.id);
        setChecking((old) => ({ ...old, [source.id]: false }));
      }
    }
  }

  useEffect(() => {
    let active = true;
    void request<{ items: Source[] }>("/knowledge-sources")
      .then(async (result) => {
        if (!active) return;
        setItems(result.items);
        setLoading(false);
        // Avoid probing every shared mount concurrently.
        for (const source of result.items) {
          if (!active) break;
          await verify(source);
        }
      })
      .catch((error) => {
        if (active) {
          setIssue(errorText(error));
          setLoading(false);
        }
      });
    const pending = checks.current;
    return () => {
      active = false;
      pending.clear();
    };
  }, []);

  const resultFor = (source: Source) =>
    access[source.id]?.revision === source.revision
      ? access[source.id]
      : undefined;
  const statusFor = (source: Source) => {
    const result = resultFor(source);
    return result ? (result.accessible ? "可访问" : "不可访问") : "待检查";
  };
  const shown = items.filter(
    (source) =>
      (!filter || statusFor(source) === filter) &&
      [source.name, ...pathsFor(source).map((entry) => entry.path)].join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  async function save() {
    if (!editor || saving || browseIndex !== undefined) return;
    const { name, revision, paths: [first, ...additional] } = editor.draft;
    setSaving(true);
    setEditorError("");
    try {
      const value = await request<Source>(
        "/knowledge-sources" + (editor.id ? "/" + editor.id : ""),
        {
          method: editor.id ? "PUT" : "POST",
          body: JSON.stringify({ name, revision, ...first, additional }),
        },
      );
      setItems((old) => [
        value,
        ...old.filter((source) => source.id !== value.id),
      ]);
      setEditor(undefined);
      setBrowseIndex(undefined);
      setFeedback("知识已保存。");
      void verify(value);
    } catch (error) {
      setEditorError(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  function openReferences(source: Source) {
    setReferences({ name: source.name });
    void request<{ items: Reference[] }>(
      `/knowledge-sources/${source.id}/references`,
    )
      .then((result) =>
        setReferences((old) =>
          old?.name === source.name
            ? { name: source.name, items: result.items }
            : old,
        ),
      )
      .catch((error) =>
        setReferences((old) =>
          old?.name === source.name
            ? { name: source.name, error: errorText(error) }
            : old,
        ),
      );
  }

  function patch(value: Partial<Draft>) {
    setEditor((old) =>
      old ? { ...old, draft: { ...old.draft, ...value } } : old,
    );
  }

  function patchPath(index: number, value: Partial<SourcePath>) {
    if (!editor) return;
    patch({ paths: editor.draft.paths.map((entry, i) => i === index ? { ...entry, ...value } : entry) });
  }

  async function browse(index: number, kind: SourcePath["kind"]) {
    setBrowseIndex(index);
    setEditorError("");
    try {
      const { path } = await request<{ path: string | null }>(
        "/knowledge-sources/pick-path",
        { method: "POST", body: JSON.stringify({ kind }) },
        310_000,
      );
      if (path) patchPath(index, { path });
    } catch (error) {
      setEditorError(errorText(error));
    } finally {
      setBrowseIndex(undefined);
    }
  }

  function closeEditor() {
    if (saving || browseIndex !== undefined) return;
    setEditor(undefined);
    setBrowseIndex(undefined);
  }

  return (
    <section className="skill-center-demo skill-center-embedded knowledge-settings">
      <div className="ms-page homepage-main">
        <header className="sc-page-heading homepage-heading">
          <div>
            <span className="ad-kicker">KNOWLEDGE SETTINGS</span>
            <h1>知识库管理</h1>
            <p>集中组织和管理知识，为用户提供快速便捷的知识引用。</p>
          </div>
          <button
            className="ad-primary homepage-heading-action"
            onClick={() => {
              setEditorError("");
              setEditor({ draft: { name: "", paths: [emptyPath] } });
            }}
          >
            <Plus size={16} />
            添加知识
          </button>
        </header>
        {issue && (
          <p role="alert" className="sc-warning">
            {issue}
          </p>
        )}
        {feedback && (
          <p role="status" className="ks-feedback">
            {feedback}
          </p>
        )}
        <div className="sc-toolbar">
          <label className="sc-search">
            <Search size={16} />
            <input
              aria-label="搜索知识"
              placeholder="搜索名称或路径…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="sc-source-filter" aria-label="访问状态">
            {["", "可访问", "不可访问", "待检查"].map((status) => (
              <button
                key={status}
                className={filter === status ? "active" : ""}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status || "全部"}
                <span>
                  {
                    items.filter(
                      (source) => !status || statusFor(source) === status,
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p role="status">正在读取知识库…</p>
        ) : (
          <div className="sc-grid">
            {shown.map((source) => {
              const Icon = source.kind === "file" ? FileText : Folder;
              const status = statusFor(source);
              return (
                <article className="sc-card ks-card" key={source.id}>
                  <header className="sc-card-head ks-card-heading">
                    <span className="sc-skill-icon">
                      <Icon size={20} />
                    </span>
                    <div className="sc-card-title"><h2>{source.name}</h2></div>
                    <span role="status" className={status === "不可访问" ? "ks-status ks-error" : "ks-status"}>
                      {checking[source.id] ? "验证中…" : accessErrors[source.id] ? "验证失败" : status}
                    </span>
                  </header>
                  <p className="ks-card-preview" title={source.path}>{source.path}</p>
                  <div className="sc-card-tags">
                    <span>{source.additional.length ? `${pathsFor(source).length} 个文件或文件夹` : source.kind === "file" ? "文件" : "文件夹"}</span>
                    <span>
                      {pathsFor(source).some((entry) => entry.storage !== source.storage) ? "本机与共享存储" : source.storage === "local" ? "本机存储" : "共享存储"}
                    </span>
                  </div>
                  <WorkspaceReferences id={source.id} revision={source.revision} />
                  <div className="ks-access-result" role="status">
                    {checking[source.id]
                      ? "正在验证资料路径…"
                      : accessErrors[source.id] || (
                        resultFor(source)?.checkedAt
                          ? `访问验证完成 · ${resultFor(source)?.message} · ${resultFor(source)?.checkedAt}`
                          : status === "不可访问" ? resultFor(source)?.message : ""
                      )}
                  </div>
                  <footer>
                    <button onClick={() => setViewing(source)}>查看全部资料</button>
                    <button onClick={() => openReferences(source)}>
                      查看引用
                    </button>
                    <button
                      onClick={() => {
                        setEditorError("");
                        setEditor({
                          id: source.id,
                          draft: {
                            name: source.name,
                            revision: source.revision,
                            paths: pathsFor(source).map(({ kind, storage, path }) => ({ kind, storage, path })),
                          },
                        });
                      }}
                    >
                      编辑
                    </button>
                    <button
                      disabled={manualChecking[source.id]}
                      onClick={() => {
                        setIssue("");
                        void verify(source, true);
                      }}
                    >
                      {manualChecking[source.id] ? "验证中…" : "访问验证"}
                    </button>
                  </footer>
                </article>
              );
            })}
            {!shown.length && (
              <p className="ks-empty">
                {items.length
                  ? "没有符合条件的知识。"
                  : "暂无知识，请添加文件或文件夹。"}
              </p>
            )}
          </div>
        )}
      </div>
      {editor && (
        <Dialog
          title={editor.id ? "编辑知识" : "添加知识"}
          className="mr-dialog"
          close={() => {
            if (!saving) closeEditor();
          }}
        >
          <form
            id="knowledge-source-form"
            className="sc-form mr-dialog-body ks-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              <span className="mr-field-label">名称 <span className="mr-required" aria-hidden="true">*</span></span>
              <input
                required
                maxLength={80}
                value={editor.draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            {editor.draft.paths.map((entry, index) => (
              <fieldset className="ks-entry" key={index} disabled={saving || browseIndex !== undefined}>
                <legend>资料 {index + 1}</legend>
                <div className="ks-entry-controls">
                  <label>
                    <span className="mr-field-label">资料类型</span>
                    <select value={entry.kind} onChange={(event) => patchPath(index, { kind: event.target.value as SourcePath["kind"] })}>
                      <option value="directory">文件夹</option>
                      <option value="file">文件</option>
                    </select>
                  </label>
                  <label>
                    <span className="mr-field-label">存储位置</span>
                    <select value={entry.storage} onChange={(event) => patchPath(index, { storage: event.target.value as SourcePath["storage"] })}>
                      <option value="local">本机存储</option>
                      <option value="shared">共享存储</option>
                    </select>
                  </label>
                </div>
                <div className="ks-path-actions">
                  <button type="button" aria-label={entry.kind === "file" ? "选择文件" : "选择文件夹"}
                    title={entry.kind === "file" ? "选择文件" : "选择文件夹"}
                    onClick={() => void browse(index, entry.kind)}>
                    {browseIndex === index ? <LoaderCircle size={17} /> : entry.kind === "file" ? <FileText size={17} /> : <FolderOpen size={17} />}
                  </button>
                  <input required maxLength={2000} aria-label={`访问路径 ${index + 1}`}
                    placeholder={entry.kind === "file" ? "输入文件路径，例如 /knowledge/spec.md" : "输入目录路径，例如 /knowledge/product-docs"}
                    value={entry.path} onChange={(event) => patchPath(index, { path: event.target.value })} />
                  {editor.draft.paths.length > 1 && (
                    <button type="button" aria-label={`移除资料 ${index + 1}`}
                      onClick={() => patch({ paths: editor.draft.paths.filter((_, i) => i !== index) })}>
                      <X size={16} />
                    </button>
                  )}
                </div>
                {entry.storage === "shared" && <small>可浏览已挂载的共享目录，或填写系统可访问的共享路径。</small>}
              </fieldset>
            ))}
            <div>
              <button type="button" className="sc-secondary" disabled={saving || browseIndex !== undefined || editor.draft.paths.length >= 100}
                onClick={() => patch({ paths: [...editor.draft.paths, emptyPath] })}>
                <Plus size={14} /> 添加文件或文件夹
              </button>
            </div>
            {editorError && (
              <div role="alert" className="sc-warning">
                {editorError}
              </div>
            )}
          </form>
          <footer className="mr-footer">
            <button
              type="button"
              disabled={saving || browseIndex !== undefined}
              onClick={closeEditor}
            >
              取消
            </button>
            <button type="submit" form="knowledge-source-form" className="ad-primary" disabled={saving || browseIndex !== undefined}>
              {saving ? "保存中…" : "保存"}
            </button>
          </footer>
        </Dialog>
      )}
      {viewing && (
        <Dialog title={viewing.name + " · 全部资料"} className="mr-dialog" close={() => setViewing(undefined)}>
          <div className="mr-dialog-body">
            <KnowledgePaths paths={pathsFor(viewing)} failures={resultFor(viewing)?.failures} />
          </div>
          <footer className="mr-footer">
            <button onClick={() => setViewing(undefined)}>关闭</button>
          </footer>
        </Dialog>
      )}
      {references && (
        <Dialog
          title={references.name + " · 工作空间引用"}
          className="mr-dialog"
          close={() => setReferences(undefined)}
        >
          <div className="mr-dialog-body">
            {references.error ? (
              <p role="alert">{references.error}</p>
            ) : references.items ? (
              references.items.length ? (
                <ul className="ks-path-list ks-reference-list">
                  {references.items.map((ref) => (
                    <li key={ref.id}>
                      <span className="ks-path-icon"><Folder size={17} aria-hidden="true" /></span>
                      <div>
                        <strong>{ref.name}</strong>
                        <div className="ks-path">{ref.path}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ks-reference-empty">暂无工作空间引用此知识。</p>
              )
            ) : (
              <p role="status">正在读取引用…</p>
            )}
          </div>
          <footer className="mr-footer">
            <button onClick={() => setReferences(undefined)}>关闭</button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
