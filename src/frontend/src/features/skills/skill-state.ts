export const tiers = ["质量优先", "均衡", "速度优先"] as const;
export const tierModels: Record<string, string> = {
  质量优先: "vision",
  均衡: "balanced",
  速度优先: "light",
};
export const backupModels: Record<string, string[]> = {
  质量优先: [],
  均衡: [],
  速度优先: [],
};
export type SkillRole =
  "tester" | "developer" | "product" | "operations" | "common";
export type SkillState =
  "discovered" | "validated" | "draft" | "published" | "paused" | "invalid";
export type ModelPreference = {
  minTier?: "质量优先" | "均衡" | "速度优先" | "不限制";
  mode: "inherit" | "tier" | "specific" | "none";
  tier?: (typeof tiers)[number];
  model: string;
  capabilities: string[];
};
export const modelCapabilities = {
  images: "图片理解",
  tools: "工具调用",
  structured: "结构化输出",
};
export type ModelService = {
  id: string;
  name: string;
  kind: "厂商直连" | "模型平台" | "公司本地" | "聚合平台" | "自定义";
  configured?: boolean;
  selfCert?: boolean;
  adapter?: string;
  endpoint: string;
  protocol: string;
  auth: string;
  enabled: boolean;
};
export const modelServices: ModelService[] = [
  {
    id: "vendor",
    name: "厂商服务（演示）",
    kind: "厂商直连",
    endpoint: "https://vendor.example.invalid/v1",
    protocol: "兼容对话接口",
    auth: "访问密钥",
    enabled: true,
    configured: true,
  },
  {
    id: "platform",
    name: "统一模型平台（演示）",
    kind: "模型平台",
    endpoint: "https://platform.example.invalid/v1",
    protocol: "兼容对话接口",
    auth: "访问密钥",
    enabled: true,
    configured: true,
  },
  {
    id: "company",
    name: "公司内网模型服务（演示）",
    kind: "公司本地",
    endpoint: "http://127.0.0.1:11434",
    protocol: "本地模型接口",
    auth: "无需鉴权",
    enabled: true,
    configured: true,
  },
];
export function isModelEnabled(m: ConfiguredModel) {
  return (
    m.enabled &&
    !m.offline &&
    !!modelServices.find((s) => s.id === m.serviceId && s.configured !== false)
      ?.enabled
  );
}
export type ConfiguredModel = {
  providedCapabilities?: string[];
  capabilitySource?: "provider" | "calibrated" | "unknown";
  calibrations?: {
    at: string;
    before: string[];
    after: string[];
    contextK?: number;
    note: string;
  }[];
  registryCapabilities?: string[];
  registryTier?: "旗舰" | "均衡" | "快速" | "不指定";
  contextK?: number;
  inputPrice?: number;
  outputPrice?: number;
  currency?: string;
  lineage?: string;
  offline?: boolean;
  serviceId: string;
  id: string;
  name: string;
  capabilities: string[];
  enabled: boolean;
  provider: string;
  endpoint: string;
  identifier: string;
  deployment: "本地" | "云端";
  pricing: "免费" | "免费额度" | "付费";
  orientation: "速度优先" | "均衡" | "质量优先";
  inputs: string[];
  quota: string;
  connection: "未验证" | "可用" | "连接失败";
  connectionSimulated: boolean;
};
export let defaultModelId = "balanced";
export function setDefaultModelId(id: string) {
  defaultModelId = id;
}
export const configuredModels: ConfiguredModel[] = [
  {
    id: "balanced",
    name: "通用模型（演示）",
    capabilities: ["tools", "structured"],
  },
  {
    id: "vision",
    name: "多模态模型（演示）",
    capabilities: ["images", "tools", "structured"],
  },
  { id: "light", name: "轻量文本模型（演示）", capabilities: ["structured"] },
].map((m) => ({
  ...m,
  contextK: m.id === "light" ? 32 : 128,
  lineage: "演示配置，参数非厂商承诺",
  serviceId: m.id === "light" ? "platform" : "vendor",
  enabled: true,
  provider: "演示服务",
  endpoint: "https://example.invalid/v1",
  identifier: m.id,
  deployment: "云端",
  pricing: m.id === "light" ? "免费额度" : "付费",
  orientation:
    m.id === "light" ? "速度优先" : m.id === "vision" ? "质量优先" : "均衡",
  inputs: m.capabilities.includes("images") ? ["文本", "图像"] : ["文本"],
  quota: m.id === "light" ? "演示额度：每月 100 次，超出后需付费" : "",
  connection: "未验证",
  connectionSimulated: false,
}));
modelServices.push({
  id: "native",
  name: "原生接口厂商（待配置示例）",
  kind: "厂商直连",
  endpoint: "https://native.example.invalid",
  protocol: "Anthropic",
  auth: "访问密钥",
  enabled: true,
  configured: false,
});
configuredModels.push({
  id: "company-qwen",
  serviceId: "company",
  name: "Qwen3 8B（内部部署示例）",
  identifier: "qwen3:8b",
  provider: "公司内网模型服务（演示）",
  endpoint: "http://127.0.0.1:11434",
  capabilities: [],
  enabled: true,
  deployment: "本地",
  pricing: "免费",
  orientation: "均衡",
  inputs: ["文本"],
  quota: "",
  connection: "未验证",
  connectionSimulated: false,
  lineage: "内部部署示例，能力与上下文待验证",
  inputPrice: 0,
  outputPrice: 0,
});
export const defaultModelPreference = (): ModelPreference => ({
  mode: "tier",
  tier: "均衡",
  model: "",
  capabilities: [],
});
export function modelPreferenceErrors(
  value: unknown,
  structureOnly = false,
): string[] {
  if (!value || typeof value !== "object") return ["模型偏好格式不正确。"];
  const p = value as ModelPreference;
  if (
    (p.minTier !== undefined &&
      !["质量优先", "均衡", "速度优先", "不限制"].includes(p.minTier)) ||
    !["inherit", "tier", "specific", "none"].includes(p.mode) ||
    (p.mode === "tier" && !tiers.includes(p.tier as (typeof tiers)[number])) ||
    typeof p.model !== "string" ||
    !Array.isArray(p.capabilities) ||
    p.capabilities.some((c) => !Object.hasOwn(modelCapabilities, c))
  )
    return ["模型偏好包含无效选项。"];
  if (p.mode === "none")
    return p.capabilities.length ? ["不使用模型时不能设置模型能力要求。"] : [];
  if (structureOnly) return [];
  const model = configuredModels.find(
    (m) =>
      m.id ===
      (p.mode === "inherit"
        ? defaultModelId
        : p.mode === "tier"
          ? tierModels[p.tier!]
          : p.model),
  );
  if (!model || !isModelEnabled(model))
    return ["推荐模型在当前环境不可用，请重新选择模型。"];
  return [];
}
export type PackageFile = {
  path: string;
  text?: string;
  content?: string;
  size: number;
};
export type Skill = {
  key: string;
  revision?: string;
  lockedTasks?: string[];
  validationErrors?: string[];
  id: string;
  name: string;
  description: string;
  role: SkillRole;
  roles?: SkillRole[];
  icon?: string;
  calls?: number;
  updated?: string;
  modelPreference?: ModelPreference;
  version: string;
  body: string;
  extraFrontmatter?: string;
  source: "builtin" | "custom";
  state: SkillState;
  files: PackageFile[];
  imported?: boolean;
  basedOn?: string;
};
export const roleNames: Record<SkillRole, string> = {
  tester: "测试",
  developer: "开发",
  product: "产品",
  common: "通用",
  operations: "运维",
};
export const stateNames: Record<SkillState, string> = {
  discovered: "待验证",
  validated: "已验证",
  invalid: "校验失败",
  draft: "草稿",
  published: "启用",
  paused: "停用",
};
export function markdown(s: Skill) {
  return `---\nid: ${s.id}\nname: ${JSON.stringify(s.name)}\ndescription: ${JSON.stringify(s.description)}\nrole: ${s.role}\nversion: ${JSON.stringify(s.version)}\nroles: ${JSON.stringify(s.roles || [s.role])}\nicon: ${JSON.stringify(s.icon || "🧩")}\nmodel_preference: ${JSON.stringify(s.modelPreference || defaultModelPreference())}\n${s.extraFrontmatter ? s.extraFrontmatter + "\n" : ""}---\n\n${s.body}`;
}
export function parseMarkdown(
  text: string,
): Pick<
  Skill,
  | "id"
  | "name"
  | "description"
  | "role"
  | "version"
  | "body"
  | "extraFrontmatter"
  | "roles"
  | "icon"
  | "modelPreference"
> {
  const match = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match)
    throw new Error("SKILL.md 需要以 元数据区 开头，并包含 标记格式正文。");
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (!m || !["id", "name", "description", "role", "version"].includes(m[1]))
      continue;
    if (m[1] in fields) throw new Error(`元数据字段重复：${m[1]}`);
    let value = m[2];
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        throw new Error(`${m[1]} 引号格式不正确`);
      }
    } else if (value.startsWith("'") && value.endsWith("'"))
      value = value.slice(1, -1).replace(/''/g, "'");
    if (typeof value !== "string") throw new Error(`${m[1]} 必须是文本`);
    fields[m[1]] = value.trim();
  }
  fields.id ||=
    fields.name
      ?.toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^[^a-z]+/, "") || `skill_${crypto.randomUUID().slice(0, 8)}`;
  fields.role ||= "common";
  fields.version ||= "1";
  for (const field of ["name", "description"])
    if (!fields[field])
      throw new Error(`缺少必要元数据：${field}（请使用单行字段）`);
  if (
    !["tester", "developer", "product", "operations", "common"].includes(
      fields.role,
    )
  )
    throw new Error("所属角色必须是测试、开发、产品、运维或通用。");
  const rolesLine = match[1].match(/^roles:\s*(.+)$/m);
  const iconLine = match[1].match(/^icon:\s*(.+)$/m);
  const roles = rolesLine ? JSON.parse(rolesLine[1]) : [fields.role];
  if (
    !Array.isArray(roles) ||
    !roles.length ||
    roles.some((r) => !(r in roleNames))
  )
    throw new Error("请选择有效的适用角色。");
  const icon = iconLine ? JSON.parse(iconLine[1]) : "🧩";
  if (typeof icon !== "string") throw new Error("图标格式不正确。");
  const modelLine = match[1].match(/^model_preference:\s*(.+)$/m);
  const modelPreference = modelLine
    ? JSON.parse(modelLine[1])
    : defaultModelPreference();

  const shapeErrors = modelPreferenceErrors(modelPreference, true);
  if (shapeErrors.length) throw new Error(shapeErrors.join("\n"));
  return {
    modelPreference,
    roles,
    icon,
    id: fields.id,
    name: fields.name,
    description: fields.description,
    role: fields.role as SkillRole,
    version: fields.version,
    body: match[2].trim(),
    extraFrontmatter: match[1]
      .split("\n")
      .filter(
        (line) =>
          !/^(id|name|description|role|roles|icon|version|model_preference):/.test(
            line,
          ),
      )
      .join("\n")
      .trim(),
  };
}
export function validateSkill(
  s: Skill,
  role: SkillRole,
  existing: Skill[],
  allowUnreadyModel = false,
): string[] {
  const errors: string[] = modelPreferenceErrors(
    s.modelPreference || defaultModelPreference(),
    allowUnreadyModel,
  );
  if (
    !(s.roles || [s.role]).length ||
    (s.roles || [s.role]).some((r) => !(r in roleNames))
  )
    errors.push("至少选择一个适用角色。");
  if (
    s.files.some(
      (f) =>
        f.path.split("/").at(-1) === "SKILL.md" ||
        f.path.startsWith("/") ||
        f.path.includes("\\") ||
        f.path.split("/").some((p) => p === ".." || p === "."),
    )
  )
    errors.push("资源文件必须位于可选目录内，且不能再包含 SKILL.md 入口。");
  if (new Set(s.files.map((f) => f.path)).size !== s.files.length)
    errors.push("资源文件路径重复。");
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(s.id))
    errors.push(
      "标识需以小写字母开头，使用小写字母、数字、短横线或下划线，长度 2–64。",
    );
  if (!s.name.trim() || !s.description.trim() || !s.body.trim())
    errors.push("名称、描述和 SKILL.md 正文不能为空。");
  if (!/^\d+(?:\.\d+){0,2}(?:-[a-z0-9.-]+)?$/i.test(s.version))
    errors.push("版本号格式不正确，例如 1、1.0 或 1.0.0。");
  if (s.role !== "common" && s.role !== role)
    errors.push(
      `角色不匹配：此包仅允许 ${roleNames[s.role]} 导入和维护，当前为 ${roleNames[role]}。`,
    );
  if (existing.some((k) => k.key === s.key && k.id !== s.id))
    errors.push("已有技能的唯一标识不可修改，以保留工作流引用关系。");
  if (existing.some((k) => k.key !== s.key && k.id === s.id))
    errors.push("技能标识已存在，请为个人副本使用新标识。");
  return errors;
}
export async function readPackage(
  files: File[],
  role: SkillRole,
  existing: Skill[],
): Promise<{ skill: Skill; warnings: string[] }> {
  if (!files.length) throw new Error("请选择 技能文件夹或 SKILL.md。");
  if (
    files.length > 100 ||
    files.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024 ||
    files.some((f) => f.size > 5 * 1024 * 1024)
  )
    throw new Error("最多读取 100 个文件，总计 20 MB，单文件 5 MB。");
  const paths = files.map((f) => f.webkitRelativePath || f.name);
  const entries = paths.filter((p) => p.split("/").at(-1) === "SKILL.md");
  if (entries.length !== 1)
    throw new Error(
      "每个 技能包必须有且只有一个 SKILL.md 入口，请选择单个技能文件夹。",
    );
  const root = entries[0].slice(0, -"SKILL.md".length);
  const warnings: string[] = [];
  const normalized = paths.map((p) => {
    if (
      !p.startsWith(root) ||
      p.includes("\\") ||
      p.split("/").some((part) => part === ".." || part === ".")
    )
      throw new Error("存在包目录之外的文件或非法路径。");
    const relative = p.slice(root.length);
    if (!relative || relative.startsWith("/"))
      throw new Error("非法技能包文件路径。");
    return relative;
  });
  if (new Set(normalized).size !== normalized.length)
    throw new Error("迁移后的文件路径重复，请合并重复文件后重新导入。");
  const entry = files[paths.indexOf(entries[0])];
  const raw = await entry.text();
  const parsed = parseMarkdown(raw);
  const folderRole = root
    .split("/")
    .find((p) => ["tester", "developer", "product", "operations"].includes(p));
  if (folderRole && folderRole !== parsed.role)
    throw new Error("目录角色与 SKILL.md 的 role 不一致，请修正后导入。");
  const loaded: PackageFile[] = await Promise.all(
    files.map(async (f, i) => ({
      path: normalized[i],
      size: f.size,
      text: /\.(md|txt|json|py|js|ts|sh|yaml|yml|csv)$/i.test(f.name)
        ? normalized[i] === "SKILL.md"
          ? raw
          : await f.text()
        : undefined,
      content: /\.(md|txt|json|py|js|ts|sh|yaml|yml|csv)$/i.test(f.name)
        ? undefined
        : btoa(
            Array.from(new Uint8Array(await f.arrayBuffer()), (b) =>
              String.fromCharCode(b),
            ).join(""),
          ),
    })),
  );
  const skill: Skill = {
    ...parsed,
    key: crypto.randomUUID(),
    source: "custom",
    state: "draft",
    imported: true,
    files: loaded.filter((f) => f.path !== "SKILL.md"),
  };
  const errors = validateSkill(skill, role, existing, true);
  if (errors.length) throw new Error(errors.join("\n"));
  return { skill, warnings: [...new Set(warnings)] };
}
export function blankSkill(role: SkillRole): Skill {
  return {
    key: crypto.randomUUID(),
    id: "",
    name: "",
    description: "",
    role,
    roles: [role],
    icon: "🔍",
    calls: 0,
    updated: new Date().toLocaleString("zh-CN", { hour12: false }),
    version: "1.0.0",
    body: "# 工作目标\n\n描述技能要完成的工作。\n\n## 执行步骤\n\n1. 检查输入材料。\n2. 按业务规则处理。\n3. 输出结果与待确认事项。\n\n## 约束\n\n不编造缺失的信息。\n\n## 输出\n\n明确产物格式与保存要求。",
    source: "custom",
    state: "draft",
    files: [],
  };
}
export type SkillWorkflow = {
  id: string;
  name: string;
  skills: string[];
  tasks: { name: string; status: "执行中" | "待确认" | "已暂停" | "已完成" }[];
};
export function seedWorkflows(): SkillWorkflow[] {
  return [
    {
      id: "payment",
      name: "支付异常验证",
      skills: ["payment_review", "requirement_understand"],
      tasks: [
        { name: "支付回调异常验证", status: "执行中" },
        { name: "退款一致性复核", status: "待确认" },
      ],
    },
    {
      id: "regression",
      name: "版本回归验证",
      skills: ["payment_review", "test_analysis", "test_design"],
      tasks: [
        { name: "上个版本回归", status: "已完成" },
        { name: "本轮兼容性验证", status: "已暂停" },
      ],
    },
  ];
}

export const failover = {
  strategy: "same",
  retries: 1,
  timeout: 60,
  triggers: ["超时", "接口报错", "限流 429"],
};
