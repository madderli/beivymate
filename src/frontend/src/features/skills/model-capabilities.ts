import type { ConfiguredModel } from "./skill-state";
export const capabilityGroups = [
  { name: "输入理解", items: ["视觉理解", "音频理解"] },
  { name: "推理", items: ["深度推理"] },
  { name: "代码", items: ["代码能力"] },
  { name: "上下文", items: ["32K上下文", "128K上下文", "1M上下文"] },
  { name: "工具协同", items: ["函数调用", "联网搜索"] },
  { name: "输出形态", items: ["结构化输出（JSON）", "图像生成", "语音合成"] },
  { name: "部署属性", items: ["本地运行", "开源权重"] },
];
const aliases: Record<string, string> = {
  推理: "深度推理",
  代码: "代码能力",
  视觉: "视觉理解",
  长上下文: "128K上下文",
};
export function contextCapability(k?: number) {
  return !k || k < 32
    ? ""
    : k >= 1000
      ? "1M上下文"
      : k >= 128
        ? "128K上下文"
        : "32K上下文";
}
export function modelFacts(m: ConfiguredModel): string[] {
  const values =
    m.registryCapabilities !== undefined
      ? m.registryCapabilities
          .map((c) => aliases[c] || c)
          .filter((c) => c !== "对话")
      : [
          ...(m.capabilities.includes("images") ? ["视觉理解"] : []),
          ...(m.inputs.includes("音频") ? ["音频理解"] : []),
          ...(m.capabilities.includes("tools") ? ["函数调用"] : []),
          ...(m.capabilities.includes("structured")
            ? ["结构化输出（JSON）"]
            : []),
          ...(m.deployment === "本地" ? ["本地运行"] : []),
        ];
  return [
    ...new Set(
      [
        ...values.filter((c) => !c.endsWith("上下文")),
        contextCapability(m.contextK),
      ].filter(Boolean),
    ),
  ];
}
export function matchesCapabilities(m: ConfiguredModel, filters: string[]) {
  const caps = modelFacts(m);
  return filters.every((c) =>
    c === "32K上下文"
      ? (m.contextK || 0) >= 32
      : c === "128K上下文"
        ? (m.contextK || 0) >= 128
        : c === "1M上下文"
          ? (m.contextK || 0) >= 1000
          : caps.includes(c),
  );
}
export function syncCapabilityFields(m: ConfiguredModel): ConfiguredModel {
  const caps = modelFacts(m);
  return {
    ...m,
    registryCapabilities: caps,
    capabilities: [
      ...(caps.includes("视觉理解") ? ["images"] : []),
      ...(caps.includes("函数调用") ? ["tools"] : []),
      ...(caps.includes("结构化输出（JSON）") ? ["structured"] : []),
    ],
    inputs: [
      "文本",
      ...(caps.includes("视觉理解") ? ["图像"] : []),
      ...(caps.includes("音频理解") ? ["音频"] : []),
    ],
  };
}
