import { Fragment, useEffect, useState } from "react";
import { ModelMaintenanceDialog, type Lifecycle } from "./ModelMaintenance";
import { request } from "../../api";
import { type Catalog, modelPayload, servicePayload } from "./model-api";
import { modelFacts } from "./model-capabilities";
import { Dialog } from "../../components";
import {
  ModelSourceDialog,
  sourceKinds,
  sourceLabels,
  RequiredLabel,
} from "./ModelSourceDialog";
import ModelRegistryEditor, { registryTier } from "./ModelRegistryEditor";
import {
  configuredModels,
  modelServices,
  type ModelService,
  type ConfiguredModel,
} from "./skill-state";
function newModel(service: ModelService): ConfiguredModel {
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
    contextK: undefined,
  };
}
export default function ModelLibrary({
  doc,
  save,
  reload,
  active = true,
}: {
  doc: Catalog;
  save: (next: Catalog) => Promise<Catalog>;
  reload: () => Promise<void>;
  active?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部来源");
  const [collapsed, setCollapsed] = useState(
    modelServices.slice(1).map((s) => s.id),
  );
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [source, setSource] = useState<ModelService | "new">();
  const [editing, setEditing] = useState<ConfiguredModel>();
  const [configuring, setConfiguring] = useState<ModelService>();
  const [secret, setSecret] = useState("");
  const [configError, setConfigError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const [probes, setProbes] = useState<
    Record<string, { busy: boolean; message: string; failed?: boolean }>
  >({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ models: {} });
  const [maintenance, setMaintenance] = useState<{
    source: Catalog["models"][number];
    action: "replace" | "delete";
  }>();
  const [checkMessages, setCheckMessages] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  async function loadLifecycle() {
    setLifecycle(await request<Lifecycle>("/models/lifecycle"));
  }
  async function checkModels(ids?: string[], serviceId?: string) {
    const feedback = (message: string) => {
      if (serviceId) setCheckMessages((current) => ({ ...current, [serviceId]: message }));
      else setError(message);
    };
    if (serviceId) feedback("正在检查模型版本，请稍候…");
    setChecking(true);
    setError("");
    try {
      const result = await request<Lifecycle>(
        "/models/lifecycle/check",
        {
          method: "POST",
          body: JSON.stringify({ models: ids, usedOnly: !ids }),
        },
        Math.min(305000, 35000 * doc.services.length + 5000),
      );
      setLifecycle(result);
      await loadLifecycle();
      await reload();
      window.dispatchEvent(new Event("beivymate-models-changed"));
      if (result.errors?.length)
        feedback(
          result.errors
            .map((e) => `${e.service}：检查未完成，${e.message}`)
            .join("；"),
        );
      else if (ids) {
        const checked = new Set(result.checkedModels ?? []);
        const models = doc.models.filter((m) => ids.includes(m.id) && checked.has(m.id));
        const updates = models.filter((m) => result.models[m.id]?.versionStatus === "update_available");
        const unknown = models.filter((m) => !["latest", "update_available"].includes(result.models[m.id]?.versionStatus ?? "unknown"));
        if (!models.length) feedback("暂无模型可检查。");
        else if (updates.length) feedback(
          `模型检查完成，${updates.map((m) => m.name).join("、")}模型有新版本，请使用“更换模型”功能更新。` +
          (unknown.length ? `另有 ${unknown.length} 个模型暂时无法确认是否有更新。` : ""),
        );
        else if (unknown.length) feedback("模型检查完成，厂商未提供版本信息，暂时无法确认是否有更新。");
        else feedback("模型检查完成，当前模型均为最新版本。");
      }
    } catch (e) {
      feedback(`模型版本检查未完成：${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (!active) return;
    void loadLifecycle().catch((e) => setError(e.message));
    void checkModels();
  }, [active]);

  async function action(id: string, fn: () => Promise<void>) {
    if (busy.includes(id)) return;
    setBusy((xs) => [...xs, id]);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy((xs) => xs.filter((x) => x !== id));
    }
  }
  async function saveSource(g: ModelService, ids: string[], key = "") {
    const additions = ids
      .filter(
        (identifier) =>
          !doc.models.some(
            (m) => m.serviceId === g.id && m.identifier === identifier,
          ),
      )
      .map((identifier) =>
        modelPayload({ ...newModel(g), identifier, name: identifier }),
      );
    await save({
      ...doc,
      services: doc.services.some((s) => s.id === g.id)
        ? doc.services.map((s) => (s.id === g.id ? servicePayload(g) : s))
        : [servicePayload(g), ...doc.services],
      models: [...doc.models, ...additions],
    });
    if (key.trim()) {
      try {
        await request(`/models/services/${g.id}/credential`, {
          method: "PUT",
          body: JSON.stringify({ secret: key }),
        });
      } catch (e) {
        await reload();
        throw Error(`连接信息已保存，但密钥保存失败：${(e as Error).message}`);
      }
    }
    await reload();
    setSource(undefined);
    setCollapsed((xs) => xs.filter((id) => id !== g.id));
    setNotice(
      additions.length ? `已添加 ${additions.length} 个模型` : "厂商信息已更新",
    );
  }
  const matches = (
    m: Pick<ConfiguredModel, "name" | "identifier" | "lineage">,
    g: ModelService,
  ) =>
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
        <p>集中管理模型来源、连接信息与可选模型。</p>
        <div className="mr-actions">
          <button
            className="ad-primary"
            onClick={() => {
              setSelectionOnly(false);
              setSource("new");
            }}
          >
            ＋ 添加厂商
          </button>
        </div>
      </div>
      {Object.entries(lifecycle.models)
        .filter(
          ([, f]) => f.references && ["expiring", "retired"].includes(f.status),
        )
        .map(([id, f]) => (
          <div key={id} className={`mm-retirement-banner ${f.status}`}>
            <span>
              <b>{doc.models.find((m) => m.id === id)?.name || id}</b>{" "}
              {f.status === "retired"
                ? "已到厂商停用日期"
                : "将于 " + f.shutdownDate + " 停用"}{" "}
              · 影响 {f.references} 处引用
            </span>
            <button
              className="sc-secondary"
              onClick={() => {
                const model = doc.models.find((m) => m.id === id);
                if (model) setMaintenance({ source: model, action: "replace" });
              }}
            >
              去更换
            </button>
          </div>
        ))}
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
              {checkMessages[g.id] && (
                <p role="status" style={{ margin: "8px 0 0", fontSize: 13 }}>
                  {checkMessages[g.id]}
                </p>
              )}
            </div>
            <div className="mr-group-controls">
              {g.configured === false &&
                !["无", "无需鉴权"].includes(g.auth) && (
                  <button
                    onClick={() => {
                      setConfiguring(g);
                      setSecret("");
                      setConfigError("");
                    }}
                  >
                    配置密钥
                  </button>
                )}
              <small>
                {configuredModels.filter((m) => m.serviceId === g.id).length}{" "}
                个模型
              </small>
              <button
                disabled={checking}
                onClick={() =>
                  void checkModels(
                    doc.models
                      .filter((m) => m.serviceId === g.id && matches(m, g))
                      .map((m) => m.id),
                    g.id,
                  )
                }
              >
                {checking ? "检查中…" : "检查模型版本"}
              </button>
              <button
                aria-label={`编辑 ${g.name}`}
                onClick={() => {
                  setSelectionOnly(false);
                  setSource(g);
                }}
              >
                编辑
              </button>
              <button
                role="switch"
                className="mr-switch"
                aria-label={`启用厂商 ${g.name}`}
                aria-checked={g.enabled}
                disabled={busy.includes(`toggle:${g.id}`)}
                onClick={() => {
                  void action(`toggle:${g.id}`, async () => {
                    await save({
                      ...doc,
                      services: doc.services.map((s) =>
                        s.id === g.id ? { ...s, enabled: !s.enabled } : s,
                      ),
                    });
                  });
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
                        <Fragment key={m.id}>
                          <tr className={m.offline ? "mr-offline" : ""}>
                            <td>
                              <code>{m.identifier}</code>
                              {lifecycle.models[m.id] &&
                                ["expiring", "retired"].includes(
                                  lifecycle.models[m.id].status,
                                ) && (
                                  <small
                                    className={`mm-model-tag ${lifecycle.models[m.id].status} ${!lifecycle.models[m.id].references ? "unused" : ""}`}
                                  >
                                    {lifecycle.models[m.id].status === "retired"
                                      ? "已下线"
                                      : "即将停用"}
                                    {!lifecycle.models[m.id].references
                                      ? " · 未被引用"
                                      : ""}
                                  </small>
                                )}

                              {m.offline && (
                                <span className="mr-danger-tag">已下线</span>
                              )}
                              {m.name !== m.identifier && (
                                <strong>{m.name}</strong>
                              )}
                              {m.lineage && <small>{m.lineage}</small>}
                            </td>
                            <td>
                              <div className="mr-pills">
                                {modelFacts(m).map((c) => (
                                  <span key={c}>{c}</span>
                                ))}
                              </div>
                            </td>
                            <td>{m.contextK ? `${m.contextK}K` : "未提供"}</td>
                            <td>
                              {m.offline ? (
                                "—"
                              ) : m.pricing === "免费" ? (
                                <strong>内部</strong>
                              ) : (
                                <>
                                  <span>
                                    输入 {m.currency === "USD" ? "$" : "¥"}
                                    {m.inputPrice ?? "未知"} / 输出{" "}
                                    {m.currency === "USD" ? "$" : "¥"}
                                    {m.outputPrice ?? "未知"}
                                  </span>
                                  <small>每千 tokens</small>
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
                                disabled={
                                  !!m.offline || busy.includes(`toggle:${m.id}`)
                                }
                                onClick={() => {
                                  void action(`toggle:${m.id}`, async () => {
                                    await save({
                                      ...doc,
                                      models: doc.models.map((x) =>
                                        x.id === m.id
                                          ? { ...x, enabled: !x.enabled }
                                          : x,
                                      ),
                                    });
                                  });
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
                                  disabled={probes[m.id]?.busy}
                                  onClick={async () => {
                                    setProbes((current) => ({
                                      ...current,
                                      [m.id]: {
                                        busy: true,
                                        message: "正在调用模型，请稍候…",
                                      },
                                    }));
                                    try {
                                      const result = await request<{
                                        actualModel: string;
                                        testedAt: string;
                                      }>(
                                        `/models/${m.id}/test`,
                                        { method: "POST" },
                                        35000,
                                      );
                                      setProbes((current) => ({
                                        ...current,
                                        [m.id]: {
                                          busy: false,
                                          message: `连接测试成功 · 实际模型：${result.actualModel} · ${new Date(result.testedAt).toLocaleString()}`,
                                        },
                                      }));
                                    } catch (e) {
                                      setProbes((current) => ({
                                        ...current,
                                        [m.id]: {
                                          busy: false,
                                          failed: true,
                                          message: `连接测试失败：${(e as Error).message}`,
                                        },
                                      }));
                                    }
                                  }}
                                >
                                  {probes[m.id]?.busy
                                    ? "正在测试…"
                                    : "连接测试"}
                                </button>
                                <button
                                  onClick={() => {
                                    const model = doc.models.find(
                                      (x) => x.id === m.id,
                                    );
                                    if (model)
                                      setMaintenance({
                                        source: model,
                                        action: "replace",
                                      });
                                  }}
                                >
                                  更换模型
                                </button>
                                <button
                                  className="mr-delete"
                                  onClick={() => {
                                    const model = doc.models.find(
                                      (x) => x.id === m.id,
                                    );
                                    if (model)
                                      setMaintenance({
                                        source: model,
                                        action: "delete",
                                      });
                                  }}
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          {probes[m.id] && (
                            <tr
                              className={`ms-probe-result ${probes[m.id].failed ? "error" : ""}`}
                            >
                              <td
                                colSpan={7}
                                role={probes[m.id].failed ? "alert" : "status"}
                              >
                                {probes[m.id].message}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
              <button
                className="sc-secondary mr-add-model"
                onClick={() => {
                  setSelectionOnly(true);
                  setSource(g);
                }}
              >
                选择模型
              </button>
            </>
          )}
        </section>
      ))}
      {!groups.length && <div className="mr-empty">没有匹配的模型</div>}
      {error && (
        <div className="sc-warning" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="ms-feedback" role="status">{notice}</div>}
      {maintenance && (
        <ModelMaintenanceDialog
          source={maintenance.source}
          doc={doc}
          action={maintenance.action}
          close={() => setMaintenance(undefined)}
          changed={async () => {
            await reload();
            await loadLifecycle();
            window.dispatchEvent(new Event("beivymate-models-changed"));
          }}
          upgrade={() =>
            setMaintenance({ source: maintenance.source, action: "replace" })
          }
          key={maintenance.action + maintenance.source.id}
        />
      )}
      {source && (
        <ModelSourceDialog
          initial={source === "new" ? undefined : source}
          selectionOnly={selectionOnly}
          existingModels={doc.models
            .filter((m) => source !== "new" && m.serviceId === source.id)
            .map((m) => m.identifier)}
          close={() => setSource(undefined)}
          save={saveSource}
        />
      )}
      {editing && (
        <ModelRegistryEditor
          initial={editing}
          close={() => setEditing(undefined)}
          save={async (m) => {
            await save({
              ...doc,
              models: doc.models.map((x) => (x.id === m.id ? modelPayload(m) : x)),
            });
            setEditing(undefined);
            setNotice("模型已保存");
          }}
        />
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
              onClick={() =>
                void action("configure", async () => {
                  if (!secret.trim()) {
                    setConfigError("请先填写密钥");
                    return;
                  }
                  try {
                    await request(
                      `/models/services/${configuring.id}/credential`,
                      { method: "PUT", body: JSON.stringify({ secret }) },
                    );
                    await request(
                      `/models/services/${configuring.id}/discover`,
                      { method: "POST" },
                      305000,
                    );
                    await reload();
                    setConfiguring(undefined);
                    setSecret("");
                    setNotice("凭据已保存，目录连接成功");
                  } catch (e) {
                    await reload();
                    setConfigError((e as Error).message);
                  }
                })
              }
            >
              {busy.includes("configure") ? "测试中…" : "测试连接"}
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
