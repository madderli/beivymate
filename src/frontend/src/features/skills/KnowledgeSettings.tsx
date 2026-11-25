import { useEffect, useState } from "react";
import { FileText, Folder, Folders, Plus, Search } from "lucide-react";
import { request } from "../../api";
import { formatModifiedTime } from "../formatModifiedTime";
import { Dialog } from "../../components";
import KnowledgeEditor, { type KnowledgeDraft, type KnowledgeGroup, type SourcePath } from "./KnowledgeEditor";
import "../../preview/model-settings.css";
import "./knowledge-settings.css";

type Source = SourcePath & {
  id: string;
  name: string;
  revision: number;
  updated: string;
  additional: SourcePath[];
  groups: KnowledgeGroup[];
  access: Access;
};
type Access = {
  revision: number;
  accessible: boolean | null;
  message: string;
  checkedAt?: string;
  failures: { path: string; message: string }[];
  results: { path: string; accessible: boolean }[];
};
const pathsFor = (source: Source) => [
  { kind: source.kind, storage: source.storage, path: source.path },
  ...source.additional,
];

function sectionsFor(source: Source) {
  return source.groups.flatMap((group) => [
    ...(group.paths.length ? [{ name: group.name, paths: group.paths }] : []),
    ...group.children.map((child) => ({ name: `${group.name} / ${child.name}`, paths: child.paths })),
  ]);
}

function pathStatus(paths: SourcePath[], access: Access) {
  const results = new Map(access.results.map(({ path, accessible }) => [path, accessible]));
  if (paths.some(({ path }) => results.get(path) === false)) return "不可访问";
  return paths.every(({ path }) => results.get(path) === true) ? "可访问" : "待验证";
}

function statusFor(source: Source) {
  if (!source.groups.length) {
    return { label: pathStatus(pathsFor(source), source.access), summary: "" };
  }
  const states = sectionsFor(source).map(({ paths }) => pathStatus(paths, source.access));
  const ready = states.filter((state) => state === "可访问").length;
  const failed = states.filter((state) => state === "不可访问").length;
  const pending = states.length - ready - failed;
  const label = failed
    ? pending ? "有访问异常" : ready ? "部分不可访问" : "不可访问"
    : pending ? "待验证" : "可访问";
  const summary = [
    ready ? `${ready} 条可访问` : "",
    failed ? `${failed} 条不可访问` : "",
    pending ? `${pending} 条待验证` : "",
  ].filter(Boolean).join(" · ");
  return { label, summary };
}

function belongsToFilter(source: Source, filter: string) {
  if (!filter) return true;
  const { label } = statusFor(source);
  return filter === "不可访问" ? ["不可访问", "部分不可访问", "有访问异常"].includes(label) : label === filter;
}

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
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editor, setEditor] = useState<Source | "new">();
  const [viewingId, setViewingId] = useState<string>();
  const viewing = items.find(({ id }) => id === viewingId);
  const [accessErrors, setAccessErrors] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<{
    id: string;
    name: string;
    items?: Reference[];
    error?: string;
  }>();
  async function verify(source: Source) {
    setAccessErrors((old) => ({ ...old, [source.id]: "" }));
    setChecking((old) => ({ ...old, [source.id]: true }));
    try {
      const result = await request<Access>(`/knowledge-sources/${source.id}/access`, { method: "POST" });
      const checkedAt = new Date().toISOString();
      setItems((old) => old.map((item) =>
        item.id === source.id && item.revision === result.revision
          ? { ...item, access: { ...result, checkedAt } }
          : item,
      ));
    } catch (error) {
      setAccessErrors((old) => ({ ...old, [source.id]: errorText(error) }));
    } finally {
      setChecking((old) => ({ ...old, [source.id]: false }));
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void request<{ items: Source[] }>("/knowledge-sources", { signal: controller.signal })
      .then(({ items }) => { setItems(items); setLoading(false); })
      .catch((error) => {
        if (!controller.signal.aborted) { setIssue(errorText(error)); setLoading(false); }
      });
    return () => controller.abort();
  }, []);

  const shown = items.filter((source) =>
    belongsToFilter(source, filter) &&
    [source.name, ...sectionsFor(source).map(({ name }) => name), ...pathsFor(source).map((entry) => entry.path)]
      .join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function save(draft: KnowledgeDraft) {
    const id = editor && editor !== "new" ? editor.id : undefined;
    const { name, revision, groups, paths: [first, ...additional] } = draft;
    const value = await request<Source>("/knowledge-sources" + (id ? "/" + id : ""), {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(groups.length ? { name, revision, groups } : { name, revision, ...first, additional }),
    });
    setItems((old) => [value, ...old.filter((source) => source.id !== value.id)]);
    setAccessErrors((old) => ({ ...old, [value.id]: "" }));
    setEditor(undefined);
    setFeedback("知识库已保存。");
  }

  function openReferences(source: Source) {
    setReferences({ id: source.id, name: source.name });
    void request<{ items: Reference[] }>(
      `/knowledge-sources/${source.id}/references`,
    )
      .then((result) =>
        setReferences((old) =>
          old?.id === source.id
            ? { ...old, items: result.items }
            : old,
        ),
      )
      .catch((error) =>
        setReferences((old) =>
          old?.id === source.id
            ? { ...old, error: errorText(error) }
            : old,
        ),
      );
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
            onClick={() => setEditor("new")}
          >
            <Plus size={16} />
            添加知识库
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
            {["", "可访问", "不可访问", "待验证"].map((status) => (
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
                      (source) => belongsToFilter(source, status),
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
          <div className="sc-grid ks-grid">
            {shown.map((source) => {
              const grouped = source.groups.length > 0;
              const Icon = grouped ? Folders : Folder;
              const paths = pathsFor(source);
              const { label: status, summary } = statusFor(source);
              const preview = grouped ? source.groups.map(({ name }) => name).join("、") : source.path;
              return (
                <article className="sc-card ks-card" key={source.id}>
                  <header className="sc-card-head ks-card-heading">
                    <span className={`sc-skill-icon${grouped ? " ks-group-icon" : ""}`}>
                      <Icon size={20} />
                    </span>
                    <div className="sc-card-title"><h2>{source.name}</h2></div>
                    <span role="status" className={belongsToFilter(source, "不可访问") ? "ks-status ks-error" : "ks-status"}>
                      {checking[source.id] ? "验证中…" : accessErrors[source.id] ? "验证失败" : status}
                    </span>
                  </header>
                  <div className="ks-card-preview-line">
                    {grouped && <span className="ks-group-count">{source.groups.length} 个分组</span>}
                    <p className="ks-card-preview" title={preview}>{preview}</p>
                  </div>
                  <div className="sc-card-tags">
                    <span>{paths.length > 1 ? `${paths.length} 个文件或文件夹` : source.kind === "file" ? "1 个文件" : "1 个文件夹"}</span>
                    <span>{paths.some((entry) => entry.storage !== source.storage)
                      ? "本机与共享存储"
                      : source.storage === "local" ? "本机存储" : "共享存储"}</span>
                  </div>
                  <div className="sc-card-metrics ks-card-metrics">
                    <WorkspaceReferences id={source.id} revision={source.revision} />
                    <time className="sc-modified-time" dateTime={source.updated} title="最后修改时间">
                      最后修改：{formatModifiedTime(source.updated)}
                    </time>
                  </div>
                  <div className="sc-card-metrics ks-card-metrics ks-access-result" role="status">
                    {(checking[source.id] || accessErrors[source.id] || source.access.checkedAt || summary || status === "不可访问") && (
                      <span>{checking[source.id]
                        ? "正在验证资料路径…"
                        : accessErrors[source.id] || (
                          source.access.checkedAt
                            ? `访问验证完成 · ${summary || source.access.message}`
                            : summary ? `访问验证 · ${summary}` : source.access.message
                        )}</span>
                    )}
                    {source.access.checkedAt && !checking[source.id] && (
                      <time className="sc-modified-time" dateTime={source.access.checkedAt} title="最近一次验证完成时间">
                        验证时间：{formatModifiedTime(source.access.checkedAt)}
                      </time>
                    )}
                  </div>
                  <footer>
                    <button onClick={() => setViewingId(source.id)}>查看资料</button>
                    <button onClick={() => openReferences(source)}>查看引用</button>
                    <button disabled={checking[source.id]} onClick={() => setEditor(source)}>编辑知识库</button>
                    <button disabled={checking[source.id]} onClick={() => void verify(source)}>
                      {checking[source.id] ? "验证中…" : "访问验证"}
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
        <KnowledgeEditor key={editor === "new" ? "new" : editor.id}
          id={editor === "new" ? undefined : editor.id}
          initial={editor === "new" ? undefined : {
            name: editor.name,
            revision: editor.revision,
            paths: editor.groups.length ? [] : pathsFor(editor),
            groups: editor.groups,
          }}
          onClose={() => setEditor(undefined)} onSave={save} />
      )}
      {viewing && (
        <Dialog title={viewing.name + " · 全部资料"} className="mr-dialog" close={() => setViewingId(undefined)}>
          <div className="mr-dialog-body ks-detail-groups">
            {viewing.groups.length ? sectionsFor(viewing).map(({ name, paths }) => (
              <section key={paths[0].path}>
                <div className="ks-detail-heading">
                  <strong>{name}</strong>
                  <small>{pathStatus(paths, viewing.access)}</small>
                </div>
                <KnowledgePaths paths={paths} failures={viewing.access.failures} />
              </section>
            )) : <KnowledgePaths paths={pathsFor(viewing)} failures={viewing.access.failures} />}
          </div>
          <footer className="mr-footer">
            <button onClick={() => setViewingId(undefined)}>关闭</button>
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
