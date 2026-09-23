import { useEffect, useState } from "react";
import { request } from "./api";
import { Dialog } from "./components";
type Ref = { id: string; revision: number; sha256: string };
type Entry = {
  ref: Ref;
  origin: { task: string; skill: string };
  policy: { filename: string; editable: boolean; asset: boolean };
  path: string;
  confirmed_by: string | null;
  lifecycle: string;
  upstream_changed: boolean;
  file_changed: boolean;
  working_file_changed: boolean;
  published_file_changed: boolean;
  publications: { ref: Ref; path: string; status: string }[];
};
export function DocumentLibrary({ close }: { close: () => void }) {
  const [items, setItems] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry>();
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    const result = await request<{ items: Entry[] }>("/documents");
    setItems(result.items);
    return result.items;
  };
  useEffect(() => {
    let active = true;
    request<{ items: Entry[] }>("/documents")
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const discard = () =>
    text === original || window.confirm("文档修改未保存，确认放弃？");
  const readable = (item: Entry) =>
    /\.(md|txt|json)$/.test(item.policy.filename);
  const load = async (item: Entry) => {
    setBusy(true);
    setError("");
    try {
      const result = readable(item)
        ? await request<{ content: string }>(
            `/documents/${item.ref.id}/text?revision=${item.ref.revision}&sha256=${item.ref.sha256}`,
          )
        : { content: "" };
      setSelected(item);
      setText(result.content);
      setOriginal(result.content);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (action: string, target?: Ref) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request("/documents/actions", {
        method: "POST",
        body: JSON.stringify({
          ref: target || selected.ref,
          action,
          ...(action === "edit" ? { content: text } : {}),
        }),
      });
      const next = (await refresh()).find((i) => i.ref.id === selected.ref.id);
      if (next) await load(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="产物与工作资产"
      close={() => {
        if (!busy && discard()) close();
      }}
    >
      <div className="dialog-body">
        <p>
          展示实际生成的文档。修改保存为新版本；历史确认记录保留，下游不会自动采用修改后的内容。
        </p>
        {!items.length && <p>当前账户暂无已登记产物。</p>}
        <label>
          选择产物
          <select
            disabled={busy}
            value={selected?.ref.id || ""}
            onChange={(e) => {
              if (!discard()) return;
              const item = items.find((i) => i.ref.id === e.target.value);
              if (item) void load(item);
            }}
          >
            <option value="">请选择</option>
            {items.map((i) => (
              <option key={i.ref.id} value={i.ref.id}>
                {i.origin.task} · {i.policy.filename} · 版本 {i.ref.revision}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <p className="muted">{selected.path}</p>
            <p>
              {selected.confirmed_by
                ? `确认人：${selected.confirmed_by}`
                : "待确认"}{" "}
              ·{" "}
              {selected.lifecycle === "published"
                ? "已发布"
                : selected.lifecycle === "retired"
                  ? "已废除"
                  : "草稿"}
            </p>
            {selected.upstream_changed && (
              <p role="status">上游文档已更新，请重新检查本产物。</p>
            )}
            {selected.working_file_changed && (
              <p role="status">
                磁盘文件与登记版本不一致。请导入修改，或恢复文件后再确认。
              </p>
            )}
            {selected.publications?.map((publication) => (
              <div key={publication.ref.revision}>
                <p className="muted">
                  发布版本 {publication.ref.revision}：{publication.path}
                </p>
                {publication.status !== "ok" && (
                  <>
                    <p role="alert">
                      发布文件异常：
                      {(
                        {
                          changed: "内容已修改",
                          missing: "文件缺失",
                          outside: "路径超出管理范围",
                          unavailable: "无法读取",
                        } as Record<string, string>
                      )[publication.status] || "需检查"}
                      。登记的历史内容仍保留。
                    </p>
                    <button
                      disabled={
                        busy ||
                        text !== original ||
                        publication.status === "outside"
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            "恢复为登记的发布版本？当前异常文件会先另存备份。",
                          )
                        )
                          void action("restore-publication", publication.ref);
                      }}
                    >
                      恢复发布版本 {publication.ref.revision}
                    </button>
                  </>
                )}
              </div>
            ))}
            {readable(selected) && (
              <label>
                文档内容
                <textarea
                  aria-label="文档内容"
                  rows={15}
                  readOnly={
                    busy ||
                    !selected.policy.editable ||
                    selected.lifecycle === "retired"
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
            )}
            <a
              href={`/api/v1/documents/${selected.ref.id}/content?revision=${selected.ref.revision}&sha256=${selected.ref.sha256}`}
              download={selected.policy.filename}
            >
              下载登记版本
            </a>
            {selected.policy.editable && readable(selected) && (
              <button
                disabled={
                  busy || text === original || selected.lifecycle === "retired"
                }
                onClick={() => void action("edit")}
              >
                保存新版本
              </button>
            )}
            {selected.working_file_changed && selected.policy.editable && (
              <button
                disabled={busy || text !== original}
                onClick={() => void action("import-file")}
              >
                导入文件修改
              </button>
            )}
            <button
              disabled={
                busy ||
                text !== original ||
                selected.file_changed ||
                !!selected.confirmed_by
              }
              onClick={() => void action("confirm")}
            >
              确认此版本
            </button>
            {selected.policy.asset && (
              <>
                <button
                  disabled={
                    busy ||
                    text !== original ||
                    selected.file_changed ||
                    !selected.confirmed_by ||
                    selected.lifecycle !== "draft"
                  }
                  onClick={() => void action("publish")}
                >
                  发布资产
                </button>
                <button
                  disabled={busy || selected.lifecycle === "retired"}
                  onClick={() => {
                    if (window.confirm("确认废除此资产？历史版本仍会保留。"))
                      void action("retire");
                  }}
                >
                  废除资产
                </button>
              </>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
