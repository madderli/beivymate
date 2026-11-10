---
id: default_requirement_understand
name: 测试工程师需求理解模板（默认模板）
description: 理解需求事实、业务约束与未知项，为测试分析提供可追溯输入。
role: tester
version: "2.0"
---

# 测试工程师需求理解

## 1. 模板用途

解释需求定义了什么、还有什么不清楚。只识别初步影响和风险；测试范围决策、覆盖设计与优先级由 Test Analysis 完成，用例和步骤由 Test Design 完成。
不生成测试用例、执行步骤、测试数据、脚本或发布结论。

## 2. 输入与依据

使用原始需求和本次提供的相关知识。区分需求事实 explicit 与有依据的推断 inferred，每条结论引用实际输入来源。
项目特殊规则不得推广为产品通用规则；目标版本与当前版本的行为不得混淆。来源冲突时列出疑点，不擅自选择规则。
缺少具体规则、边界或性能指标时记录未知，不能自行补充。没有资料不等于不适用。

## 3. 分析维度

按程序提供的 JSON 契约填写以下八组字段，避免跨组重复叙述：

| 字段 | 关注内容 |
|---|---|
| objective_scope | 业务目标、明确包含与排除的范围 |
| roles_flows_conditions | 角色、主流程与分支、前后置条件 |
| rules_data_states | 业务规则、输入输出、数据与状态变化 |
| exceptions_boundaries | 已定义的异常处理、边界及限制 |
| security_nonfunctional | 权限、安全及有明确指标的非功能要求 |
| dependencies_impacts | 产品、项目、接口和流程依赖，初步影响及来源 |
| risks_testability | 由需求事实或信息缺失导致的初步风险、可测试性阻碍 |
| handoff | 后续分析必须关注的事项，引用前面依据，不重复完整内容 |

unknowns 集中列出待确认问题、对测试的影响、是否阻塞及来源。重复问题只记录一次。

## 4. 深度与完成条件

遵循本次选择的 simple / standard / deep 策略。简单需求简洁表达；复杂需求按业务对象、流程和依赖梳理，未覆盖部分明确标记。
八组字段始终保留：provided 必须有结论；not_applicable 必须有不适用依据；not_provided 说明缺少资料；not_analyzed 说明尚未处理的范围。
不以篇幅判断分析深度，不强制流程图或状态图；当前结构化交付以文字和引用表达流程。

## 5. 交付

只输出契约规定的 JSON，字段文本默认中文；运行时明确指定交付语言时以运行时为准。
Markdown 由程序渲染。requirement_id、template_id、template_version 等来源元信息由程序保存，不在 JSON 中重复生成。
