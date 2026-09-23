---
id: test_execution
name: 测试执行
description: 独立完成测试执行，输出可追溯的结构化产物。
role: tester
version: "2"
executor: test_execution
model: null
inputs:
  - completed_execution_round
outputs:
  - test_execution
  - execution_results
  - defects
  - execution_history
---

# 测试执行

依据输入和可核验的证据完成本环节。保留来源、未知项及未完成范围，不编造业务规则或执行结果。只完成本环节，不自动执行其他技能。输出必须满足系统产物契约。

## 模型与模板

本技能使用执行服务读取已完成轮次，不调用模型；model 保持 null。本包 templates 目录中的执行计划、缺陷 Markdown 是参考资料，不参与执行器渲染。修改这些资料不会改变导出列或执行行为；执行结果与缺陷表格按程序契约生成。结果仍须经过结构校验及工作流确认。

## 产物：test_execution

- 文件名：test_execution.json
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：否
- 知识沉淀：不适用

## 产物：execution_results

- 文件名：test_execution.xlsx
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：否
- 知识沉淀：不适用

## 产物：defects

- 文件名：test_execution_defects.xlsx
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：否
- 知识沉淀：不适用

## 产物：execution_history

- 文件名：test_execution_history.json
- 必需：是
- 归属：任务
- 工作资产：否
- 允许编辑：否
- 知识沉淀：不适用
