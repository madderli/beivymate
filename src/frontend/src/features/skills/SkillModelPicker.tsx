import { useState } from "react";
import {
  tiers,
  tierModels,
  backupModels,
  configuredModels,
  defaultModelId,
  isModelEnabled,
  type ModelPreference,
} from "./skill-state";
import {
  capabilityGroups,
  modelFacts,
  matchesCapabilities,
} from "./model-capabilities";
export default function SkillModelPicker({
  value,
  readOnly,
  onChange,
}: {
  value: ModelPreference;
  readOnly: boolean;
  onChange: (p: ModelPreference) => void;
}) {
  const [filters, setFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const selectedId =
    value.mode === "tier"
      ? tierModels[value.tier || "均衡"]
      : value.mode === "inherit"
        ? defaultModelId
        : value.model;
  const selected = configuredModels.find((m) => m.id === selectedId);
  const available = configuredModels.filter(
    (m) => isModelEnabled(m) && m.connection !== "连接失败",
  );
  const candidates = available.filter(
    (m) =>
      matchesCapabilities(m, filters) &&
      `${m.name} ${m.provider} ${m.identifier}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const tierCandidates = tiers.filter((t) =>
    candidates.some((m) => m.id === tierModels[t]),
  );
  const change = (p: Partial<ModelPreference>) =>
    onChange({ ...value, ...p, capabilities: [], minTier: undefined });
  return (
    <div className="sc-model-fields">
      <label>
        模型选择
        <select
          aria-label="模型选择"
          disabled={readOnly}
          value={value.mode}
          onChange={(e) => {
            const mode = e.target.value as ModelPreference["mode"];
            change({
              mode,
              tier: value.tier || "均衡",
              model: mode === "specific" ? selected?.id || "" : "",
            });
          }}
        >
          <option value="tier">按档位选择（推荐）</option>
          <option value="specific">直接选择模型</option>
          {value.mode === "inherit" && (
            <option value="inherit">跟随用户默认模型</option>
          )}
          <option value="none">不使用模型（纯脚本技能）</option>
        </select>
      </label>
      {value.mode !== "none" && (
        <>
          {!readOnly && (
            <details
              className="sc-model-filter"
              open={filters.length > 0 || undefined}
            >
              <summary>
                按模型能力筛选{filters.length ? `（${filters.length}）` : ""}
              </summary>
              <p>
                同时满足所选能力的模型会出现在候选列表中；筛选条件不保存为技能要求。
              </p>
              <div className="mr-capability-groups">
                {capabilityGroups.map((g) => (
                  <fieldset key={g.name}>
                    <legend>{g.name}</legend>
                    <div className="mr-capability-options">
                      {g.items.map((c) => (
                        <label key={c}>
                          <input
                            type="checkbox"
                            checked={filters.includes(c)}
                            onChange={(e) =>
                              setFilters(
                                e.target.checked
                                  ? [...filters, c]
                                  : filters.filter((x) => x !== c),
                              )
                            }
                          />
                          {c}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              {filters.length > 0 && (
                <button type="button" onClick={() => setFilters([])}>
                  清空筛选
                </button>
              )}
            </details>
          )}
          {value.mode === "tier" && (
            <label>
              推荐档位
              <select
                aria-label="推荐档位"
                disabled={readOnly}
                value={value.tier || "均衡"}
                onChange={(e) =>
                  change({ tier: e.target.value as ModelPreference["tier"] })
                }
              >
                {!tierCandidates.includes(value.tier || "均衡") && (
                  <option value={value.tier || "均衡"} disabled>
                    {value.tier || "均衡"}（当前主模型不可用或不符合筛选）
                  </option>
                )}
                {tierCandidates.map((t) => (
                  <option key={t} value={t}>
                    {t} ·{" "}
                    {configuredModels.find((m) => m.id === tierModels[t])?.name}
                  </option>
                ))}
              </select>
              <small>
                按当前主模型能力筛选档位。主模型与备用顺序跟随全局设置。
              </small>
            </label>
          )}
          {value.mode === "specific" && (
            <>
              {!readOnly && (
                <input
                  aria-label="搜索候选模型"
                  placeholder="搜索模型名称、标识或厂商"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              <label>
                推荐模型
                <select
                  aria-label="推荐模型"
                  disabled={readOnly}
                  value={value.model}
                  onChange={(e) => change({ model: e.target.value })}
                >
                  <option value="" disabled>
                    请选择模型
                  </option>
                  {!candidates.some((m) => m.id === value.model) &&
                    value.model && (
                      <option value={value.model} disabled>
                        {selected?.name || "原模型已删除"}（不可用或不符合筛选）
                      </option>
                    )}
                  {candidates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.provider} / {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {!readOnly &&
            (value.mode === "tier"
              ? !tierCandidates.length
              : !candidates.length) && (
              <div className="sc-warning">
                没有符合条件的{value.mode === "tier" ? "档位主模型" : "模型"}
                ，请调整筛选或前往模型管理配置。
              </div>
            )}
          <section className="sc-selected-model" aria-label="已选模型能力">
            <strong>
              {value.mode === "tier" ? "当前档位主模型" : "当前选择"}：
              {selected?.name || "尚未选择可用模型"}
            </strong>
            {selected && (
              <>
                <small>
                  {selected.provider} · {selected.identifier}
                  {value.mode === "tier"
                    ? ` · ${backupModels[value.tier || "均衡"].length} 个备用模型`
                    : ""}
                </small>
                {!isModelEnabled(selected) && (
                  <p className="sc-warning">该模型当前不可用，请重新选择。</p>
                )}
                <div className="mr-pills">
                  {modelFacts(selected).length ? (
                    modelFacts(selected).map((c) => <span key={c}>{c}</span>)
                  ) : (
                    <small>尚未提供能力信息</small>
                  )}
                </div>
                <small>
                  {selected.capabilitySource === "calibrated"
                    ? "能力来源：最近一次校准"
                    : selected.capabilitySource === "unknown"
                      ? "能力信息待确认"
                      : "能力来源：模型提供方（演示数据）"}
                </small>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
