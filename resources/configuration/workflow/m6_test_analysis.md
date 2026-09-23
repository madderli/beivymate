---
id: m6_test_analysis
name: 需求理解与测试分析
---

使用 TesterAgent.start/resume 执行，每阶段接受后继续。

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
