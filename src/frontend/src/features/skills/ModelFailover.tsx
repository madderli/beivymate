import { useState } from "react";
import { configuredModels, isModelEnabled } from "./skill-state";
import { tiers } from "./skill-state";
import { type Catalog } from "./model-api";
export default function ModelFailover({
  doc,
  save,
}: {
  doc: Catalog;
  save: (next: Catalog) => Promise<Catalog>;
}) {
  const [draft] = useState(() => structuredClone(doc));
  const tierModels = draft.tiers,
    backupModels = draft.backups,
    failover = draft.failover;
  const defaultModelId = draft.defaults.general;
  const setDefaultModelId = (id: string) => {
    draft.defaults.general = id;
  };
  const [timeoutText, setTimeoutText] = useState(String(failover.timeout));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, refresh] = useState(0);
  const [adding, setAdding] = useState("");
  const [candidate, setCandidate] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const update = () => {
    refresh((n) => n + 1);
  };
  const name = (id: string) =>
    !id ? "尚未配置" : configuredModels.find((m) => m.id === id)?.name || `${id}（已删除）`;
  const available = (id: string) => {
    const m = configuredModels.find((m) => m.id === id);
    return !!m && isModelEnabled(m) && m.connection !== "连接失败";
  };
  function simulate() {
    const lines: string[] = [];
    const startIndex = 0;
    const minIndex = tiers.length - 1;
    const failure = failover.triggers[0] || "server";
    const seen = new Set<string>();
    const primary = tierModels[tiers[startIndex]];
    lines.push(
      `① 验证档位顺序：${tiers.join(" → ")}；从${tiers[0]}主模型 ${name(primary)} 开始。`,
    );
    lines.push(
      `② 主模型失败（模拟）：${failure}；单次超时 ${failover.timeout} 秒`,
    );
    seen.add(primary);
    if (!failover.triggers.includes(failure)) {
      setLogs([
        ...lines,
        "返回错误：失败类型不在触发条件中，不进行重试或转移。",
      ]);
      return;
    }
    if (available(primary))
      for (let i = 1; i <= failover.retries; i++)
        lines.push(`③ 主模型重试 ${i}/${failover.retries}：失败（${failure}）`);
    else lines.push("③ 主模型不可用，跳过网络重试。");
    if (failover.strategy === "error") {
      setLogs([...lines, "返回错误：直接报错策略，重试后不查找备用模型。"]);
      return;
    }
    const end = failover.strategy === "cross" ? minIndex : startIndex;
    for (let t = startIndex; t <= end; t++) {
      const tier = tiers[t];
      if (t > startIndex) lines.push(`④ 同档顺序已用尽，下探到 ${tier}`);
      const chain =
        t === startIndex
          ? backupModels[tier]
          : [tierModels[tier], ...backupModels[tier]];
      for (const id of chain) {
        if (seen.has(id)) {
          lines.push(`跳过重复模型：${name(id)}`);
          continue;
        }
        seen.add(id);
        if (!available(id)) {
          lines.push(`跳过不可用模型：${name(id)}`);
          continue;
        }
        lines.push(`⑤ 按顺序调用 ${name(id)}（${tier}）`);
        setLogs([
          ...lines,
          `⑥ 成功返回（模拟）· ${t > startIndex ? "已跨档降级" : "已降级"} · 实际模型：${name(id)}`,
        ]);
        return;
      }
    }
    setLogs([
      ...lines,
      "⑦ 返回错误：当前策略下已无可用备用模型，保留上述失败原因。",
    ]);
  }
  return (
    <div className="mr-mapping">
      {error && (
        <div className="sc-warning" role="alert">
          {error}
        </div>
      )}
      <div className="mr-actions ms-advanced-heading">
        <p>设置默认档位、主备模型顺序与故障转移策略</p>
        <button
          className="ad-primary"
          disabled={busy}
          onClick={async () => {
            const seconds = Number(timeoutText);
            if (!timeoutText.trim() || !Number.isSafeInteger(seconds) || seconds < 1) {
              setError("请输入大于0的整数超时时间（秒）");
              return;
            }
            failover.timeout = seconds;
            setBusy(true);
            setError("");
            try {
              await save(draft);
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
      <section>
        <h3>默认模型档位</h3>
        <p>这里的档位表示维护者配置的定位，不代表模型固有能力。</p>
        <div className="mr-tier-options">
          {tiers.map((t) => (
            <button
              key={t}
              aria-pressed={!!tierModels[t] && tierModels[t] === defaultModelId}
              disabled={!available(tierModels[t])}
              onClick={() => {
                setDefaultModelId(tierModels[t]);
                update();
              }}
            >
              <b>{t}</b>
              <small>{name(tierModels[t])}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>主模型与备用顺序</h3>
        <p>每个档位先调用主模型 ①，再按 ②、③… 依次尝试，跳过不可用模型。</p>
        {tiers.map((t) => {
          const chain = [tierModels[t], ...backupModels[t]];
          return (
            <article className="mf-tier" key={t} aria-label={`${t}调用链`}>
              <header>
                <strong>{t}</strong>
                <small>{chain.length} 个顺位</small>
              </header>
              <div className="mr-mapping-row">
                <b>① 主模型</b>
                <select
                  aria-label={`${t}映射模型`}
                  value={tierModels[t]}
                  onChange={(e) => {
                    const wasDefault = tierModels[t] === defaultModelId;
                    tierModels[t] = e.target.value;
                    backupModels[t] = backupModels[t].filter(
                      (id) => id !== e.target.value,
                    );
                    if (wasDefault) setDefaultModelId(e.target.value);
                    update();
                  }}
                >
                  {!available(tierModels[t]) && (
                    <option value={tierModels[t]}>
                      原引用不可用，请重新选择
                    </option>
                  )}
                  {configuredModels
                    .filter((m) => available(m.id) && m.orientation === t)
                    .map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.provider} / {m.name}
                      </option>
                    ))}
                </select>
              </div>
              <h4>备用顺序</h4>
              {backupModels[t].length === 0 && (
                <p>备用顺序为空，主模型失败后本档无备用可尝试。</p>
              )}
              {backupModels[t].map((id, i) => (
                <div className="mf-backup" key={id}>
                  <span>{i + 2}</span>
                  <strong>{name(id)}</strong>
                  {!available(id) && <small>不可用，执行时跳过</small>}
                  <button
                    aria-label={`上移 ${name(id)}`}
                    disabled={i === 0}
                    onClick={() => {
                      [backupModels[t][i - 1], backupModels[t][i]] = [
                        id,
                        backupModels[t][i - 1],
                      ];
                      update();
                    }}
                  >
                    上移
                  </button>
                  <button
                    aria-label={`下移 ${name(id)}`}
                    disabled={i === backupModels[t].length - 1}
                    onClick={() => {
                      [backupModels[t][i + 1], backupModels[t][i]] = [
                        id,
                        backupModels[t][i + 1],
                      ];
                      update();
                    }}
                  >
                    下移
                  </button>
                  <button
                    onClick={() => {
                      backupModels[t].splice(i, 1);
                      update();
                    }}
                  >
                    移除
                  </button>
                </div>
              ))}
              {adding === t ? (
                <div className="mf-add">
                  <select
                    aria-label="选择备用模型"
                    value={candidate}
                    onChange={(e) => setCandidate(e.target.value)}
                  >
                    <option value="">选择尚未加入调用链的模型</option>
                    {configuredModels
                      .filter(
                        (m) =>
                          available(m.id) &&
                          m.orientation === t &&
                          !chain.includes(m.id),
                      )
                      .map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={!candidate}
                    onClick={() => {
                      if (available(candidate) && !chain.includes(candidate))
                        backupModels[t].push(candidate);
                      setAdding("");
                      update();
                    }}
                  >
                    添加
                  </button>
                  <button onClick={() => setAdding("")}>取消</button>
                </div>
              ) : (
                <button
                  className="sc-secondary"
                  onClick={() => {
                    setAdding(t);
                    setCandidate("");
                  }}
                >
                  添加备用模型
                </button>
              )}
              <p className="mf-chain">
                调用链：
                {chain
                  .map(
                    (id, i) =>
                      `${i + 1} ${name(id)}${available(id) ? "" : "（不可用）"}`,
                  )
                  .join(" → ")}
              </p>
            </article>
          );
        })}
      </section>
      <section>
        <h3>故障转移策略</h3>
        <p>全局默认 · 按档位内的主备顺序进行故障转移。</p>
        <div className="mr-type-cards">
          {[
            ["same", "同档内降级", "仅按本档备用顺序查找"],
            ["cross", "允许跨档降级", "本档备用用尽后，逐档查找可用模型"],
            ["error", "直接报错", "主模型重试后，不做自动降级"],
          ].map(([v, label, desc]) => (
            <label
              key={v}
              className={failover.strategy === v ? "selected" : ""}
            >
              <input
                type="radio"
                name="failover"
                checked={failover.strategy === v}
                onChange={() => {
                  failover.strategy = v as Catalog["failover"]["strategy"];
                  update();
                }}
              />
              <b>{label}</b>
              <small>{desc}</small>
            </label>
          ))}
        </div>
        <div className="mf-controls">
          <label>
            重试次数
            <select
              aria-label="重试次数"
              value={failover.retries}
              onChange={(e) => {
                failover.retries = Number(e.target.value);
                update();
              }}
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} 次
                </option>
              ))}
            </select>
          </label>
          <label>
            调用超时
            <input
              aria-label="调用超时"
              type="number"
              min="1"
              step="1"
              value={timeoutText}
              onChange={(e) => setTimeoutText(e.target.value)}
            />
            <small>单位：秒，请按模型服务响应时间设置。</small>
          </label>
        </div>
        <fieldset className="mr-choice-field">
          <legend>触发条件</legend>
          {[
            ["timeout", "超时"],
            ["server", "服务错误（5xx）"],
            ["429", "限流 429"],
          ].map(([t, title]) => (
            <label className="mf-trigger" key={t}>
              <input
                type="checkbox"
                checked={failover.triggers.includes(t)}
                onChange={(e) => {
                  failover.triggers = e.target.checked
                    ? [...failover.triggers, t]
                    : failover.triggers.filter((x) => x !== t);
                  update();
                }}
              />
              {title}
            </label>
          ))}
        </fieldset>
        <h4>模拟演练</h4>
        <p>
          按当前档位配置验证主备顺序。从质量优先主模型失败开始，按重试次数与所选策略查找备用模型；首个可用备用模拟成功。不关联具体技能，不发送真实请求。
        </p>
        <div className="mr-actions">
          <button className="ad-primary" onClick={simulate}>
            模拟演练一次降级
          </button>
          <button onClick={() => setLogs([])}>清空日志</button>
        </div>
        <div className="mf-log" role="log" aria-live="polite">
          {logs.length
            ? logs.map((s, i) => <div key={i}>{s}</div>)
            : "等待演练。日志将记录重试、跳过、调用顺序与返回结果。"}
        </div>
      </section>
    </div>
  );
}
