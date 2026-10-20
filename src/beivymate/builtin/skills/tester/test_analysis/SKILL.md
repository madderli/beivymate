---
id: test_analysis
name: 测试分析
description: 独立完成测试分析，输出可追溯的结构化产物。
role: tester
version: "1"
executor: test_analysis
model: null
analysis_strategies:
  - simple
  - standard
  - deep
default_analysis_strategy: standard
inputs:
  - requirement
  - requirement_understanding
outputs:
  - test_analysis
---

# 测试分析

依据输入和可核验的证据完成本环节。保留来源、未知项及未完成范围，不编造业务规则或执行结果。只完成本环节，不自动执行其他技能。输出必须满足系统产物契约。

## 分析深度

- 简要：聚焦直接相关规则和未知项，必要产物字段仍需保留。
- 标准：检查常规维度、主要流程与替代流程。
- 深入：进一步检查跨产品依赖、项目例外、版本变化及未处理范围。

工作流步骤显式选择优先，其次使用任务默认分析深度，最后使用本技能默认值。

## 模型与模板

model 引用模型配置标识；null 使用 Agent 默认模型。模板位于本包 templates 目录，按交付语言选取。结果仍须经过结构校验及工作流确认。

## 产物：test_analysis

- 文件名：test_analysis.md
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：是
- 知识沉淀：询问
