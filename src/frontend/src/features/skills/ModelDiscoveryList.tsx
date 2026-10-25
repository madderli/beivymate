import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import "./model-discovery.css";

export function ModelDiscoveryList({
  models,
  existing,
  selected,
  change,
}: {
  models: string[];
  existing: string[];
  selected: string[];
  change: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const master = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const added = new Set(existing);
  const chosen = new Set(selected);
  const available = models.filter((id) => !added.has(id));
  const visible = models.filter(
    (id) =>
      (!onlySelected || chosen.has(id)) &&
      id.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectable = visible.filter((id) => !added.has(id));
  const count = selectable.filter((id) => chosen.has(id)).length;
  const all = selectable.length > 0 && count === selectable.length;
  useEffect(() => {
    if (master.current) master.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [query, onlySelected]);
  const showHint =
    query.trim() && !onlySelected && all && selected.length < available.length;
  return (
    <section className="mdiscovery" aria-label="发现模型列表">
      <p className="mdiscovery-lead">
        共 {models.length} 个模型，可先搜索，再勾选需要添加的模型。
        已添加的模型无需重复选择，如需移除，请在模型管理中删除。
      </p>
      <div className="mdiscovery-search-row">
        <div className="mdiscovery-search">
          <Search size={19} aria-hidden="true" />
          <input
            ref={search}
            aria-label="搜索发现的模型"
            placeholder="输入关键字搜索模型…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className={`mdiscovery-chip ${selected.length ? "active" : ""}`}>
          已选 <b>{selected.length}</b> 项
        </span>
      </div>
      <div className="mdiscovery-toolbar">
        <div>
          <label className="mdiscovery-master">
            <input
              ref={master}
              type="checkbox"
              checked={all}
              disabled={!selectable.length}
              onChange={() =>
                change(
                  all
                    ? selected.filter((id) => !selectable.includes(id))
                    : [...new Set([...selected, ...selectable])],
                )
              }
            />
            全选当前结果
          </label>
          <button
            type="button"
            className="mdiscovery-text"
            disabled={!selected.length}
            onClick={() => change([])}
          >
            清空已选
          </button>
        </div>
        <label className="mdiscovery-toggle-label">
          只看已选
          <button
            type="button"
            role="switch"
            aria-label="只看已选"
            aria-checked={onlySelected}
            className={`mdiscovery-toggle ${onlySelected ? "on" : ""}`}
            onClick={() => setOnlySelected(!onlySelected)}
          />
        </label>
      </div>
      {showHint && (
        <div className="mdiscovery-hint">
          <span>已勾选当前筛选的 {selectable.length} 项 —</span>
          <button type="button" onClick={() => change(available)}>
            点此全选全部 {available.length} 项未添加模型
          </button>
        </div>
      )}
      <div className="mdiscovery-list">
        <div className="mdiscovery-scroll" ref={scroll}>
          {!visible.length && (
            <div className="mdiscovery-empty" role="status">
              <strong>
                {onlySelected && !selected.length
                  ? "还没有勾选任何模型"
                  : `没有匹配「${query.trim()}」的模型`}
              </strong>
              <span>
                {onlySelected && !selected.length
                  ? "先关闭「只看已选」，在列表里勾选需要的模型。"
                  : "换个关键字试试，或清除搜索查看全部模型。"}
              </span>
            </div>
          )}
          {visible.map((id) => (
            <label
              key={id}
              className={`mdiscovery-row ${chosen.has(id) ? "selected" : ""} ${added.has(id) ? "added" : ""}`}
            >
              {added.has(id) ? (
                <Check size={18} aria-hidden="true" />
              ) : (
              <input
                type="checkbox"
                aria-label={id}
                checked={chosen.has(id)}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...selected, id]
                      : selected.filter((item) => item !== id),
                  )
                }
              />
              )}
              <span className="mdiscovery-name" title={id}>
                {id}
              </span>
              <small
                className={`mdiscovery-tag ${added.has(id) ? "added" : ""}`}
              >
                {added.has(id) ? "已添加" : "未添加"}
              </small>
            </label>
          ))}
        </div>
        <div className="mdiscovery-list-foot">
          已显示 {visible.length} / {models.length} 项 · 已添加{" "}
          {models.filter((id) => added.has(id)).length} 项
        </div>
      </div>
      <div className="mdiscovery-summary" aria-live="polite">
        <span>
          已选 <b>{selected.length}</b> 项
        </span>
        <span title={selected.join("、")}>
          {selected.length
            ? selected.slice(0, 5).join("、") +
              (selected.length > 5 ? " …" : "")
            : "尚未选择任何模型"}
        </span>
      </div>
    </section>
  );
}
