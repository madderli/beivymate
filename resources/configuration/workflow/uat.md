---
id: uat
name: 用户验收测试
description: 从需求理解到测试报告的用户验收流程。
---

# 用户验收测试

调整顺序时请检查输入关联。结果默认由人类确认，发布决定始终由人类作出。

## 步骤：understand
- 技能：requirement_understand
- 输入：requirement
- 执行授权：自动
- 结果确认：人工

## 步骤：analyze
- 技能：test_analysis
- 输入：requirement、steps.understand.requirement_understanding
- 执行授权：自动
- 结果确认：人工

## 步骤：design
- 技能：test_design
- 输入：steps.analyze.test_analysis
- 执行授权：自动
- 结果确认：人工

## 步骤：execute
- 技能：test_execution
- 执行授权：自动
- 结果确认：人工

## 步骤：report
- 技能：test_report
- 输入：steps.understand.requirement_understanding、steps.analyze.test_analysis、steps.design.test_design、steps.execute.test_execution
- 执行授权：自动
- 结果确认：人工
