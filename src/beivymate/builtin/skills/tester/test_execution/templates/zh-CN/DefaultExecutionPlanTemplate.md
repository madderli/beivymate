> 用途：参考资料。此文件用于了解字段，不参与执行器渲染；修改内容不会改变执行计划、缺陷或执行结果的导出格式。

# 默认测试执行计划（可运行示例）

本示例仅用于本地流程验证。实际使用请替换下方 JSON 中的任务、人员、环境、版本与已接受用例快照。
程序只读取 JSON 代码块；正文为说明。也可从测试设计自动生成 plan-N.md 后编辑。
mode 为 manual 或 automated，决定本轮执行方式；defect_mode 为 manual 或 auto（仅本地登记）。
用例 case 中的内容、编号、修订和接受状态应来自真实资产，不应自行假定已接受。

```json
{
  "id": "example-plan",
  "task_id": "T",
  "name": "示例：手工支付验证",
  "source": "customer-plan",
  "items": [
    {
      "id": "payment-manual",
      "case": {
        "title": "支付",
        "description": "验证支付",
        "preconditions": "订单存在",
        "priority": "P1",
        "steps": [
          {
            "description": "支付",
            "expected_result": "成功",
            "special_data": ""
          },
          {
            "description": "查询",
            "expected_result": "已支付",
            "special_data": ""
          }
        ],
        "product_id": "p",
        "function_id": "pay",
        "related_function_ids": [],
        "project_id": null,
        "applicable_versions": [
          "1"
        ],
        "condition_refs": [
          "r"
        ],
        "notes": "",
        "blocking_questions": [],
        "requirement_refs": [],
        "id": "example-case",
        "number": "TC-Func01-00001",
        "revision": 1,
        "author": "a",
        "modified_by": "a",
        "maintainer": "a",
        "created_at": "2026-09-13T07:35:53.300345Z",
        "lifecycle": "active",
        "review_status": "accepted",
        "automation_refs": [],
        "design_id": "d",
        "external_refs": {},
        "publications": [],
        "publication_status": "unpublished"
      },
      "environment": "test",
      "product_version": "1",
      "mode": "manual",
      "executor": "tester",
      "runner_id": "local"
    }
  ],
  "defect_mode": "manual"
}
```
