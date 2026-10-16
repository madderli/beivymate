import {
  configuredModels,
  defaultModelId,
  defaultModelPreference,
  isModelEnabled,
  tierModels,
  tiers,
  type Skill,
  type SkillRole,
  type SkillWorkflow,
} from "../skills/skill-state";

export type WorkflowStep = {
  id: string;
  skill: string;
  input: string;
  output: string;
  confirmation: "human" | "auto";
  model: string;
};
export type WorkflowDesign = {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "custom";
  enabled: boolean;
  roles: SkillRole[];
  finalOutput: string;
  updated: string;
  steps: WorkflowStep[];
  skills: string[];
  tasks: { name: string; status: "执行中" | "待确认" | "已暂停" | "已完成" }[];
};
export function newStep(skill = "", index = 0): WorkflowStep {
  return {
    id: crypto.randomUUID(),
    skill,
    input: index ? "previous" : "workflow",
    output: `step${index + 1}_output`,
    confirmation: "human",
    model: "default",
  };
}
export function migrateWorkflows(items: SkillWorkflow[]): WorkflowDesign[] {
  return items.map((w) => ({
    ...w,
    description: "按顺序组织技能的输入、输出与确认节点。",
    source: "custom",
    enabled: true,
    roles: ["tester"],
    finalOutput: "工作流结果",
    updated: "刚刚",
    steps: w.skills.map((id, i) => newStep(id, i)),
  }));
}
export function isWorkflowLibrary(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const w = item as Partial<WorkflowDesign>;
      return (
        typeof w.id === "string" &&
        typeof w.name === "string" &&
        typeof w.description === "string" &&
        typeof w.enabled === "boolean" &&
        (w.source === "builtin" || w.source === "custom") &&
        typeof w.finalOutput === "string" &&
        typeof w.updated === "string" &&
        Array.isArray(w.roles) &&
        w.roles.every((r) =>
          ["tester", "product", "developer", "operations", "common"].includes(
            r,
          ),
        ) &&
        Array.isArray(w.skills) &&
        w.skills.every((s) => typeof s === "string") &&
        Array.isArray(w.steps) &&
        w.steps.every(
          (s) =>
            s &&
            typeof s.id === "string" &&
            typeof s.skill === "string" &&
            typeof s.input === "string" &&
            typeof s.output === "string" &&
            typeof s.model === "string" &&
            ["human", "auto"].includes(s.confirmation),
        ) &&
        Array.isArray(w.tasks) &&
        w.tasks.every(
          (t) =>
            t &&
            typeof t.name === "string" &&
            ["执行中", "待确认", "已暂停", "已完成"].includes(t.status),
        )
      );
    })
  );
}
export function resolvedModel(step: WorkflowStep, skills: Skill[]) {
  const skill = skills.find((s) => s.id === step.skill);
  const p = skill?.modelPreference || defaultModelPreference();
  if (step.model === "default" && p.mode === "none") return undefined;
  const id = step.model.startsWith("model:")
    ? step.model.slice(6)
    : step.model.startsWith("tier:")
      ? tierModels[step.model.slice(5)]
      : p.mode === "specific"
        ? p.model
        : p.mode === "tier"
          ? tierModels[p.tier!]
          : defaultModelId;
  return configuredModels.find((m) => m.id === id);
}
export function stepErrors(step: WorkflowStep, skills: Skill[]): string[] {
  const skill = skills.find((s) => s.id === step.skill);
  if (!skill || skill.state !== "published")
    return ["请选择已发布的技能，草稿、停用和校验失败的技能不可引用。"];
  const p = skill.modelPreference || defaultModelPreference();
  if (step.model === "default" && p.mode === "none") return [];
  const m = resolvedModel(step, skills);
  if (!m || !isModelEnabled(m))
    return ["模型不可用，请检查档位映射或替换模型。"];
  const errors: string[] = [];
  if (p.capabilities.some((c) => !m.capabilities.includes(c)))
    errors.push("所选模型不满足技能声明的能力要求。");
  if (p.minTier && p.minTier !== "不限制") {
    const selectedTier = step.model.startsWith("tier:")
      ? step.model.slice(5)
      : m.orientation;
    if (
      tiers.indexOf(selectedTier as (typeof tiers)[number]) >
      tiers.indexOf(p.minTier)
    )
      errors.push(`模型覆盖不能低于技能最低档位：${p.minTier}。`);
  }
  return errors;
}
export function workflowErrors(w: WorkflowDesign, skills: Skill[]): string[] {
  const errors: string[] = [];
  if (!w.name.trim()) errors.push("请输入工作流名称。");
  if (!w.roles.length) errors.push("请至少选择一个适用角色。");
  if (!w.steps.length) errors.push("请至少添加一个步骤。");
  const outputs = new Set<string>();
  w.steps.forEach((step, i) => {
    stepErrors(step, skills).forEach((e) => errors.push(`步骤 ${i + 1}：${e}`));
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(step.output))
      errors.push(
        `步骤 ${i + 1}：输出命名须以字母开头，仅含字母、数字和下划线。`,
      );
    if (outputs.has(step.output)) errors.push(`步骤 ${i + 1}：输出命名重复。`);
    outputs.add(step.output);
    const previous = w.steps.slice(0, i);
    if (
      step.input !== "workflow" &&
      !(step.input === "previous" && i > 0) &&
      !previous.some((p) => `step:${p.id}` === step.input)
    )
      errors.push(`步骤 ${i + 1}：输入来源已失效，请选择当前步骤之前的输出。`);
  });
  return errors;
}
