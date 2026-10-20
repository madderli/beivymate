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
  close,
  save,
}: {
  initial?: ModelService;
  close: () => void;
  save: (s: ModelService, ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<ModelService>(
    initial ? { ...initial } : createService(),
  );
  const [step, setStep] = useState(0);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState(initial?.configured === true);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const noAuth = ["无", "无需鉴权"].includes(draft.auth);
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
    : draft.auth === "AK-SK 签名"
      ? [
          ["accessKey", "AccessKey"],
          ["secretKey", "SecretKey"],
        ]
      : draft.auth === "OAuth 2.0"
        ? [
            ["clientId", "Client ID"],
            ["clientSecret", "Client Secret"],
            ["tokenUrl", "Token URL"],
          ]
        : [
            [
              "secret",
              ["Token", "令牌"].includes(draft.auth) ? "Token" : "API Key",
            ],
          ];
  function checkAuth() {
    if (authFields.some(([key]) => !credentials[key]?.trim())) {
      setError("请填写完整鉴权信息后再测试");
      return false;
    }
    setError("");
    return true;
  }
  function discover() {
    setTestResult("");
    setVerified(false);
    if (!checkAuth()) return;
    setBusy(true);
    timer.current = setTimeout(() => {
      setVerified(true);
      setTestResult("✓ 连接成功（模拟），可以保存");
      setBusy(false);
      if (!initial) {
        const ids = ["novamind-pro", "novamind-chat", "novamind-lite"];
        setCatalog(ids);
        setSelected(ids);
      }
    }, 700);
  }
  return (
    <Dialog
      className="mr-dialog"
      title={initial ? "编辑厂商" : "添加厂商"}
      close={close}
    >
      <p className="mr-lead">
        {initial
          ? "更新厂商连接信息并重新验证"
          : "注册新的模型来源，无需修改产品代码"}
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
        {(step === 0 || initial) && (
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
                    new Set([
                      draft.protocol,
                      "OpenAI 兼容",
                      "Anthropic",
                      "自定义适配器",
                    ]),
                  ).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <small>非 OpenAI 兼容接口需走对应适配器</small>
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
                    patch({ auth: e.target.value });
                  }}
                >
                  {Array.from(
                    new Set([
                      draft.auth,
                      "API Key",
                      "Token",
                      "AK-SK 签名",
                      "OAuth 2.0",
                      "无",
                    ]),
                  ).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="sc-two-col">
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
        {!initial && step === 1 && (
          <div className="sc-form">
            {!catalog.length && (
              <div className="mr-discover">
                <h3>验证连接并读取模型目录</h3>
                <p>原型将模拟发现 3 个模型，不会发送真实请求。</p>
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
              <div className="mr-discovered">
                {catalog.map((id) => (
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
            )}
          </div>
        )}
        {!initial && step === 2 && (
          <div className="mr-review">
            <h3>准备注册</h3>
            <p>
              {draft.name} · {sourceLabels[draft.kind]} · {draft.protocol} ·{" "}
              {draft.auth} · {selected.length} 个模型
            </p>
            {selected.map((id) => (
              <div className="mr-review-row" key={id}>
                <code>{id}</code>
                <span>将注册</span>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="sc-warning" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="mr-footer">
        {initial ? (
          <>
            <button onClick={close}>取消</button>
            <button
              className="ad-primary"
              disabled={busy}
              onClick={() => {
                if (!draft.name.trim()) {
                  setError("请输入厂商名称");
                  return;
                }
                if (!noAuth && !verified) {
                  setError("请填写完整鉴权信息并测试连接");
                  return;
                }
                save(
                  { ...draft, name: draft.name.trim(), configured: true },
                  [],
                );
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
                disabled={
                  busy || (step === 1 && (!verified || !selected.length))
                }
                onClick={() => {
                  if (!draft.name.trim()) {
                    setError("请输入厂商名称");
                    return;
                  }
                  setError("");
                  setStep(step + 1);
                }}
              >
                下一步
              </button>
            ) : (
              <button
                className="ad-primary"
                onClick={() =>
                  save(
                    { ...draft, name: draft.name.trim(), configured: true },
                    selected,
                  )
                }
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
