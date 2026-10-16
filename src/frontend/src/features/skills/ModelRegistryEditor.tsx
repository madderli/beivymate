import ModelCapabilityCalibration from "./ModelCapabilityCalibration";
import { modelFacts, syncCapabilityFields } from "./model-capabilities";
import { useState } from "react";
import { Dialog } from "../../components";
import { configuredModels, type ConfiguredModel } from "./skill-state";
import { RequiredLabel } from "./ModelSourceDialog";
export const registryTier = (
  m: ConfiguredModel,
): NonNullable<ConfiguredModel["registryTier"]> =>
  m.registryTier ||
  ({ 质量优先: "旗舰", 均衡: "均衡", 速度优先: "快速" } as const)[
    m.orientation
  ];
export default function ModelRegistryEditor({
  initial,
  close,
  save,
}: {
  initial: ConfiguredModel;
  close: () => void;
  save: (m: ConfiguredModel) => void;
}) {
  const [draft, setDraft] = useState<ConfiguredModel>({
    ...initial,
    registryCapabilities: modelFacts(initial),
    providedCapabilities: initial.providedCapabilities || modelFacts(initial),
    capabilitySource:
      initial.capabilitySource ||
      (configuredModels.some((m) => m.id === initial.id)
        ? "provider"
        : "unknown"),
  });
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState("");
  const patch = (p: Partial<ConfiguredModel>) => setDraft({ ...draft, ...p });
  const existing = configuredModels.some((m) => m.id === initial.id);
  const caps = modelFacts(draft);
  return (
    <>
      <Dialog
        className="mr-dialog mr-model-dialog"
        title={existing ? "编辑模型" : "添加模型"}
        close={close}
      >
        <div className="mr-dialog-body sc-form">
          <div className="sc-two-col">
            <label>
              <RequiredLabel>模型 ID</RequiredLabel>
              <input
                required
                aria-label="模型 ID"
                placeholder="vendor/model-name"
                value={draft.identifier}
                onChange={(e) => patch({ identifier: e.target.value })}
              />
            </label>
            <label>
              <span className="mr-field-label">显示名</span>
              <input
                aria-label="显示名"
                placeholder="面向用户的名称"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
          </div>
          <label>
            <span className="mr-field-label">来源标注</span>
            <input
              aria-label="来源标注"
              placeholder="如：微调自 qwen2.5-7b / 内部部署 v2"
              value={draft.lineage || ""}
              onChange={(e) => patch({ lineage: e.target.value })}
            />
            <small>用于补充发现接口无法提供的模型来源与版本信息</small>
          </label>
          <section className="mr-capability-facts">
            <header>
              <strong>模型能力</strong>
              <span>
                {draft.capabilitySource === "calibrated"
                  ? `已校准 · ${draft.calibrations?.length || 0} 次`
                  : draft.capabilitySource === "provider"
                    ? "来自模型提供方（演示）"
                    : "待确认"}
              </span>
              <button
                type="button"
                className="sc-secondary"
                onClick={() => setCalibrating(true)}
              >
                校准
              </button>
            </header>
            <div className="mr-pills">
              {caps.length ? (
                caps.map((c) => <span key={c}>{c}</span>)
              ) : (
                <small>模型未提供能力信息，可通过校准补充。</small>
              )}
            </div>
            <small>
              {draft.capabilitySource === "calibrated"
                ? "当前展示最近一次校准结果，可再次校准。"
                : "默认带入提供方的能力信息；发现不准确时可校准。"}
            </small>
          </section>
          <div className="sc-two-col">
            <label>
              <span className="mr-field-label">上下文窗口（K）</span>
              <input
                type="number"
                min="1"
                aria-label="上下文窗口（K）"
                value={draft.contextK ?? 32}
                onChange={(e) => patch({ contextK: Number(e.target.value) })}
              />
            </label>
            <label>
              <span className="mr-field-label">推荐档位</span>
              <select
                aria-label="推荐档位"
                value={registryTier(draft)}
                onChange={(e) =>
                  patch({
                    registryTier: e.target
                      .value as ConfiguredModel["registryTier"],
                  })
                }
              >
                {["旗舰", "均衡", "快速", "不指定"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="ms-capabilities">
            <legend>计费方式</legend>
            {["按量计费", "内部免费"].map((b) => (
              <label className="ms-checkbox" key={b}>
                <input
                  type="radio"
                  name="registryBilling"
                  checked={
                    (draft.pricing === "免费" ? "内部免费" : "按量计费") === b
                  }
                  onChange={() =>
                    patch({ pricing: b === "内部免费" ? "免费" : "付费" })
                  }
                />
                {b}
              </label>
            ))}
          </fieldset>
          {draft.pricing !== "免费" && (
            <fieldset className="mr-choice-field">
              <legend>单价（示例 / 千 tokens）</legend>
              <div className="sc-two-col">
                <input
                  aria-label="输入单价"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="输入单价"
                  value={draft.inputPrice ?? ""}
                  onChange={(e) =>
                    patch({ inputPrice: Number(e.target.value) })
                  }
                />
                <input
                  aria-label="输出单价"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="输出单价"
                  value={draft.outputPrice ?? ""}
                  onChange={(e) =>
                    patch({ outputPrice: Number(e.target.value) })
                  }
                />
              </div>
            </fieldset>
          )}
          {error && (
            <div className="sc-warning" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="mr-footer">
          <button onClick={close}>取消</button>
          <button
            className="ad-primary"
            onClick={() => {
              const identifier = draft.identifier.trim();
              if (!identifier) {
                setError("请输入模型 ID");
                return;
              }
              if (
                configuredModels.some(
                  (m) => m.id !== draft.id && m.identifier === identifier,
                )
              ) {
                setError("模型 ID 已存在，请使用唯一 ID");
                return;
              }
              if (
                (draft.contextK ?? 32) < 1 ||
                (draft.inputPrice ?? 0) < 0 ||
                (draft.outputPrice ?? 0) < 0
              ) {
                setError("上下文窗口须大于零，单价不能为负数");
                return;
              }
              const tier = registryTier(draft);
              save(
                syncCapabilityFields({
                  ...draft,
                  identifier,
                  name: draft.name.trim() || identifier,
                  registryTier: tier,
                  orientation:
                    tier === "旗舰"
                      ? "质量优先"
                      : tier === "快速"
                        ? "速度优先"
                        : "均衡",
                  contextK: draft.contextK,
                  inputPrice:
                    draft.pricing === "免费" ? 0 : draft.inputPrice || 0,
                  outputPrice:
                    draft.pricing === "免费" ? 0 : draft.outputPrice || 0,
                }),
              );
            }}
          >
            保存模型
          </button>
        </footer>
      </Dialog>
      {calibrating && (
        <ModelCapabilityCalibration
          model={draft}
          close={() => setCalibrating(false)}
          apply={(m) => {
            setDraft(m);
            setCalibrating(false);
          }}
        />
      )}
    </>
  );
}
