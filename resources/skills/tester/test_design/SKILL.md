---
id: test_design
name: 测试用例编写
description: 独立完成测试用例编写，输出可追溯的结构化产物。
role: tester
version: "2"
executor: test_design
model: null
inputs:
  - requirement_understanding
  - test_analysis
outputs:
  - test_design
  - test_design_data
  - test_cases
---

# 测试用例编写

依据输入和可核验的证据完成本环节。保留来源、未知项及未完成范围，不编造业务规则或执行结果。只完成本环节，不自动执行其他技能。输出必须满足系统产物契约。

## 模型与模板

model 引用模型配置标识；null 使用 Agent 默认模型。模板位于本包 templates 目录，按交付语言选取。结果仍须经过结构校验及工作流确认。

## 产物：test_design

- 文件名：test_design.md
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：是
- 知识沉淀：询问

## 产物：test_design_data

- 文件名：test_design.json
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：否
- 知识沉淀：不适用

## 产物：test_cases

- 文件名：test_design.xlsx
- 必需：是
- 归属：任务
- 工作资产：是
- 允许编辑：是
- 知识沉淀：不适用
