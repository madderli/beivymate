import { useState } from "react";
import {
  ArrowUpRight,
  FolderOpen,
  GitBranch,
  LockKeyhole,
  Pause,
  Play,
  Settings2,
  Star,
} from "lucide-react";
import "./workspace-card.css";
export type WorkspaceCardData = {
  id: string;
  name: string;
  description: string;
  products: string[];
  projects: string[];
  directories: string[];
  isDefault: boolean;
  enabled: boolean;
  pending: { related: boolean }[];
};
export function WorkspaceCard({
  workspace: w,
  edit,
  toggle,
  open,
  canManage = true,
  busy = false,
  editLabel,
}: {
  workspace: WorkspaceCardData;
  edit: () => void;
  toggle: () => void;
  open: () => void;
  canManage?: boolean;
  busy?: boolean;
  editLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const tones = ["forest", "copper", "plum", "blue", "ochre", "teal", "slate"];
  let hash = 2166136261;
  for (const char of w.id)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const tone = tones[((hash % tones.length) + w.id.length) % tones.length];
  const monogram = Array.from(w.id).slice(0, 4).join("").toUpperCase();
  const locked = w.pending.length > 0;
  const related = w.pending.filter((t) => t.related).length;
  return (
    <article
      className={`wcd-card ${w.isDefault ? "is-default" : ""} ${w.enabled ? "" : "is-disabled"}`}
      aria-label={`${w.id} ${w.name}`}
      data-tone={tone}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) open();
      }}
    >
      <header className="wcd-card-heading">
        <span
          className={`wcd-monogram ${monogram.length > 2 ? "long" : ""}`}
          aria-hidden="true"
          title={w.id}
        >
          {monogram}
        </span>
        <div className="wcd-identity">
          <b>{w.id}</b>
          <h2 title={w.name}>{w.name}</h2>
        </div>
        <span className={`wcd-enabled ${w.enabled ? "" : "off"}`}>
          <i />
          {w.enabled ? "已启用" : "已停用"}
        </span>
      </header>
      <p className="wcd-description" title={w.description}>
        {w.description || "暂未添加工作区描述"}
      </p>
      <div className="wcd-default-line">
        <span className={`wcd-default ${w.isDefault ? "selected" : ""}`}>
          <Star size={13} aria-hidden="true" />
          {w.isDefault ? "默认工作区" : "非默认工作区"}
        </span>
      </div>
      <div className="wcd-details">
        <div className="wcd-detail-row">
          <span className="wcd-detail-label">覆盖产品</span>
          <div className="wcd-tags">
            {w.products.length ? (
              w.products.map((p) => (
                <span key={p} title={p}>
                  {p}
                </span>
              ))
            ) : (
              <span className="wcd-empty">暂未添加</span>
            )}
          </div>
        </div>
        <div className="wcd-detail-row">
          <span className="wcd-detail-label">覆盖项目</span>
          <div className="wcd-tags">
            {w.projects.length ? (
              w.projects.map((p) => (
                <span key={p} title={p}>
                  {p}
                </span>
              ))
            ) : (
              <span className="wcd-empty">暂未添加</span>
            )}
          </div>
        </div>
        <div className="wcd-detail-row wcd-knowledge">
          <span className="wcd-detail-label">知识来源</span>
          <div>
            {(expanded ? w.directories : w.directories.slice(0, 2)).map(
              (path) => (
                <div className="wcd-path" key={path} title={path}>
                  <FolderOpen size={13} />
                  <span>{path}</span>
                </div>
              ),
            )}
            {!w.directories.length && (
              <span className="wcd-empty">暂未添加知识目录</span>
            )}
            {w.directories.length > 2 && (
              <button
                className="wcd-more"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? "收起目录"
                  : `另有 ${w.directories.length - 2} 个目录 · 展开`}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="wcd-task-summary">
        <div>
          <span>未完成任务</span>
          <strong>{w.pending.length}</strong>
        </div>
        <div>
          <span>独立任务</span>
          <b>{w.pending.length - related}</b>
        </div>
        <div>
          <GitBranch size={12} />
          <span>关联任务</span>
          <b>{related}</b>
        </div>
      </div>
      <div className="wcd-state-line">
        <span>
          {locked ? (
            <>
              <LockKeyhole size={11} />
              任务关闭后可编辑、停用
            </>
          ) : (
            "全部任务已关闭，可编辑或调整状态"
          )}
        </span>
      </div>
      <footer className="wcd-card-actions">
        <button
          disabled={locked || !canManage || busy}
          title={locked ? "请先关闭工作区中的全部任务" : "编辑工作区"}
          aria-label={editLabel}
          onClick={edit}
        >
          <Settings2 size={14} />
          编辑
        </button>
        <button
          disabled={!canManage || busy || (w.enabled && locked)}
          title={
            w.enabled && locked
              ? "请先关闭工作区中的全部任务"
              : w.enabled
                ? "停用工作区"
                : "启用工作区"
          }
          onClick={toggle}
        >
          {w.enabled ? <Pause size={14} /> : <Play size={14} />}
          {w.enabled ? "停用" : "启用"}
        </button>
        <button className="wcd-open" onClick={open}>
          打开
          <ArrowUpRight size={15} />
        </button>
      </footer>
    </article>
  );
}
