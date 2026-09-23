import { useEffect, useState } from "react";
import { request } from "./api";
type Template = {
  name: string;
  builtin: boolean;
  revision: string;
  path: string;
  text: string | null;
  content: string;
  usage: "reference" | "template";
  usageDescription: string;
};
export function SkillTemplates({
  skill,
  onDirty,
}: {
  skill: string;
  onDirty: (dirty: boolean) => void;
}) {
  const [items, setItems] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template>();
  const [text, setText] = useState("");
  const [binary, setBinary] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request<{ items: Template[] }>(
      `/configuration/skills/${encodeURIComponent(skill)}/templates`,
    )
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [skill]);
  const dirty =
    selected &&
    (binary !== undefined ||
      (text !== selected.text && selected.text !== null));
  useEffect(() => {
    onDirty(Boolean(dirty));
    return () => onDirty(false);
  }, [dirty, onDirty]);
  return (
    <details>
      <summary>查看和维护技能模板</summary>
      <p>
        系统资源只读。自定义副本可在此编辑，或编辑对应文件。标为“参考资料”的文件不控制产物生成格式。
      </p>
      <label>
        选择模板
        <select
          aria-label="选择模板"
          disabled={busy}
          value={selected?.name || ""}
          onChange={(e) => {
            if (dirty && !window.confirm("模板修改尚未保存，确认放弃？"))
              return;
            const item = items.find((i) => i.name === e.target.value);
            setSelected(item);
            setText(item?.text || "");
            setBinary(undefined);
            setError("");
          }}
        >
          <option value="">请选择模板</option>
          {items.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name}
              {i.usage === "reference" ? " · 参考资料" : " · 生成模板"}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p className="muted">{selected.path}</p>
          <p role="status">{selected.usageDescription}</p>
          {selected.text !== null ? (
            <label>
              模板内容
              <textarea
                aria-label="模板内容"
                rows={10}
                value={text}
                readOnly={selected.builtin || busy}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          ) : (
            <>
              <a
                download={selected.name.split("/").pop()}
                href={`data:application/octet-stream;base64,${selected.content}`}
              >
                下载模板
              </a>
              {!selected.builtin && (
                <label>
                  替换模板文件
                  <input
                    aria-label="替换模板文件"
                    type="file"
                    disabled={busy}
                    accept={selected.name.endsWith(".xlsx") ? ".xlsx" : ".docx"}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 180000) {
                        setError("模板大小不能超过 180 KB。");
                        return;
                      }
                      try {
                        const bytes = new Uint8Array(await file.arrayBuffer());
                        let value = "";
                        bytes.forEach((b) => {
                          value += String.fromCharCode(b);
                        });
                        setBinary(btoa(value));
                      } catch {
                        setError("读取模板失败。");
                      }
                    }}
                  />
                </label>
              )}
            </>
          )}
          {!selected.builtin && (
            <button
              className="secondary"
              disabled={busy || !dirty}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  let encoded = binary;
                  if (selected.text !== null) {
                    let value = "";
                    new TextEncoder().encode(text).forEach((b) => {
                      value += String.fromCharCode(b);
                    });
                    encoded = btoa(value);
                  }
                  const saved = await request<Template>(
                    `/configuration/skills/${encodeURIComponent(skill)}/templates`,
                    {
                      method: "PUT",
                      body: JSON.stringify({
                        name: selected.name,
                        revision: selected.revision,
                        content: encoded,
                      }),
                    },
                  );
                  setSelected(saved);
                  setText(saved.text || "");
                  setBinary(undefined);
                  setItems((old) =>
                    old.map((i) => (i.name === saved.name ? saved : i)),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在保存模板…" : "保存模板"}
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
