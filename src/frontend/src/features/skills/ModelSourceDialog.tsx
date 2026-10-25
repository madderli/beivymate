import { ModelDiscoveryList } from "./ModelDiscoveryList";
import { discoverConnection } from "./model-api";
import { RequiredMark } from "../../RequiredMark";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components";
import { type ModelService } from "./skill-state";
export const sourceKinds = [
  "厂商直连",
  "聚合平台",
  "模型平台",
  "公司本地",
  "自定义",
] as const;
export const sourceLabels: Record<string, string> = {
  厂商直连: "官方直连",
  聚合平台: "聚合平台",
  模型平台: "模型平台",
  公司本地: "本地",
  自定义: "自定义",
};
export const createService = (): ModelService => ({
  id: crypto.randomUUID(),
  name: "",
  kind: "厂商直连",
  endpoint: "",
  protocol: "OpenAI 兼容",
  auth: "API Key",
  enabled: true,
  configured: false,
  selfCert: false,
});
export function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-field-label">
      {children}
      <RequiredMark />
    </span>
  );
}
export function ModelSourceDialog({
  initial,
  selectionOnly = false,
  existingModels = [],
  close,
  save,
}: {
  initial?: ModelService;
  selectionOnly?: boolean;
  existingModels?: string[];
  close: () => void;
  save: (s: ModelService, ids: string[], secret?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ModelService>(
    initial ? { ...initial } : createService(),
  );
  const [step, setStep] = useState(selectionOnly ? 1 : 0);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [useStoredKey, setUseStoredKey] = useState(
    selectionOnly && initial?.configured === true,
  );
  const [verified, setVerified] = useState(initial?.configured === true);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const added = new Set(existingModels);
  const [error, updateError] = useState("");
  const errorMessage = useRef<HTMLDivElement>(null);
  const setError = (message: string) => {
    updateError(message);
    if (message) requestAnimationFrame(() => {
      errorMessage.current?.scrollIntoView({ block: "nearest" });
      errorMessage.current?.focus({ preventScroll: true });
    });
  };
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const discovery = useRef<AbortController | null>(null);
  useEffect(() => () => discovery.current?.abort(), []);
  const dismiss = () => {
    if (busy && !discovery.current) return;
    discovery.current?.abort();
    close();
  };
  const noAuth = ["无", "无需鉴权", "none"].includes(draft.auth);
  const patch = (p: Partial<ModelService>) => {
    setDraft({ ...draft, ...p });
    setVerified(false);
    setTestResult("");
    setCatalog([]);
    setSelected([]);
    setError("");
  };
  const authFields = noAuth
    ? []
    : [
        [
          "secret",
          ["Token", "令牌"].includes(draft.auth) ? "Token" : "API Key",
        ],
      ];
  function checkAuth() {
    if (
      !noAuth &&
      !useStoredKey &&
      authFields.some(([key]) => !credentials[key]?.trim())
    ) {
      setError("请填写完整鉴权信息后再测试");
      return false;
    }
    setError("");
    return true;
  }
  async function discover() {
    setTestResult("");
    setVerified(false);
    if (!checkAuth()) return;
    const controller = new AbortController();
    discovery.current?.abort();
    discovery.current = controller;
    setBusy(true);
    try {
      const result = await discoverConnection(
        draft,
        useStoredKey ? undefined : (credentials.secret || "").trim(),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setVerified(true);
      setTestResult(
        `✓ 已读取模型目录${useStoredKey ? "（使用已保存的密钥）" : ""}；模型调用请在列表中单独测试`,
      );
      setCatalog(result.models);
      setSelected(result.models.filter((id) => !added.has(id)));
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (discovery.current === controller) {
        discovery.current = null;
        setBusy(false);
      }
    }
  }
  async function submit(ids: string[]) {
    setBusy(true);
    setError("");
    try {
      await save(
        { ...draft, name: draft.name.trim() },
        ids,
        credentials.secret || "",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      className="mr-dialog"
      title={selectionOnly ? "选择模型" : initial ? "编辑厂商" : "添加厂商"}
      close={dismiss}
    >
      <p className="mr-lead">
        {initial
          ? "更新厂商连接信息并重新验证"
          : "添加新的模型来源，无需修改产品代码"}
      </p>
      {!initial && (
        <ol className="mr-steps">
          {["厂商信息", "发现模型", "确认添加"].map((label, i) => (
            <li
              key={label}
              className={step === i ? "active" : step > i ? "done" : ""}
            >
              <span>{step > i ? "✓" : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      <div className="mr-dialog-body">
        {error && (
          <div className="sc-warning mr-source-warning" role="alert" ref={errorMessage} tabIndex={-1}>
            {error}
          </div>
        )}
        {!selectionOnly && (step === 0 || initial) && (
          <div className="sc-form">
            <div className="sc-two-col">
              <label>
                <RequiredLabel>厂商名称</RequiredLabel>
                <input
                  required
                  aria-label="厂商名称"
                  placeholder="例如 NovaMind"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label>
                <span className="mr-field-label">API 风格</span>
                <select
                  aria-label="API 风格"
                  value={draft.protocol}
                  onChange={(e) => patch({ protocol: e.target.value })}
                >
                  {Array.from(
                    new Set([draft.protocol, "OpenAI 兼容", "Ollama"]),
                  ).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                  <option value="Anthropic" disabled>
                    Anthropic（原生协议待接入）
                  </option>
                  <option value="自定义适配器" disabled>
                    自定义适配器（待接入）
                  </option>
                </select>
                <small>
                  支持 OpenAI 兼容接口与 Ollama；其他原生协议尚未接入
                </small>
              </label>
            </div>
            <fieldset className="mr-choice-field">
              <legend>来源类型</legend>
              <div className="mr-type-cards mr-source-types">
                {sourceKinds.map((k) => (
                  <label key={k} className={draft.kind === k ? "selected" : ""}>
                    <input
                      type="radio"
                      name="sourceKind"
                      checked={draft.kind === k}
                      onChange={() => patch({ kind: k })}
                    />
                    <b>{sourceLabels[k]}</b>
                    <small>
                      {
                        {
                          厂商直连: "厂商官方 API",
                          聚合平台: "一个入口访问多家模型",
                          模型平台: "托管推理与模型目录",
                          公司本地: "本机推理服务",
                          自定义: "兼容接口或私有部署",
                        }[k]
                      }
                    </small>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sc-two-col">
              <label>
                <span className="mr-field-label">Base URL</span>
                <input
                  aria-label="Base URL"
                  placeholder="https://api.example.com/v1"
                  value={draft.endpoint}
                  onChange={(e) => patch({ endpoint: e.target.value })}
                />
              </label>
              <label>
                <span className="mr-field-label">鉴权方式</span>
                <select
                  aria-label="鉴权方式"
                  value={draft.auth}
                  onChange={(e) => {
                    setCredentials({});
                    setUseStoredKey(false);
                    patch({ auth: e.target.value });
                  }}
                >
                  {Array.from(
                    new Set([draft.auth, "API Key", "Token", "无"]),
                  ).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                  <option value="AK-SK 签名" disabled>
                    AK-SK 签名（待接入）
                  </option>
                  <option value="OAuth 2.0" disabled>
                    OAuth 2.0（待接入）
                  </option>
                </select>
              </label>
            </div>
            <div className="sc-two-col">
              {initial?.configured && !noAuth && (
                <label className="mr-check">
                  <input
                    type="checkbox"
                    checked={useStoredKey}
                    onChange={(e) => {
                      setUseStoredKey(e.target.checked);
                      setCredentials({});
                      setVerified(false);
                      setCatalog([]);
                      setSelected([]);
                      setTestResult("");
                    }}
                  />
                  使用已保存的密钥（不显示原文）
                </label>
              )}
              {authFields.map(([key, label]) => (
                <label key={key}>
                  <RequiredLabel>{label}</RequiredLabel>
                  <input
                    required
                    aria-label={label}
                    type={
                      key === "clientId" || key === "tokenUrl"
                        ? "text"
                        : "password"
                    }
                    disabled={useStoredKey}
                    placeholder={
                      useStoredKey
                        ? "使用本机已保存的密钥"
                        : "请输入本次要测试或保存的 API Key"
                    }
                    autoComplete="off"
                    value={credentials[key] || ""}
                    onChange={(e) => {
                      setCredentials({ ...credentials, [key]: e.target.value });
                      setVerified(false);
                      setTestResult("");
                      setCatalog([]);
                      setSelected([]);
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="mr-check">
              <input
                type="checkbox"
                checked={!!draft.selfCert}
                onChange={(e) => patch({ selfCert: e.target.checked })}
              />
              允许自签名证书<span>内网自部署网关使用自签名证书时勾选</span>
            </label>
            {initial && (
              <div className="mr-test-result-row">
                <button
                  className="sc-secondary"
                  disabled={busy}
                  onClick={discover}
                >
                  {busy ? "测试中…" : verified ? "重新测试" : "测试连接"}
                </button>
                {testResult && !busy && (
                  <div className="sc-success" role="status">
                    {testResult}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {(step === 1 || (initial && catalog.length > 0)) && (
          <div className="sc-form">
            {!catalog.length && (
              <div className="mr-discover">
                <h3>验证连接并读取模型目录</h3>
                <p>
                  读取服务提供的模型目录，不会自动推断能力和价格。服务不支持目录时，可点击下一步保存厂商，再手动添加模型。
                </p>
                <button
                  className="ad-primary"
                  disabled={busy}
                  onClick={discover}
                >
                  {busy ? "测试中…" : "测试并发现模型"}
                </button>
              </div>
            )}
            {!!catalog.length && (
              <ModelDiscoveryList
                models={catalog}
                existing={existingModels}
                selected={selected}
                change={setSelected}
              />
            )}
          </div>
        )}
        {!initial && step === 2 && (
          <div className="mr-review">
            <h3>准备添加</h3>
            <p>
              {draft.name} · {sourceLabels[draft.kind]} · {draft.protocol} ·{" "}
              {draft.auth} · {selected.length} 个模型
            </p>
            {selected.map((id) => (
              <div className="mr-review-row" key={id}>
                <code>{id}</code>
                <span>待添加</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="mr-footer">
        {initial ? (
          <>
            <button onClick={dismiss}>取消</button>
            <button
              className="ad-primary"
              disabled={busy}
              onClick={() => {
                if (!draft.name.trim() || !draft.endpoint.trim()) {
                  setError("请输入厂商名称和 Base URL");
                  return;
                }
                if (!checkAuth()) return;
                void submit(selected);
              }}
            >
              保存修改
            </button>
          </>
        ) : (
          <>
            {step > 0 && (
              <button
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                上一步
              </button>
            )}
            {step < 2 ? (
              <button
                className="ad-primary"
                disabled={busy}
                onClick={() => {
                  if (!draft.name.trim() || !draft.endpoint.trim()) {
                    setError("请输入厂商名称和 Base URL");
                    return;
                  }
                  if (step === 0 && !checkAuth()) return;
                  setError("");
                  setStep(step + 1);
                }}
              >
                下一步
              </button>
            ) : (
              <button
                className="ad-primary"
                disabled={busy}
                onClick={() => void submit(selected)}
              >
                确认添加
              </button>
            )}
          </>
        )}
      </footer>
    </Dialog>
  );
}
