import { request } from "../../api";
import {
  configuredModels,
  modelServices,
  tierModels,
  backupModels,
  setDefaultModelId,
  type ConfiguredModel,
} from "./skill-state";
export type Service = {
  id: string;
  name: string;
  protocol: "openai_compatible" | "ollama";
  endpoint: string;
  auth: "key" | "none";
  enabled: boolean;
  selfCert: boolean;
  apiKeyEnv?: string | null;
  kind?: "厂商直连" | "聚合平台" | "模型平台" | "公司本地" | "自定义";
  configured?: boolean;
  credentialError?: string;
};
export type Model = {
  unavailableReason?: string;
  lineage?: string;
  pricing?: ConfiguredModel["pricing"];
  registryTier?: ConfiguredModel["registryTier"] | null;
  registryCapabilities?: string[] | null;
  providedCapabilities?: string[] | null;
  capabilitySource?: ConfiguredModel["capabilitySource"];
  calibrations?: ConfiguredModel["calibrations"];
  id: string;
  serviceId: string;
  identifier: string;
  name: string;
  enabled: boolean;
  capabilities: string[];
  orientation: "质量优先" | "均衡" | "速度优先";
  contextK?: number | null;
  priceUnit?: number;
  inputPrice?: number | null;
  outputPrice?: number | null;
  currency: "CNY" | "USD";
};
export type Catalog = {
  services: Service[];
  models: Model[];
  defaults: { general: string; chat: string; skill: string };
  tiers: Record<string, string>;
  backups: Record<string, string[]>;
  failover: {
    strategy: "error" | "same" | "cross";
    retries: number;
    timeout: number;
    triggers: string[];
  };
  missingModels: Record<string, string>;
  budget: number;
  budgetAlert: boolean;
  revision: string;
};
export function hydrateModels(doc: Catalog) {
  modelServices.splice(
    0,
    modelServices.length,
    ...doc.services.map((s) => ({
      ...s,
      protocol: s.protocol === "ollama" ? "Ollama" : "OpenAI 兼容",
      auth: s.auth === "none" ? "无" : "API Key",
      kind:
        s.kind ||
        (s.protocol === "ollama"
          ? ("公司本地" as const)
          : ("厂商直连" as const)),
    })),
  );
  configuredModels.splice(
    0,
    configuredModels.length,
    ...doc.models.map((m) => {
      const service = doc.services.find((s) => s.id === m.serviceId)!;
      return {
        ...m,
        contextK: m.contextK ?? undefined,
        inputPrice:
          m.inputPrice == null
            ? undefined
            : (m.inputPrice * 1000) / (m.priceUnit || 1000),
        outputPrice:
          m.outputPrice == null
            ? undefined
            : (m.outputPrice * 1000) / (m.priceUnit || 1000),
        provider: service.name,
        endpoint: service.endpoint,
        deployment: service.protocol === "ollama" ? "本地" : "云端",
        pricing: m.pricing || "付费",
        inputs: ["文本"],
        quota: "",
        connection: "未验证",
        connectionSimulated: false,
        capabilitySource: m.capabilitySource || "unknown",
        registryCapabilities: m.registryCapabilities ?? undefined,
        providedCapabilities: m.providedCapabilities ?? undefined,
        registryTier: m.registryTier ?? undefined,
      } as ConfiguredModel;
    }),
  );
  Object.assign(tierModels, doc.tiers);
  Object.assign(backupModels, doc.backups);
  setDefaultModelId(doc.defaults.skill || doc.defaults.general);
}
async function withLifecycle(doc: Catalog) {
  const lifecycle = await request<{
    models: Record<string, { status: string }>;
  }>("/models/lifecycle");
  doc.models.forEach((m) => {
    m.unavailableReason =
      lifecycle.models[m.id]?.status === "retired" ? "厂商已停用" : undefined;
  });
  hydrateModels(doc);
  configuredModels.forEach((m) => {
    m.offline = lifecycle.models[m.id]?.status === "retired";
  });
  return doc;
}
export async function loadModelLibrary() {
  return withLifecycle(await request<Catalog>("/models"));
}
export async function saveModelLibrary(doc: Catalog) {
  const saved = await request<Catalog>("/models", {
    method: "PUT",
    body: JSON.stringify({
      ...doc,
      models: doc.models.map(({ unavailableReason, ...model }) => {
        void unavailableReason;
        return model;
      }),
      services: doc.services.map(({ configured, credentialError, ...s }) => {
        void configured;
        void credentialError;
        return s;
      }),
    }),
  });
  window.dispatchEvent(new Event("beivymate-models-changed"));
  return withLifecycle(saved);
}

export function servicePayload(
  s: import("./skill-state").ModelService,
): Service {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    endpoint: s.endpoint,
    protocol:
      s.protocol === "Ollama" || s.protocol === "ollama"
        ? "ollama"
        : "openai_compatible",
    auth: ["无", "无需鉴权", "none"].includes(s.auth) ? "none" : "key",
    selfCert: !!s.selfCert,
    enabled: s.enabled,
    apiKeyEnv: (s as Service).apiKeyEnv,
  };
}
export function modelPayload(m: ConfiguredModel): Model {
  return {
    id: m.id,
    serviceId: m.serviceId,
    identifier: m.identifier,
    name: m.name,
    enabled: m.enabled,
    capabilities: ["text", ...m.capabilities.filter((c) => c !== "text")],
    orientation: m.orientation,
    contextK: m.contextK ?? null,
    priceUnit: 1000,
    inputPrice: m.inputPrice ?? null,
    outputPrice: m.outputPrice ?? null,
    currency: m.currency === "USD" ? "USD" : "CNY",
    lineage: m.lineage || "",
    pricing: m.pricing,
    registryTier: m.registryTier,
    registryCapabilities: m.registryCapabilities,
    providedCapabilities: m.providedCapabilities,
    capabilitySource: m.capabilitySource,
    calibrations: m.calibrations,
  };
}
export async function discoverConnection(
  s: import("./skill-state").ModelService,
  secret?: string,
  signal?: AbortSignal,
) {
  return request<{ models: string[]; note: string }>(
    "/models/connection/discover",
    {
      method: "POST",
      body: JSON.stringify({ service: servicePayload(s), secret }),
      signal,
    },
    35000,
  );
}
