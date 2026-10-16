import { useState } from "react";
import { Dialog } from "../../components";
import type { ConfiguredModel } from "./skill-state";
import {
  capabilityGroups,
  modelFacts,
  contextCapability,
} from "./model-capabilities";
export default function ModelCapabilityCalibration({
  model,
  close,
  apply,
}: {
  model: ConfiguredModel;
  close: () => void;
  apply: (m: ConfiguredModel) => void;
}) {
  const [selected, setSelected] = useState(modelFacts(model));
  const [context, setContext] = useState<number | undefined>(model.contextK);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const facts = [
    ...selected.filter((c) => !c.endsWith("上下文")),
    contextCapability(context),
  ].filter(Boolean);
  return (
    <Dialog
      className="mr-dialog mr-calibration-dialog"
      title="校准模型能力"
      close={close}
    >
      <p className="mr-lead">
        {model.name || model.identifier} ·
        请根据厂商文档或实际验证结果确认能力。
      </p>
      <div className="mr-dialog-body sc-form">
        <div className="mr-capability-groups">
          {capabilityGroups.map((group) => (
            <fieldset key={group.name} className="mr-choice-field">
              <legend>{group.name}</legend>
              <div className="mr-capability-options">
                {group.items.map((c) => (
                  <label key={c}>
                    <input
                      type={group.name === "上下文" ? "radio" : "checkbox"}
                      name={
                        group.name === "上下文"
                          ? "calibration-context"
                          : undefined
                      }
                      checked={facts.includes(c)}
                      onChange={(e) => {
                        if (group.name === "上下文")
                          setContext(
                            c === "1M上下文"
                              ? 1000
                              : c === "128K上下文"
                                ? 128
                                : 32,
                          );
                        else
                          setSelected(
                            e.target.checked
                              ? [...selected, c]
                              : selected.filter((x) => x !== c),
                          );
                      }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="sc-two-col">
          <label>
            精确上下文窗口（K）
            <input
              aria-label="校准上下文窗口"
              type="number"
              min="1"
              value={context ?? ""}
              placeholder="未提供"
              onChange={(e) =>
                setContext(e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
          <label>
            校准依据
            <input
              aria-label="校准依据"
              value={note}
              placeholder="例如：厂商文档或测试结论（选填）"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <small>
          上下文按最大支持值记录。确认后返回模型编辑页，保存模型后生效。
        </small>
        {!!model.calibrations?.length && (
          <details className="mr-calibration-history">
            <summary>历史校准（{model.calibrations.length} 次）</summary>
            {[...model.calibrations].reverse().map((r, i) => (
              <article key={`${r.at}-${i}`}>
                <strong>
                  第 {model.calibrations!.length - i} 次 ·{" "}
                  {new Date(r.at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </strong>
                <p>{r.after.join("、") || "暂无已确认能力"}</p>
                {r.note && <small>{r.note}</small>}
              </article>
            ))}
          </details>
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
            if (
              context !== undefined &&
              (!Number.isFinite(context) || context < 1)
            ) {
              setError("上下文窗口须大于零");
              return;
            }
            apply({
              ...model,
              registryCapabilities: facts,
              contextK: context,
              capabilitySource: "calibrated",
              calibrations: [
                ...(model.calibrations || []),
                {
                  at: new Date().toISOString(),
                  before: modelFacts(model),
                  after: facts,
                  contextK: context,
                  note: note.trim(),
                },
              ],
            });
          }}
        >
          确认校准
        </button>
      </footer>
    </Dialog>
  );
}
