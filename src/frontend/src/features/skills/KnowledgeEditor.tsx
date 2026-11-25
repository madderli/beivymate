import { useState } from "react";
import { FileText, FolderOpen, LoaderCircle, Plus, X } from "lucide-react";
import { request } from "../../api";
import { Dialog } from "../../components";
import { RequiredMark } from "../../RequiredMark";

export type SourcePath = {
  kind: "file" | "directory";
  storage: "local" | "shared";
  path: string;
};
export type KnowledgeSubgroup = { name: string; paths: SourcePath[] };
export type KnowledgeGroup = KnowledgeSubgroup & { children: KnowledgeSubgroup[] };
export type KnowledgeDraft = {
  name: string;
  paths: SourcePath[];
  groups: KnowledgeGroup[];
  revision?: number;
};

const blankPath: SourcePath = { kind: "directory", storage: "local", path: "" };
const blankGroup = (): KnowledgeGroup => ({ name: "", paths: [], children: [] });

export const groupPaths = (groups: KnowledgeGroup[]) =>
  groups.flatMap((group) => [...group.paths, ...group.children.flatMap((child) => child.paths)]);

function replaceAt<T>(items: T[], index: number, entry: T) {
  return items.map((item, position) => position === index ? entry : item);
}
function removeAt<T>(items: T[], index: number) {
  return items.filter((_, position) => position !== index);
}

type PickPath = (kind: SourcePath["kind"], apply: (path: string) => void) => Promise<void>;

function AddPathButton({ paths, change }: { paths: SourcePath[]; change: (paths: SourcePath[]) => void }) {
  return (
    <button type="button" className="sc-secondary" disabled={paths.length >= 100}
      onClick={() => change([...paths, blankPath])}>
      <Plus size={14} /> 添加文件或文件夹
    </button>
  );
}

function PathFields({ paths, change, pick }: {
  paths: SourcePath[];
  change: (paths: SourcePath[]) => void;
  pick: PickPath;
}) {
  return (
    <>
      {paths.map((entry, index) => {
        const patch = (value: Partial<SourcePath>) => change(replaceAt(paths, index, { ...entry, ...value }));
        return (
          <fieldset className="ks-entry" key={index}>
            <legend>资料 {index + 1}</legend>
            <div className="ks-entry-controls">
              <label>
                <span className="mr-field-label">资料类型</span>
                <select value={entry.kind} onChange={(event) => patch({ kind: event.target.value as SourcePath["kind"] })}>
                  <option value="directory">文件夹</option>
                  <option value="file">文件</option>
                </select>
              </label>
              <label>
                <span className="mr-field-label">存储位置</span>
                <select value={entry.storage} onChange={(event) => patch({ storage: event.target.value as SourcePath["storage"] })}>
                  <option value="local">本机存储</option>
                  <option value="shared">共享存储</option>
                </select>
              </label>
              <div className="ks-path-field">
                <span className="mr-field-label">访问路径</span>
                <div className="ks-path-actions">
                  <button type="button"
                    aria-label={entry.kind === "file" ? "选择文件" : "选择文件夹"}
                    title={entry.kind === "file" ? "选择文件" : "选择文件夹"}
                    onClick={() => void pick(entry.kind, (path) => patch({ path }))}>
                    {entry.kind === "file" ? <FileText size={17} /> : <FolderOpen size={17} />}
                  </button>
                  <input required maxLength={2000} aria-label={`访问路径 ${index + 1}`}
                    placeholder="填写可访问的绝对路径" value={entry.path}
                    onChange={(event) => patch({ path: event.target.value })} />
                  <button type="button" aria-label={`移除资料 ${index + 1}`}
                    onClick={() => change(removeAt(paths, index))}>
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
            {entry.storage === "shared" && <small>可选择已挂载的共享目录，或填写可访问的共享路径。</small>}
          </fieldset>
        );
      })}
    </>
  );
}

function GroupFields({ group, change, remove, pick, child = false, actions, children }: {
  group: KnowledgeSubgroup;
  change: (next: KnowledgeSubgroup) => void;
  remove: () => void;
  pick: PickPath;
  child?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <fieldset className="ks-group">
      <legend>{child ? "子分组" : "分组"}</legend>
      <div className="ks-group-heading">
        <label>
          <span className="mr-field-label">分组名称 <RequiredMark /></span>
          <input value={group.name} required maxLength={80}
            onChange={(event) => change({ ...group, name: event.target.value })} />
        </label>
        <div className="ks-entry-buttons">
          <AddPathButton paths={group.paths} change={(paths) => change({ ...group, paths })} />
          {actions}
          <button type="button" className="sc-secondary ks-remove-group" aria-label={child ? "移除子分组" : "移除分组"}
            onClick={remove}><X size={15} /></button>
        </div>
      </div>
      <PathFields paths={group.paths} change={(paths) => change({ ...group, paths })} pick={pick} />
      {children}
    </fieldset>
  );
}

export default function KnowledgeEditor({ initial, id, onClose, onSave }: {
  initial?: KnowledgeDraft;
  id?: string;
  onClose: () => void;
  onSave: (draft: KnowledgeDraft) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [paths, setPaths] = useState(initial?.paths.length ? initial.paths : [blankPath]);
  const [groups, setGroups] = useState(initial?.groups ?? []);
  const [grouped, setGrouped] = useState(Boolean(initial?.groups.length));
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const busy = saving || selecting;
  const close = () => { if (!busy) onClose(); };

  const pick: PickPath = async (kind, apply) => {
    setSelecting(true);
    setError("");
    try {
      const { path } = await request<{ path: string | null }>("/knowledge-sources/pick-path", {
        method: "POST",
        body: JSON.stringify({ kind }),
      }, 310_000);
      if (path) apply(path);
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法打开系统选择窗口。");
    } finally {
      setSelecting(false);
    }
  };

  async function submit() {
    if (busy) return;
    if (!name.trim()) {
      setError("请填写知识库名称。");
      return;
    }
    if (grouped && (!groups.length || groups.some((group) =>
      (!group.paths.length && !group.children.length) || group.children.some((child) => !child.paths.length)
    ))) {
      setError("请至少添加一个分组，每个分组需有资料或子分组，子分组需有资料。");
      return;
    }
    if ((grouped ? groupPaths(groups) : paths).length === 0) {
      setError("请至少添加一个文件或文件夹。");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave({ name, paths: grouped ? [] : paths, groups: grouped ? groups : [], revision: initial?.revision });
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={id ? "编辑知识库" : "添加知识库"} className="mr-dialog" close={close}>
      <form id="knowledge-source-form" className="sc-form mr-dialog-body ks-editor-form"
        onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <fieldset className="ks-editor-fields" disabled={busy}>
          <label>
            <span className="mr-field-label">知识库名称 <RequiredMark /></span>
            <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="ks-group-toggle">
            <input type="checkbox" checked={grouped} onChange={(event) => {
              setGrouped(event.target.checked);
              if (event.target.checked && !groups.length) setGroups([blankGroup()]);
            }} />
            分组
          </label>
          {initial && grouped !== Boolean(initial.groups.length) && (
            <small>切换后，保存将以当前模式下填写的资料为准。</small>
          )}
          {grouped ? (
            <>
              <small>可添加多个分组，每个分组可再添加一层子分组。</small>
              {groups.map((group, index) => {
                const change = (next: KnowledgeGroup) => setGroups(replaceAt(groups, index, next));
                return (
                  <GroupFields key={index} group={group} pick={pick}
                    change={(next) => change({ ...group, ...next })}
                    remove={() => setGroups(removeAt(groups, index))}
                    actions={(
                      <button type="button" className="sc-secondary" disabled={group.children.length >= 100}
                        onClick={() => change({
                          ...group,
                          children: [...group.children, { name: "", paths: [] }],
                        })}>
                        <Plus size={14} /> 添加子分组
                      </button>
                    )}>
                    {group.children.map((child, childIndex) => (
                      <GroupFields key={childIndex} group={child} pick={pick} child
                        change={(next) => change({ ...group, children: replaceAt(group.children, childIndex, next) })}
                        remove={() => change({ ...group, children: removeAt(group.children, childIndex) })} />
                    ))}
                  </GroupFields>
                );
              })}
              <div><button type="button" className="sc-secondary" disabled={groups.length >= 100}
                onClick={() => setGroups([...groups, blankGroup()])}>
                <Plus size={14} /> 添加分组
              </button></div>
            </>
          ) : (
            <>
              <PathFields paths={paths} change={setPaths} pick={pick} />
              <div><AddPathButton paths={paths} change={setPaths} /></div>
            </>
          )}
        </fieldset>
        {selecting && <div role="status" className="ks-access-result"><LoaderCircle size={15} />正在等待系统选择窗口…</div>}
        {error && <div role="alert" className="sc-warning">{error}</div>}
      </form>
      <footer className="mr-footer">
        <button type="button" disabled={busy} onClick={close}>取消</button>
        <button type="submit" form="knowledge-source-form" className="ad-primary" disabled={busy}>
          {saving ? "保存中…" : "保存知识"}
        </button>
      </footer>
    </Dialog>
  );
}
