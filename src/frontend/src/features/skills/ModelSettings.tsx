import ModelCacheMigration from "./ModelCacheMigration";
import { request } from "../../api";
import {
  loadModelLibrary,
  saveModelLibrary,
  type Catalog,
} from "./model-api";
import ModelDefaults from "./ModelDefaults";
import ModelFailover from "./ModelFailover";
import ModelLibrary from "./ModelLibrary";
import { useEffect, useState } from "react";
import "../../preview/model-settings.css";
export default function ModelSettings({
  changed,
  active = true,
}: {
  changed: () => void;
  active?: boolean;
}) {
  const [tab, setTab] = useState("defaults");
  const [doc, setDoc] = useState<Catalog>();
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<{
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costs: Record<string, number>;
    unknownCostCalls: number;
    byTier?: Record<string, number>;
  }>();
  const [saving, setSaving] = useState(false);
  async function reload() {
    setDoc(await loadModelLibrary());
  }
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (tab === "cost")
      void request<typeof usage>("/models/usage")
        .then(setUsage)
        .catch((e) => setError(e.message));
  }, [tab]);
  async function save(next: Catalog) {
    setError("");
    const saved = await saveModelLibrary(next);
    setDoc(saved);
    changed();
    return saved;
  }
  const budget = doc?.budget || 0,
    budgetAlert = doc?.budgetAlert ?? true;
  const setBudget = (budget: number) => {
    if (doc) setDoc({ ...doc, budget });
  };
  const setBudgetAlert = (budgetAlert: boolean) => {
    if (doc) setDoc({ ...doc, budgetAlert });
  };
  const total = usage?.costs.CNY || 0;
  return (
    <main className="ms-page homepage-main">
      <div className="sc-page-heading homepage-heading">
        <div>
          <span className="ad-kicker">MODEL SETTINGS</span>
          <h1>模型配置</h1>
          <p>添加可用模型，为对话与技能设置默认选择。</p>
        </div>
        <div className="ms-title-stats" aria-label="模型统计">
          <div>
            <span>已接入厂商</span>
            <b>{doc?.services.length ?? 0}</b>
          </div>
          <div>
            <span>已添加模型</span>
            <b>{doc?.models.length ?? 0}</b>
          </div>
          <div>
            <span>已启动模型</span>
            <b>
              {doc?.models.filter(
                (m) =>
                  m.enabled &&
                  !m.unavailableReason &&
                  doc.services.some((s) => s.id === m.serviceId && s.enabled),
              ).length ?? 0}
            </b>
          </div>
        </div>
      </div>
      <div className="ms-layout">
        <section className="ms-content">
          <div className="ms-tabs">
            {[
              ["defaults", "默认模型配置"],
              ["models", "模型管理"],
              ["cost", "成本控制"],
              ["advanced", "高级配置"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => {
                  setTab(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <div className="sc-warning" role="alert">
              {error}
              <button
                onClick={() => void reload().catch((e) => setError(e.message))}
              >
                重新加载
              </button>
            </div>
          )}
          {!doc && <p>正在读取模型配置…</p>}
          {tab === "defaults" && doc && <ModelDefaults doc={doc} save={save} />}
          {tab === "models" && doc && (
            <>
              <ModelCacheMigration doc={doc} save={save} />
              <ModelLibrary
                doc={doc}
                save={save}
                reload={reload}
                active={active}
              />
            </>
          )}
          {tab === "cost" && doc && (
            <>
              <div className="ms-panel-intro">
                <p>设置预算提醒并了解各档位的本月用量</p>
                <small>实际调用统计</small>
              </div>
              <section className="mc-card">
                <div className="mc-grid">
                  <div>
                    <label className="sc-form">
                      月度预算（CNY）
                      <div className="mc-budget">
                        <input
                          aria-label="月度预算"
                          type="number"
                          min="0"
                          value={budget}
                          onChange={(e) =>
                            setBudget(Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                        <span>元</span>
                      </div>
                    </label>
                    <div className="mc-alert">
                      <div>
                        <strong>超额提醒</strong>
                        <small>接近或超过预算时提醒</small>
                      </div>
                      <button
                        role="switch"
                        aria-label="超额提醒"
                        aria-checked={budgetAlert}
                        className="mr-switch"
                        onClick={() => setBudgetAlert(!budgetAlert)}
                      >
                        <i />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4>本月用量</h4>
                    <div className="mc-bars">
                      {[
                        ["质量优先", usage?.byTier?.["质量优先"] || 0],
                        ["均衡", usage?.byTier?.["均衡"] || 0],
                        ["速度优先", usage?.byTier?.["速度优先"] || 0],
                      ].map(([label, value]) => (
                        <div className="mc-usage" key={label}>
                          <b>{label}</b>
                          <div className="mc-track">
                            <span
                              style={{
                                width: `${(Number(value) / Math.max(total, 1)) * 100}%`,
                              }}
                            />
                          </div>
                          <span>¥{Number(value).toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                    <p>
                      本月合计 ¥{total.toFixed(4)} · {usage?.calls || 0} 次调用
                    </p>
                    {Object.entries(usage?.costs || {})
                      .filter(([currency]) => currency !== "CNY")
                      .map(([currency, value]) => (
                        <p key={currency}>
                          {currency} {value.toFixed(4)}
                        </p>
                      ))}
                    <small>
                      按当前模型档位汇总人民币估算费用，价格为每千
                      Token；缺少用量或价格时费用未知。
                    </small>
                    <p>费用未知的调用：{usage?.unknownCostCalls || 0}</p>
                    {!Object.keys(usage?.costs || {}).length && (
                      <p>暂无可计算费用</p>
                    )}
                    {budgetAlert && budget > 0 && total >= budget && (
                      <div className="sc-warning" role="status">
                        本月费用已达到预算提醒值，不会自动中断任务。
                      </div>
                    )}
                  </div>
                </div>
                <div className="ms-budget-actions">
                <button
                  className="ad-primary"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await save(doc);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "保存中…" : "保存设置"}
                </button>
                </div>
              </section>
            </>
          )}
          {tab === "advanced" && doc && (
            <>
              <ModelFailover key={doc.revision} doc={doc} save={save} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
