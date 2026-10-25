import { useState } from "react";
import type { Catalog } from "./model-api";
import "./model-defaults.css";
export default function ModelDefaults({
  doc,
  save,
}: {
  doc: Catalog;
  save: (next: Catalog) => Promise<Catalog>;
}) {
  const [draft, setDraft] = useState({
    ...doc.defaults,
    chat: doc.defaults.chat || doc.defaults.general,
    skill: doc.defaults.skill || doc.defaults.general,
  });
  const [custom, setCustom] = useState(
    !!(doc.defaults.chat || doc.defaults.skill),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function choice(key: "general" | "chat" | "skill", title: string) {
    return (
      <label>
        {title}
        <select
          aria-label={title}
          disabled={busy || (key === "general" ? custom : !custom)}
          value={key !== "general" && !custom ? draft.general : draft[key]}
          onChange={(e) => {
            setDraft({ ...draft, [key]: e.target.value });
            setNotice("");
          }}
        >
          <option value="">
            请选择模型
          </option>
          {draft[key].startsWith("missing:") && (
            <option value={draft[key]}>模型缺失，请重新选择</option>
          )}
          {doc.services.map((s) => (
            <optgroup key={s.id} label={s.name}>
              {doc.models
                .filter((m) => m.serviceId === s.id)
                .map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    disabled={
                      !!m.unavailableReason ||
                      !m.enabled ||
                      !s.enabled ||
                      !s.configured ||
                      !m.capabilities.includes("text")
                    }
                  >
                    {m.name}
                    {!!m.unavailableReason ||
                    !m.enabled ||
                    !s.enabled ||
                    !s.configured ||
                    !m.capabilities.includes("text")
                      ? "（不可用）"
                      : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
    );
  }
  return (
    <section className="model-defaults" aria-label="默认模型设置">
      <h2>默认模型配置</h2>
      <p>统一设置常用模型，使用更方便，调整也更简单。</p>
      <fieldset className="model-defaults-modes">
        <legend>使用方式</legend>
        <label className={!custom ? "selected" : ""}>
          <input type="radio" name="default-model-mode" checked={!custom} disabled={busy}
            onChange={() => { setCustom(false); setError(""); setNotice(""); }} />
          <span><b>统一使用一个模型</b><small>对话和技能使用同一个默认模型，只需维护一处。</small></span>
        </label>
        <label className={custom ? "selected" : ""}>
          <input type="radio" name="default-model-mode" checked={custom} disabled={busy}
            onChange={() => {
              setDraft((current) => ({ ...current, chat: current.chat || current.general, skill: current.skill || current.general }));
              setCustom(true);
              setError("");
              setNotice("");
            }} />
          <span><b>分别设置模型</b><small>为对话和技能各选一个默认模型。</small></span>
        </label>
      </fieldset>
      <div className="model-defaults-main">
        {choice("general", "通用默认模型")}
        <small>{custom ? "当前使用分别设置，此项不生效。" : "修改此项，对话和技能的默认模型一起更新。"}</small>
      </div>
      <div className="model-defaults-row">
        {choice("chat", "默认对话模型")}
        {choice("skill", "默认技能模型")}
      </div>
      <small>{custom ? "两项都需选择，保存后生效。" : "当前统一使用上方模型，无需分别设置。"}</small>
      <div className="model-defaults-footer">
        <small>
          保存后，新的对话和技能调用将使用这些默认设置；单独选过模型的仍用原设置。
        </small>
        <button
          className="ad-primary"
          disabled={busy}
          onClick={async () => {
            if (custom ? !draft.chat || !draft.skill : !draft.general) {
              setError(custom ? "请分别选择默认对话模型和默认技能模型" : "请选择通用默认模型");
              return;
            }
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await save({
                ...doc,
                defaults: {
                  ...draft,
                  general: custom ? "" : draft.general,
                  chat: custom ? draft.chat : "",
                  skill: custom ? draft.skill : "",
                },
              });
              setNotice("默认设置已保存");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "保存中…" : "保存设置"}
        </button>
      </div>
      {error && (
        <p className="sc-warning" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sc-success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
