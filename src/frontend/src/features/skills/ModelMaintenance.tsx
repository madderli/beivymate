import { useEffect, useState } from "react";
import { Dialog } from "../../components";
import { request } from "../../api";
import type { Catalog, Model } from "./model-api";
import "./model-maintenance.css";
export type ModelFact = {
  status: string;
  versionStatus?: "latest" | "update_available" | "unknown";
  latestModel?: string | null;
  shutdownDate?: string;
  checkedAt?: string;
  source?: string;
  references?: number;
  message?: string;
};
export type Lifecycle = {
  models: Record<string, ModelFact>;
  checkedModels?: string[];
  errors?: { service: string; message: string }[];
  resources?: Record<string, { status: string; message: string }>;
};
type Ref = {
  id: string;
  name: string;
  kind: string;
  eligible: boolean;
  reason: string;
  inherited: boolean;
  dependency: string;
};
type Plan = {
  revision: string;
  items: Ref[];
  source: Model;
  target?: Model;
  canDelete: boolean;
  targetFacts?: ModelFact;
  currentFacts?: ModelFact;
};
type Latest = {
  session: string;
  candidates: string[];
  currentFacts: ModelFact;
  checkedAt: string;
};
const capabilityNames: Record<string, string> = {
  text: "文本对话",
  structured: "结构化输出",
  images: "视觉",
  tools: "工具调用",
  reasoning: "推理",
};
const modelPrice = (m: Model | undefined) =>
  !m || m.inputPrice == null || m.outputPrice == null
    ? "厂商未提供"
    : `${m.currency === "USD" ? "$" : "¥"}${(m.inputPrice * 1000000) / (m.priceUnit || 1000)} / ${(m.outputPrice * 1000000) / (m.priceUnit || 1000)}`;
function priceChange(source: Model, target?: Model) {
  if (
    !target ||
    source.currency !== target.currency ||
    source.inputPrice == null ||
    source.outputPrice == null ||
    target.inputPrice == null ||
    target.outputPrice == null
  )
    return "";
  const oldUnit = source.priceUnit || 1000,
    newUnit = target.priceUnit || 1000;
  const changes = [
    target.inputPrice / newUnit - source.inputPrice / oldUnit,
    target.outputPrice / newUnit - source.outputPrice / oldUnit,
  ];
  return changes.some((value) => value > 0)
    ? "mm-worse"
    : changes.some((value) => value < 0)
      ? "mm-better"
      : "";
}
export function ModelMaintenanceDialog({
  source,
  doc,
  action,
  close,
  changed,
  upgrade,
}: {
  source: Model;
  doc: Catalog;
  action: "replace" | "delete";
  close: () => void;
  changed: () => Promise<void>;
  upgrade: () => void;
}) {
  const [latest, setLatest] = useState<Latest>();
  const [identifier, setIdentifier] = useState("");
  const [query, setQuery] = useState("");
  const [caps, setCaps] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>();
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [success, setSuccess] = useState("");
  const body = {
    source: source.id,
    action,
    session: latest?.session,
    identifier,
    capabilities: caps,
  };
  useEffect(() => {
    const controller = new AbortController();
    request<Latest | Plan>(
      action === "delete"
        ? "/models/maintenance/preview"
        : "/models/maintenance/latest",
      {
        method: "POST",
        body: JSON.stringify({ source: source.id, action }),
        signal: controller.signal,
      },
      35000,
    )
      .then((result) => {
        if (action === "delete") {
          setPlan(result as Plan);
          setStep(2);
        } else setLatest(result as Latest);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [source.id, action]);
  const target =
    plan?.target ||
    doc.models.find(
      (m) => m.serviceId === source.serviceId && m.identifier === identifier,
    );
  const candidates = latest?.candidates.filter(
    (id) => id !== source.identifier && id.toLowerCase().includes(query.toLowerCase()),
  ) ?? [];
  const preview = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<Plan>("/models/maintenance/preview", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPlan(result);
      setSelected(result.items.filter((r) => r.eligible).map((r) => r.id));
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  async function commit() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      await request(
        "/models/maintenance/commit",
        {
          method: "POST",
          body: JSON.stringify({
            ...body,
            revision: plan.revision,
            selected,
            confirm,
          }),
        },
        35000,
      );
      await changed();
      if (action === "delete") {
        close();
        return;
      }
      setSuccess(
        plan.items.length === 0
            ? "模型已更换。任务历史保持不变。"
            : "选中引用已整体更新。修改后的技能需重新验证发布；任务历史保持不变。",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      className="mr-dialog model-maintenance-dialog"
      title={action === "delete" ? "删除模型 · 影响确认" : "更换模型"}
      close={() => {
        if (!busy || step === 0) close();
      }}
    >
      <div className="mr-dialog-body sc-form">
        {action === "replace" && (
          <ol className="mr-steps">
            {["选择模型", "对比变化", "确认引用"].map((title, i) => (
              <li
                key={title}
                className={step === i ? "active" : step > i ? "done" : ""}
              >
                <span>{i + 1}</span>
                {title}
              </li>
            ))}
          </ol>
        )}
        {busy && !success && (
          <p role="status">
            {step === 0 ? "正在向厂商查询一次模型目录…" : "正在处理，请稍候…"}
          </p>
        )}
        {!success && action === "replace" && step === 0 && latest && (
          <>
            <p>
              当前模型：<strong>{source.identifier}</strong>
            </p>
            <input
              aria-label="搜索目标模型"
              placeholder="搜索厂商提供的目标模型…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label>
              目标模型
              <select
                aria-label="目标模型版本"
                value={identifier}
                size={query.trim() ? 6 : 1}
                style={query.trim() ? { height: "auto" } : undefined}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setQuery("");
                  setPlan(undefined);
                }}
              >
                <option value="">{candidates.length ? "请选择目标模型" : "无"}</option>
                {candidates.map((id) => <option key={id}>{id}</option>)}
              </select>
            </label>
            {!!identifier && !target && (
              <fieldset className="mm-capabilities">
                <legend>厂商未提供能力资料，请按实际资料确认</legend>
                {Object.entries(capabilityNames).map(([key, name]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={caps.includes(key)}
                      onChange={(e) =>
                        setCaps((current) =>
                          e.target.checked
                            ? [...current, key]
                            : current.filter((c) => c !== key),
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        {!success && step === 1 && plan && (
          <>
            <table className="mm-comparison">
              <thead>
                <tr>
                  <th>对比项</th>
                  <th>当前版本</th>
                  <th>目标版本</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>模型</th>
                  <td>{source.identifier}</td>
                  <td>{plan.target?.identifier}</td>
                </tr>
                <tr>
                  <th>
                    输入／输出价格
                    <br />
                    <small>每百万 Token</small>
                  </th>
                  <td>{modelPrice(source)}</td>
                  <td className={priceChange(source, plan.target)}>
                    {modelPrice(plan.target)}
                  </td>
                </tr>
                <tr>
                  <th>上下文窗口</th>
                  <td>
                    {source.contextK ? `${source.contextK}K` : "厂商未提供"}
                  </td>
                  <td
                    className={
                      source.contextK && plan.target?.contextK
                        ? plan.target.contextK < source.contextK
                          ? "mm-worse"
                          : plan.target.contextK > source.contextK
                            ? "mm-better"
                            : ""
                        : ""
                    }
                  >
                    {plan.target?.contextK
                      ? `${plan.target.contextK}K`
                      : "厂商未提供"}
                  </td>
                </tr>
                {Object.entries(capabilityNames).map(([key, name]) => (
                  <tr key={key}>
                    <th>{name}</th>
                    <td>
                      {source.capabilitySource === "unknown"
                        ? "未确认"
                        : source.capabilities.includes(key)
                          ? "已确认支持"
                          : "未声明支持"}
                    </td>
                    <td
                      className={
                        source.capabilitySource !== "unknown" &&
                        plan.target?.capabilitySource !== "unknown"
                          ? source.capabilities.includes(key) &&
                            !plan.target?.capabilities.includes(key)
                            ? "mm-worse"
                            : !source.capabilities.includes(key) &&
                                plan.target?.capabilities.includes(key)
                              ? "mm-better"
                              : ""
                          : ""
                      }
                    >
                      {plan.target?.capabilitySource === "unknown"
                        ? "未确认"
                        : plan.target?.capabilities.includes(key)
                          ? "已确认支持"
                          : "未声明支持"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th>厂商停用日期</th>
                  <td>
                    {latest?.currentFacts?.shutdownDate ||
                      plan.currentFacts?.shutdownDate ||
                      "未公布"}
                  </td>
                  <td>{plan.targetFacts?.shutdownDate || "未公布"}</td>
                </tr>
              </tbody>
            </table>
            <p className="mm-note">
              绿色表示已知提升，红色表示涨价或已知缩水；未知信息不参与优劣判断。检查时间：
              {latest?.checkedAt && new Date(latest.checkedAt).toLocaleString()}
            </p>
          </>
        )}
        {!success && step === 2 && plan && (
          <>
            <p>
              {action === "delete"
                ? `删除 ${source.name} 后，下列可编辑配置需要重新选择模型。`
                : "选择要使用目标模型的引用。取消勾选的可编辑引用保留原模型。"}
            </p>
            <div className="mm-references">
              {plan.items.length ? (
                plan.items.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={
                        action === "delete" || selected.includes(item.id)
                      }
                      disabled={action === "delete" || !item.eligible || busy}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>
                      <b>{item.name}</b>
                      <small>
                        {item.reason ||
                          (item.inherited
                            ? "使用上级默认设置；取消后固定为原模型"
                            : "直接引用")}
                        {action === "replace" &&
                        item.eligible &&
                        !selected.includes(item.id)
                          ? " · 保留原模型"
                          : ""}
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="mm-references-empty">
                  {action === "replace"
                    ? "没有发现引用，可直接更换模型。"
                    : "没有发现引用。"}
                </p>
              )}
            </div>
            {action === "delete" && (
              <>
                <p className="mm-note">
                  历史模型记录保留。缺失配置不会自动改用默认模型。
                </p>
                {!plan.canDelete ? (
                  <p className="sc-warning">
                    存在受保护引用，当前不能删除。请先处理未关闭任务或内置资源引用。
                  </p>
                ) : (
                  <label className="mm-confirm">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    我确认删除，并将受影响配置标记为“模型缺失”
                  </label>
                )}
              </>
            )}
          </>
        )}
        {error && (
          <p className="sc-warning" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="sc-success" role="status">
            {success}
          </p>
        )}
      </div>
      <footer className="mr-footer">
        {success ? (
          <button onClick={close}>完成</button>
        ) : (
          <>
            {action === "delete" && (
              <button onClick={upgrade} disabled={busy}>
                更换模型
              </button>
            )}
            {step > 0 && action === "replace" && (
              <button disabled={busy} onClick={() => setStep(step - 1)}>
                上一步
              </button>
            )}
            <button disabled={busy} onClick={close}>
              取消
            </button>
            {action === "replace" && step === 0 && (
              <button
                className="ad-primary"
                disabled={
                  busy || !identifier || (!target && !caps.includes("text"))
                }
                onClick={preview}
              >
                对比版本
              </button>
            )}
            {action === "replace" && step === 1 && (
              <button className="ad-primary" onClick={() => setStep(2)}>
                查看影响范围
              </button>
            )}
            {step === 2 && (
              <button
                className="ad-primary"
                disabled={
                  busy ||
                  !plan ||
                  (action === "delete"
                    ? !confirm || !plan.canDelete
                    : plan.items.length > 0 && !selected.length)
                }
                onClick={commit}
              >
                {action === "delete"
                  ? "确认删除"
                  : plan?.items.length === 0
                    ? "确认更换模型"
                    : "确认替换选中引用"}
              </button>
            )}
          </>
        )}
      </footer>
    </Dialog>
  );
}
