import { useEffect, useState } from "react";
import { request } from "./api";
import { loadModelLibrary, type Catalog } from "./features/skills/model-api";
export default function ChatModelPicker({
  context,
  busy,
  ready,
  onError,
  configure,
}: {
  context: string;
  busy: boolean;
  ready: (value: boolean) => void;
  onError: (error: string) => void;
  configure: () => void;
}) {
  const [doc, setDoc] = useState<Catalog>();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [catalog, preference] = await Promise.all([
          loadModelLibrary(),
          request<{ model: string }>(
            `/conversations/${encodeURIComponent(context)}/model`,
          ),
        ]);
        if (active) {
          setDoc(catalog);
          setSelected(preference.model);
          const id =
            preference.model ||
            catalog.defaults.chat ||
            catalog.defaults.general;
          const m = catalog.models.find((m) => m.id === id);
          ready(
            !!m?.enabled &&
              !m.unavailableReason &&
              !!catalog.services.find(
                (s) => s.id === m.serviceId && s.enabled && s.configured,
              ),
          );
        }
      } catch (e) {
        if (active) {
          ready(false);
          onError((e as Error).message);
        }
      }
    };
    void load();
    window.addEventListener("focus", load);
    window.addEventListener("beivymate-models-changed", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      window.removeEventListener("beivymate-models-changed", load);
    };
  }, [context]);
  const defaultId = doc?.defaults.chat || doc?.defaults.general;
  const defaultName = doc?.models.find((m) => m.id === defaultId)?.name;
  return (
    <label className="chat-model-choice">
      对话模型
      <details className="chat-model-filter">
        <summary>筛选</summary>
        <input
          aria-label="搜索对话模型"
          placeholder="搜索模型或厂商"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </details>
      <select
        aria-label="对话模型"
        value={selected}
        disabled={busy || saving || !doc}
        onChange={async (e) => {
          const value = e.target.value;
          setSaving(true);
          try {
            await request(
              `/conversations/${encodeURIComponent(context)}/model`,
              { method: "PUT", body: JSON.stringify({ model: value }) },
            );
            setSelected(value);
            const id = value || defaultId;
            const m = doc?.models.find((m) => m.id === id);
            ready(
              !!m?.enabled &&
                !m.unavailableReason &&
                !!doc?.services.find(
                  (s) => s.id === m.serviceId && s.enabled && s.configured,
                ),
            );
            onError("");
          } catch (e) {
            onError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="">
          跟随默认{defaultName ? `：${defaultName}` : "（未配置）"}
        </option>
        {doc?.services.map((s) => (
          <optgroup key={s.id} label={s.name}>
            {doc.models
              .filter(
                (m) =>
                  m.serviceId === s.id &&
                  (m.id === selected ||
                    `${m.name} ${m.identifier} ${s.name}`
                      .toLowerCase()
                      .includes(query.toLowerCase())),
              )
              .map((m) => (
                <option
                  key={m.id}
                  value={m.id}
                  disabled={
                    !m.enabled ||
                    !!m.unavailableReason ||
                    !s.enabled ||
                    !s.configured
                  }
                >
                  {m.name}
                  {m.capabilities.includes("structured") ? " · 结构化" : ""}
                  {m.capabilities.includes("images") ? " · 图片声明" : ""}
                  {m.capabilities.includes("tools") ? " · 工具声明" : ""}
                  {!s.enabled
                    ? "（厂商已停用）"
                    : !m.enabled
                      ? "（模型已停用）"
                      : !s.configured
                        ? "（凭据不可用）"
                        : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {(!defaultName || !doc?.models.length) && (
        <button type="button" onClick={configure}>
          配置模型
        </button>
      )}
    </label>
  );
}
