import {
  blankSkill,
  seedSkills,
  demoModels,
  defaultModelId,
  defaultModelPreference,
  isModelEnabled,
  tierModels,
  tiers,
  type DemoSkill,
  type SkillRole,
} from "./skill-package-demo";

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
export function seedWorkflowSkills(): DemoSkill[] {
  return [
    ...seedSkills(),
    ...[
      ["test_execution", "测试执行", "▶️"],
      ["test_report", "测试报告", "📊"],
      ["test_plan", "测试计划", "📋"],
      ["test_execution_plan", "执行计划", "🗓️"],
      ["defect_submission", "缺陷提交", "🐞"],
      ["defect_verification", "缺陷验证", "🔎"],
      ["regression_testing", "回归测试", "🔁"],
      ["release_notification", "发布通知", "📣"],
      ["requirement_analysis", "客户需求分析", "💡"],
      ["prototype_design", "原型设计", "🎨"],
      ["code_review_helper", "代码评审", "🧑‍💻"],
      ["test_case_gen", "用例补充", "🧪"],
      ["release_checklist", "发布核对", "✅"],
    ].map(([id, name, icon]) => ({
      ...blankSkill("common"),
      id,
      name,
      icon,
      state: "published" as const,
      source: "custom" as const,
      roles: ["common" as const],
      description: `按照团队约定完成${name}，整理输入依据、处理结论与需要确认的事项。`,
      body: `# ${name}\n\n根据上一步提供的输入执行工作，输出可审阅的结果。`,
      updated: "今天",
      calls: 0,
    })),
  ];
}
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
export function seedWorkflowDesigns(): WorkflowDesign[] {
  const definitions = [
    {
      id: "requirement-test",
      name: "需求测试",
      description: "从需求理解到测试报告的完整需求测试流程。",
      roles: ["tester"],
      finalOutput: "测试报告",
      ids: [
        "requirement_understand",
        "test_analysis",
        "test_design",
        "test_execution",
        "test_report",
      ],
    },
    {
      id: "integration-test",
      name: "集成测试",
      description: "覆盖计划、执行、缺陷闭环、回归与发布通知。",
      roles: ["tester", "operations"],
      finalOutput: "集成测试报告与发布通知",
      ids: [
        "test_plan",
        "test_execution_plan",
        "test_execution",
        "defect_submission",
        "defect_verification",
        "regression_testing",
        "test_report",
        "release_notification",
      ],
    },
    {
      id: "customer-prototype",
      name: "客户需求分析和原型",
      description: "将客户需求分析结论转化为可评审的产品原型。",
      roles: ["product"],
      finalOutput: "原型稿",
      ids: ["requirement_analysis", "prototype_design"],
    },
    {
      id: "builtin-code-review",
      name: "代码评审流水线",
      description: "代码质量检查、测试用例补充与发布核对流程。",
      roles: ["developer"],
      finalOutput: "发布检查结论",
      ids: ["code_review_helper", "test_case_gen", "release_checklist"],
    },
  ];
  return definitions.map((d, index) => ({
    ...d,
    roles: d.roles as SkillRole[],
    source: index === 3 ? "builtin" : "custom",
    enabled: index !== 2,
    updated: index ? "昨天" : "今天",
    skills: d.ids,
    steps: d.ids.map((id, i) => ({
      ...newStep(id, i),
      confirmation: [
        "test_execution",
        "regression_testing",
        "release_notification",
      ].includes(id)
        ? "auto"
        : "human",
      model: index === 0 && i === 1 ? "tier:质量优先" : "default",
    })),
    tasks:
      index === 0
        ? [
            { name: "V3.2 需求测试 · 冒烟", status: "执行中" },
            { name: "V3.2 需求测试 · 全量", status: "待确认" },
          ]
        : index === 1
          ? [{ name: "发版前集成验证", status: "待确认" }]
          : [],
  }));
}
export function resolvedModel(step: WorkflowStep, skills: DemoSkill[]) {
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
  return demoModels.find((m) => m.id === id);
}
export function stepErrors(step: WorkflowStep, skills: DemoSkill[]): string[] {
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
export function workflowErrors(
  w: WorkflowDesign,
  skills: DemoSkill[],
): string[] {
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
