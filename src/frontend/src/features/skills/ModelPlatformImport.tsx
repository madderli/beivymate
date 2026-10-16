import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components";
import { modelServices, type ModelService } from "./skill-state";
import { createService } from "./ModelSourceDialog";
export default function ModelPlatformImport({
  close,
  save,
}: {
  close: () => void;
  save: (s: ModelService, ids: string[]) => void;
}) {
  const [platform, setPlatform] = useState("OpenRouter");
  const [secret, setSecret] = useState("");
  const [search, setSearch] = useState("");
  const [synced, setSynced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const models = (p: string) =>
    [
      "novamind-pro",
      "novamind-chat",
      "novamind-lite",
      "vision-one",
      "coder-plus",
      "reasoner-mini",
    ].map(
      (id) =>
        `${p === "HuggingFace" ? "hf" : p === "OpenRouter" ? "router" : "hub"}/${id}`,
    );
  const catalog = models(platform);
  return (
    <Dialog className="mr-dialog" title="从平台导入" close={close}>
      <p className="mr-lead">同步平台模型目录并选择要注册的模型</p>
      <div className="mr-dialog-body sc-form">
        <fieldset className="mr-choice-field">
          <legend>平台</legend>
          <div className="mr-type-cards mr-platforms">
            {["OpenRouter", "HuggingFace", "其他聚合平台"].map((p) => (
              <label key={p} className={platform === p ? "selected" : ""}>
                <input
                  type="radio"
                  name="platform"
                  disabled={busy}
                  checked={platform === p}
                  onChange={() => {
                    setPlatform(p);
                    setSearch("");
                    setSelected(synced ? models(p).slice(0, 3) : []);
                  }}
                />
                <b>{p}</b>
                <small>
                  {p === "HuggingFace"
                    ? "模型平台"
                    : p === "OpenRouter"
                      ? "聚合平台"
                      : "自定义目录"}
                </small>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mr-import-sync">
          <label>
            <span className="mr-field-label">Key / Token</span>
            <input
              type="password"
              autoComplete="off"
              aria-label="Key / Token"
              value={secret}
              placeholder="输入平台凭证"
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <button
            className="ad-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              timer.current = setTimeout(() => {
                setSynced(true);
                setSelected(catalog.slice(0, 3));
                setBusy(false);
              }, 700);
            }}
          >
            {busy ? "同步中…" : synced ? "重新同步" : "同步目录"}
          </button>
        </div>
        {synced && (
          <>
            <input
              aria-label="搜索平台模型"
              placeholder="搜索模型 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mr-discovered">
              {catalog
                .filter((id) => id.toLowerCase().includes(search.toLowerCase()))
                .map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, id]
                            : selected.filter((x) => x !== id),
                        )
                      }
                    />
                    <code>{id}</code>
                    <small>示例</small>
                  </label>
                ))}
            </div>
          </>
        )}
      </div>
      <footer className="mr-footer">
        <button onClick={close}>取消</button>
        <button
          className="ad-primary"
          disabled={!synced || !selected.length || busy}
          onClick={() => {
            const existing = modelServices.find((s) => s.name === platform);
            save(
              existing || {
                ...createService(),
                name: platform,
                kind: platform === "HuggingFace" ? "模型平台" : "聚合平台",
                endpoint: "平台目录同步",
                protocol:
                  platform === "HuggingFace" ? "自定义适配器" : "OpenAI 兼容",
                auth: platform === "HuggingFace" ? "Token" : "API Key",
                configured: !!secret.trim(),
              },
              selected,
            );
          }}
        >
          导入选中
        </button>
      </footer>
    </Dialog>
  );
}
