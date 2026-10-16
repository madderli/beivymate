import { modelFacts } from "./model-capabilities";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components";
import {
  ModelSourceDialog,
  sourceKinds,
  sourceLabels,
  RequiredLabel,
} from "./ModelSourceDialog";
import ModelPlatformImport from "./ModelPlatformImport";
import ModelRegistryEditor, { registryTier } from "./ModelRegistryEditor";
import {
  configuredModels,
  modelServices,
  type ModelService,
  type ConfiguredModel,
} from "./skill-state";
export function newModel(service: ModelService): ConfiguredModel {
  return {
    id: crypto.randomUUID(),
    serviceId: service.id,
    name: "",
    provider: service.name,
    endpoint: service.endpoint,
    identifier: "",
    capabilities: [],
    registryCapabilities: [],
    capabilitySource: "unknown",
    enabled: true,
    deployment: service.kind === "公司本地" ? "本地" : "云端",
    pricing: "付费",
    orientation: "均衡",
    inputs: ["文本"],
    quota: "",
    connection: "未验证",
    connectionSimulated: false,
    contextK: 32,
  };
}
export default function ModelLibrary({ changed }: { changed: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部来源");
  const [collapsed, setCollapsed] = useState(
    modelServices.slice(1).map((s) => s.id),
  );
  const [source, setSource] = useState<ModelService | "new">();
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ConfiguredModel>();
  const [deleting, setDeleting] = useState<ConfiguredModel>();
  const [configuring, setConfiguring] = useState<ModelService>();
  const [secret, setSecret] = useState("");
  const [configError, setConfigError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void) => {
    timers.current.push(setTimeout(fn, 700));
  };
  function saveSource(g: ModelService, ids: string[]) {
    const index = modelServices.findIndex((x) => x.id === g.id);
    if (index < 0) modelServices.unshift(g);
    else modelServices[index] = g;
    ids.forEach((identifier, i) => {
      if (
        configuredModels.some(
          (m) => m.serviceId === g.id && m.identifier === identifier,
        )
      )
        return;
      configuredModels.push({
        ...newModel(g),
        identifier,
        name: identifier.split("/").at(-1) || identifier,
        registryCapabilities: identifier.includes("vision")
          ? ["视觉理解"]
          : identifier.includes("lite")
            ? []
            : identifier.includes("chat")
              ? ["函数调用", "结构化输出（JSON）"]
              : ["深度推理", "代码能力"],
        capabilitySource: "provider",
        contextK: i === 0 ? 128 : 64,
        inputPrice: i === 0 ? 0.003 : 0.001,
        outputPrice: i === 0 ? 0.009 : 0.003,
        orientation: i === 0 ? "质量优先" : i === 1 ? "均衡" : "速度优先",
      });
    });
    configuredModels
      .filter((m) => m.serviceId === g.id)
      .forEach((m) => {
        m.provider = g.name;
        m.endpoint = g.endpoint;
      });
    setCollapsed(
      ids.length
        ? modelServices.filter((s) => s.id !== g.id).map((s) => s.id)
        : collapsed,
    );
    setSource(undefined);
    setImporting(false);
    changed();
    setNotice(ids.length ? `已注册 ${ids.length} 个模型` : "厂商信息已更新");
  }
  function sync(g: ModelService) {
    setBusy((xs) => [...xs, g.id]);
    later(() => {
      const identifier = `${g.id}/synced-latest`;
      const exists = configuredModels.some(
        (m) => m.serviceId === g.id && m.identifier === identifier,
      );
      if (!exists)
        configuredModels.unshift({
          ...newModel(g),
          identifier,
          name: "同步发现的新模型",
          registryCapabilities: ["结构化输出（JSON）"],
          capabilitySource: "provider",
          contextK: 64,
          inputPrice: 0.001,
          outputPrice: 0.003,
          lineage: "目录同步发现",
        });
      const candidate = configuredModels.find(
        (m) =>
          m.serviceId === g.id && !m.offline && m.identifier !== identifier,
      );
      if (candidate && g.name !== "OpenRouter") {
        candidate.offline = true;
        candidate.enabled = false;
      }
      setBusy((xs) => xs.filter((id) => id !== g.id));
      changed();
      setNotice(
        `同步完成：新增 ${exists ? 0 : 1} 个模型，${candidate && g.name !== "OpenRouter" ? 1 : 0} 个模型已下线`,
      );
    });
  }
  const matches = (m: ConfiguredModel, g: ModelService) =>
    !query ||
    `${g.name} ${m.identifier} ${m.name} ${m.lineage || ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const groups = modelServices.filter(
    (g) =>
      (filter === "全部来源" || filter === g.kind) &&
      (!query ||
        configuredModels.some((m) => m.serviceId === g.id && matches(m, g))),
  );
  return (
    <>
      <div className="ms-panel-intro">
        <p>统一管理直连厂商、模型平台与公司自部署模型</p>
        <div className="mr-actions">
          <button className="sc-secondary" onClick={() => setImporting(true)}>
            ⇧ 从平台导入
          </button>
          <button className="ad-primary" onClick={() => setSource("new")}>
            ＋ 添加厂商
          </button>
        </div>
      </div>
      <div className="mr-stats">
        <div>
          <strong>{modelServices.length}</strong>
          <span>已接入厂商</span>
        </div>
        <div>
          <strong>{configuredModels.length}</strong>
          <span>已注册模型</span>
        </div>
        <div>
          <strong>
            {
              configuredModels.filter(
                (m) =>
                  m.enabled &&
                  !m.offline &&
                  modelServices.find((g) => g.id === m.serviceId)?.enabled,
              ).length
            }
          </strong>
          <span>已启动模型</span>
        </div>
      </div>
      <div className="ms-library-tools">
        <input
          aria-label="搜索模型管理"
          placeholder="按模型 ID / 厂商名过滤"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="来源筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>全部来源</option>
          {sourceKinds.map((k) => (
            <option key={k} value={k}>
              {sourceLabels[k]}
            </option>
          ))}
        </select>
      </div>
      {groups.map((g) => (
        <section className="mr-group" key={g.id}>
          <header
            className="mr-group-head"
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("button"))
                setCollapsed((xs) =>
                  xs.includes(g.id)
                    ? xs.filter((id) => id !== g.id)
                    : [...xs, g.id],
                );
            }}
          >
            <div>
              <div className="mr-vendor-name">
                <strong>{g.name}</strong>
                <span>{sourceLabels[g.kind]}</span>
                <span>{g.protocol}</span>
                <span>{g.auth}</span>
              </div>
              <small>
                {g.endpoint || "未设置 Base URL"}
                {g.selfCert ? " · 允许自签名证书" : ""}
              </small>
            </div>
            <div className="mr-group-controls">
              <span
                className={`mr-config-state ${g.configured === false ? "missing" : ""}`}
              >
                {g.configured === false ? "未配置" : "已配置"}
              </span>
              {g.configured === false &&
                !["无", "无需鉴权"].includes(g.auth) && (
                  <button
                    onClick={() => {
                      setConfiguring(g);
                      setSecret("");
                      setConfigError("");
                    }}
                  >
                    去配置
                  </button>
                )}
              <small>
                {configuredModels.filter((m) => m.serviceId === g.id).length}{" "}
                个模型
              </small>
              <button disabled={busy.includes(g.id)} onClick={() => sync(g)}>
                {busy.includes(g.id) ? "同步中…" : "重新同步"}
              </button>
              <button
                aria-label={`编辑 ${g.name}`}
                onClick={() => setSource(g)}
              >
                编辑
              </button>
              <button
                role="switch"
                className="mr-switch"
                aria-label={`启用厂商 ${g.name}`}
                aria-checked={g.enabled}
                onClick={() => {
                  g.enabled = !g.enabled;
                  changed();
                }}
              >
                <i />
              </button>
              <button
                aria-label={`展开或折叠 ${g.name}`}
                aria-expanded={!collapsed.includes(g.id) || !!query}
                onClick={() =>
                  setCollapsed((xs) =>
                    xs.includes(g.id)
                      ? xs.filter((id) => id !== g.id)
                      : [...xs, g.id],
                  )
                }
              >
                {collapsed.includes(g.id) && !query ? "⌄" : "⌃"}
              </button>
            </div>
          </header>
          {(!collapsed.includes(g.id) || !!query) && (
            <>
              <div className="mr-table-wrap">
                <table className="mr-table">
                  <thead>
                    <tr>
                      {[
                        "模型 ID",
                        "能力",
                        "上下文",
                        "单价",
                        "推荐档位",
                        "启用",
                        "操作",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {configuredModels
                      .filter((m) => m.serviceId === g.id && matches(m, g))
                      .map((m) => (
                        <tr
                          key={m.id}
                          className={m.offline ? "mr-offline" : ""}
                        >
                          <td>
                            <code>{m.identifier}</code>
                            {m.offline && (
                              <span className="mr-danger-tag">已下线</span>
                            )}
                            <strong>{m.name}</strong>
                            {m.lineage && <small>{m.lineage}</small>}
                          </td>
                          <td>
                            <div className="mr-pills">
                              {modelFacts(m).map((c) => (
                                <span key={c}>{c}</span>
                              ))}
                            </div>
                          </td>
                          <td>{m.contextK || 32}K</td>
                          <td>
                            {m.offline ? (
                              "—"
                            ) : m.pricing === "免费" ? (
                              <strong>内部</strong>
                            ) : (
                              <>
                                <span>
                                  输入 ¥{m.inputPrice || 0} / 输出 ¥
                                  {m.outputPrice || 0}
                                </span>
                                <small>每千 tokens · 示例</small>
                              </>
                            )}
                          </td>
                          <td>{registryTier(m)}</td>
                          <td>
                            <button
                              role="switch"
                              className="mr-switch"
                              aria-label={`启用模型 ${m.identifier}`}
                              aria-checked={m.enabled}
                              disabled={!!m.offline}
                              onClick={() => {
                                m.enabled = !m.enabled;
                                changed();
                              }}
                            >
                              <i />
                            </button>
                          </td>
                          <td>
                            <div className="mr-row-actions">
                              <button
                                onClick={() => setEditing(structuredClone(m))}
                              >
                                编辑
                              </button>
                              <button
                                className="mr-delete"
                                onClick={() => setDeleting(m)}
                              >
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <button
                className="sc-secondary mr-add-model"
                onClick={() => setEditing(newModel(g))}
              >
                ＋ 添加模型
              </button>
            </>
          )}
        </section>
      ))}
      {!groups.length && <div className="mr-empty">没有匹配的模型</div>}
      {notice && (
        <div className="ms-feedback" role="status">
          {notice}
        </div>
      )}
      {source && (
        <ModelSourceDialog
          initial={source === "new" ? undefined : source}
          close={() => setSource(undefined)}
          save={saveSource}
        />
      )}
      {importing && (
        <ModelPlatformImport
          close={() => setImporting(false)}
          save={saveSource}
        />
      )}
      {editing && (
        <ModelRegistryEditor
          initial={editing}
          close={() => setEditing(undefined)}
          save={(m) => {
            const i = configuredModels.findIndex((x) => x.id === m.id);
            if (i < 0) configuredModels.unshift(m);
            else configuredModels[i] = m;
            setEditing(undefined);
            changed();
            setNotice("模型已保存");
          }}
        />
      )}
      {deleting && (
        <Dialog
          className="mr-dialog mr-delete-dialog"
          title="删除模型"
          close={() => setDeleting(undefined)}
        >
          <div className="mr-dialog-body mr-delete-copy">
            <p>
              确定删除模型 <strong>{deleting.identifier}</strong>？
            </p>
            <p>档位映射中引用它将被标记为不可用。</p>
          </div>
          <footer className="mr-footer">
            <button onClick={() => setDeleting(undefined)}>取消</button>
            <button
              className="ad-primary"
              onClick={() => {
                const i = configuredModels.findIndex(
                  (m) => m.id === deleting.id,
                );
                if (i >= 0) configuredModels.splice(i, 1);
                setDeleting(undefined);
                changed();
                setNotice("模型已删除");
              }}
            >
              确认删除
            </button>
          </footer>
        </Dialog>
      )}
      {configuring && (
        <Dialog
          className="mr-dialog"
          title="配置厂商"
          close={() => setConfiguring(undefined)}
        >
          <p className="mr-lead">
            {configuring.name} · {configuring.auth}
          </p>
          <div className="mr-dialog-body sc-form">
            <label>
              <RequiredLabel>密钥</RequiredLabel>
              <input
                required
                aria-label="密钥"
                type="password"
                placeholder="输入 Key / Token"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <small>填写密钥并测试通过后，厂商变为已配置</small>
            </label>
            {configError && (
              <div className="sc-warning" role="alert">
                {configError}
              </div>
            )}
          </div>
          <footer className="mr-footer">
            <button onClick={() => setConfiguring(undefined)}>取消</button>
            <button
              className="ad-primary"
              disabled={busy.includes("configure")}
              onClick={() => {
                if (!secret.trim()) {
                  setConfigError("请先填写密钥并测试连接");
                  return;
                }
                const g = configuring;
                setBusy((xs) => [...xs, "configure"]);
                later(() => {
                  g.configured = true;
                  setBusy((xs) => xs.filter((id) => id !== "configure"));
                  setConfiguring(undefined);
                  changed();
                  setNotice("配置成功，该厂商的模型可用于档位映射");
                });
              }}
            >
              {busy.includes("configure") ? "测试中…" : "测试连接"}
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
