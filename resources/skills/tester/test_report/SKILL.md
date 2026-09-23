---
id: test_report
name: 测试报告
description: 独立完成测试报告，输出可追溯的结构化产物。
role: tester
version: "2"
executor: test_report
model: null
inputs:
  - test_execution
outputs:
  - test_report
  - test_report_data
  - test_report_word
---

# 测试报告

依据输入和可核验的证据完成本环节。保留来源、未知项及未完成范围，不编造业务规则或执行结果。只完成本环节，不自动执行其他技能。输出必须满足系统产物契约。

## 模型与模板

model 引用模型配置标识；null 使用 Agent 默认模型。模板位于本包 templates 目录，按交付语言选取。结果仍须经过结构校验及工作流确认。

## 产物：test_report

- 文件名：test_report.md
- 必需：是
- 归属：任务
- 工作资产：是
- 允许编辑：是
- 知识沉淀：询问

## 产物：test_report_data

- 文件名：test_report.json
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：否
- 知识沉淀：不适用

## 产物：test_report_word

- 文件名：test_report.docx
- 必需：是
- 归属：任务
- 工作资产：是
- 允许编辑：是
- 知识沉淀：不适用
