import { useEffect, useState } from "react";
import { request } from "./api";
import { SkillTemplates } from "./SkillTemplates";
import { Dialog } from "./components";
type Entry = {
  id: string;
  name: string;
  builtin: boolean;
  revision: string;
  content: string;
  path: string;
};
export function ConfigurationLibrary({ close }: { close: () => void }) {
  const [models, setModels] = useState<Entry[]>([]);
  useEffect(() => {
    let active = true;
    request<{ items: Entry[] }>("/configuration/models")
      .then((r) => {
        if (active) setModels(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const [kind, setKind] = useState("skills");
  const [items, setItems] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry>();
  const [content, setContent] = useState("");
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [copy, setCopy] = useState(false);
  useEffect(() => {
    let active = true;
    setSelected(undefined);
    setError("");
    setItems([]);
    request<{ items: Entry[] }>(`/configuration/${kind}`)
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind]);
  const canDiscard = () =>
    !selected ||
    (!copy && !templateDirty && content === selected.content) ||
    window.confirm("修改尚未保存，确认放弃当前草稿？");
  return (
    <Dialog
      title="技能与工作流配置"
      close={() => {
        if (!busy && canDiscard()) close();
      }}
    >
      <div className="dialog-body">
        <p>
          系统默认配置只读。自定义副本与手工编辑使用同一个文件；保存冲突时保留草稿。
        </p>
        <label>
          配置类型
          <select
            disabled={busy}
            value={kind}
            onChange={(e) => {
              if (canDiscard()) setKind(e.target.value);
            }}
          >
            <option value="skills">技能</option>
            <option value="workflows">工作流</option>
          </select>
        </label>
        <label>
          选择配置
          <select
            aria-label="选择配置"
            disabled={busy}
            value={selected?.id || ""}
            onChange={(e) => {
              if (!canDiscard()) return;
              const item = items.find((i) => i.id === e.target.value);
              setSelected(item);
              setContent(item?.content || "");
              setIdentity(item?.id || "");
              setCopy(false);
              setError("");
            }}
          >
            <option value="">请选择</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.builtin ? "系统默认" : "自定义"}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <p className="muted">{selected.path}</p>
            {kind === "skills" && !copy && (
              <SkillTemplates
                key={selected.id}
                skill={selected.id}
                onDirty={setTemplateDirty}
              />
            )}
            {kind === "skills" &&
              !/^executor: test_execution$/m.test(content) && (
                <label>
                  运行模型
                  <select
                    disabled={busy || (selected.builtin && !copy)}
                    value={(
                      content.match(/^model: (.*)$/m)?.[1] || "null"
                    ).replace(/^["']|["']$/g, "")}
                    onChange={(e) =>
                      setContent(
                        content.replace(
                          /^model:.*$/m,
                          `model: ${e.target.value}`,
                        ),
                      )
                    }
                  >
                    <option value="null">使用助手默认模型</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

            <button
              className="secondary"
              disabled={busy || copy}
              onClick={() => {
                const next = selected.id + "_custom";
                setCopy(true);
                setIdentity(next);
                setContent(content.replace(/^id:.*$/m, `id: ${next}`));
              }}
            >
              创建自定义副本
            </button>
            {copy && (
              <label>
                副本标识
                <input
                  value={identity}
                  onChange={(e) => {
                    setIdentity(e.target.value);
                    setContent(
                      content.replace(/^id:.*$/m, `id: ${e.target.value}`),
                    );
                  }}
                />
              </label>
            )}
            <label>
              配置内容
              <textarea
                aria-label="配置内容"
                rows={16}
                readOnly={busy || (selected.builtin && !copy)}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
            <p className="muted">
              技能模型由 model 指定配置标识，null
              表示使用助手默认模型。修改工作要求时保留文件头的稳定标识和契约。
            </p>
            <button
              className="primary"
              disabled={busy || (selected.builtin && !copy)}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const saved = await request<Entry>(
                    `/configuration/${kind}/${encodeURIComponent(identity)}`,
                    {
                      method: "PUT",
                      body: JSON.stringify({
                        content,
                        revision: copy ? undefined : selected.revision,
                        copyFrom: copy ? selected.id : undefined,
                      }),
                    },
                  );
                  setSelected(saved);
                  setContent(saved.content);
                  setCopy(false);
                  setItems((old) => [
                    ...old.filter((i) => i.id !== saved.id),
                    saved,
                  ]);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在保存…" : "保存配置"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
