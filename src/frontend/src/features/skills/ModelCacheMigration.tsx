import { useState } from "react";
import { Dialog } from "../../components";
import { type Catalog, modelPayload, servicePayload } from "./model-api";
import type { ModelService, ConfiguredModel } from "./skill-state";
export default function ModelCacheMigration({
  doc,
  save,
}: {
  doc: Catalog;
  save: (next: Catalog) => Promise<Catalog>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [legacy] = useState(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("beivymate.ui.v1.models") || "null",
      );
      if (!Array.isArray(value?.services) || !Array.isArray(value?.models))
        return undefined;
      const services: ModelService[] = value.services.filter(
        (s: ModelService) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.endpoint === "string" &&
          !/演示|示例/.test(s.name) &&
          !s.endpoint.includes(".invalid") &&
          /^https?:\/\//.test(s.endpoint) &&
          [
            "OpenAI 兼容",
            "兼容对话接口",
            "openai_compatible",
            "Ollama",
            "ollama",
            "本地模型接口",
          ].includes(s.protocol) &&
          [
            "API Key",
            "Token",
            "访问密钥",
            "无",
            "无需鉴权",
            "none",
            "key",
          ].includes(s.auth),
      );
      const models: ConfiguredModel[] = value.models.filter(
        (m: ConfiguredModel) =>
          m &&
          typeof m.id === "string" &&
          typeof m.name === "string" &&
          typeof m.identifier === "string" &&
          !/演示|示例/.test(m.name) &&
          services.some((s) => s.id === m.serviceId),
      );
      return models.length
        ? {
            services: services.filter((s) =>
              models.some((m) => m.serviceId === s.id),
            ),
            models,
          }
        : undefined;
    } catch {
      return undefined;
    }
  });
  const candidates =
    legacy?.models.filter((m) => !doc.models.some((x) => x.id === m.id)) || [];
  if (!candidates.length) return null;
  return (
    <>
      <button className="sc-secondary" onClick={() => setOpen(true)}>
        导入旧浏览器配置
      </button>
      {open && (
        <Dialog
          className="mr-dialog"
          title="导入旧模型配置"
          close={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="mr-dialog-body sc-form">
            <p>
              仅导入已识别的非示例连接和模型。同标识不覆盖现有配置。浏览器原记录保留；密钥需重新填写，默认模型、主备和预算请在本页重新确认。
            </p>
            <div className="mr-review">
              {candidates.map((m) => (
                <div className="mr-review-row" key={m.id}>
                  <strong>{m.name}</strong>
                  <code>{m.identifier}</code>
                </div>
              ))}
            </div>
            {error && (
              <p className="sc-warning" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="mr-footer">
            <button disabled={busy} onClick={() => setOpen(false)}>
              取消
            </button>
            <button
              className="ad-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  for (const source of legacy!.services) {
                    if (!candidates.some((m) => m.serviceId === source.id))
                      continue;
                    const existing = doc.services.find(
                      (s) => s.id === source.id,
                    );
                    const incoming = servicePayload({
                      ...source,
                      protocol:
                        source.protocol === "本地模型接口"
                          ? "Ollama"
                          : source.protocol,
                    });
                    if (
                      existing &&
                      (existing.endpoint.replace(/\/$/, "") !==
                        incoming.endpoint.replace(/\/$/, "") ||
                        existing.protocol !== incoming.protocol ||
                        existing.auth !== incoming.auth)
                    )
                      throw Error(
                        `来源标识 ${source.id} 与现有连接冲突，请手动添加，未覆盖原配置。`,
                      );
                  }
                  const needed = legacy!.services.filter(
                    (s) =>
                      candidates.some((m) => m.serviceId === s.id) &&
                      !doc.services.some((x) => x.id === s.id),
                  );
                  await save({
                    ...doc,
                    services: [
                      ...doc.services,
                      ...needed.map((s) =>
                        servicePayload({
                          ...s,
                          protocol:
                            s.protocol === "本地模型接口"
                              ? "Ollama"
                              : s.protocol,
                        }),
                      ),
                    ],
                    models: [...doc.models, ...candidates.map(modelPayload)],
                  });
                  setOpen(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "导入中…" : "确认导入"}
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
