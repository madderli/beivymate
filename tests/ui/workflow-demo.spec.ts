import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";

async function createWorkflow(page: Page, name: string, second = false) {
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await page.getByLabel("工作流名称", { exact: true }).fill(name);
  await page.getByLabel("最终输出", { exact: true }).fill("测试结论");
  await page
    .getByLabel("步骤 1 技能", { exact: true })
    .selectOption("document_summary");
  if (second) {
    await page.getByRole("button", { name: "添加步骤", exact: true }).click();
    await page
      .getByLabel("步骤 2 技能", { exact: true })
      .selectOption("test_analysis");
    await page
      .getByRole("article", { name: "步骤 2", exact: true })
      .getByLabel("自动确认", { exact: true })
      .check();
  }
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
}

test("attachment layout, search, status filters and published skill badges", async ({
  page,
}, info) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiCalls.push(r.url());
  });
  await page.goto("/?preview=workflows");
  await expect(page.getByRole("heading", { name: "我的工作流" })).toBeVisible();
  await expect(page.locator(".wf-card")).toHaveCount(4);
  await page.screenshot({
    path: info.outputPath("workflow-catalog.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "已停用", exact: true }).click();
  await expect(page.locator(".wf-card")).toHaveCount(1);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.getByLabel("搜索工作流").fill("缺陷闭环");
  await expect(page.locator(".wf-card")).toHaveCount(1);
  await page.getByLabel("搜索工作流").fill("不存在");
  await expect(
    page.getByRole("heading", { name: "没有找到匹配的工作流" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const published = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "文档摘要", exact: true }),
  });
  await expect(published).toContainText("已发布·工作流可用");
  const draft = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "回归检查清单", exact: true }),
  });
  await expect(draft).toContainText("草稿·工作流不可用");
  expect(apiCalls).toEqual([]);
});

test("step editor excludes unpublished skills and validates reordering dependencies", async ({
  page,
}, info) => {
  await page.goto("/?preview=workflows");
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请输入工作流名称");
  const picker = page.getByLabel("步骤 1 技能", { exact: true });
  await expect(
    picker.locator('option[value="regression_checklist"]'),
  ).toHaveCount(0);
  await expect(picker.locator('option[value="legacy_api_check"]')).toHaveCount(
    0,
  );
  await expect(picker.locator('option[value="broken_report"]')).toHaveCount(0);
  await page.getByLabel("工作流名称", { exact: true }).fill("输入依赖检查");
  await page.getByRole("button", { name: "添加步骤", exact: true }).click();
  const inputs = page.getByLabel("步骤 2 输入来源", { exact: true });
  const reference = await inputs
    .locator('option[value^="step:"]')
    .first()
    .getAttribute("value");
  await inputs.selectOption(reference!);
  await page
    .getByRole("article", { name: "步骤 2", exact: true })
    .getByRole("button", { name: "上移步骤" })
    .click();
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("输入来源已失效");
  await page
    .getByLabel("步骤 1 输入来源", { exact: true })
    .selectOption("workflow");
  await page
    .getByLabel("步骤 2 输出命名", { exact: true })
    .fill("step2_output");
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("输出命名重复");
  await page
    .getByLabel("步骤 2 输出命名", { exact: true })
    .fill("final_result");
  await page.screenshot({
    path: info.outputPath("workflow-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "输入依赖检查" }),
  ).toBeVisible();
});

test("manual approval, rejection rerun, automatic continuation and run summary", async ({
  page,
}, info) => {
  await page.goto("/?preview=workflows");
  await createWorkflow(page, "确认节点演练", true);
  await page.getByRole("button", { name: "确认节点演练", exact: true }).click();
  await page.getByRole("button", { name: "运行工作流", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认通过", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wf-runtime .waiting")).toHaveCount(1);
  await page.getByRole("button", { name: "驳回重跑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认通过", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("workflow-waiting.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认通过", exact: true }).click();
  await expect(page.locator(".wf-run-summary")).toContainText("工作流运行完成");
  await expect(page.locator(".wf-run-summary")).toContainText(
    "1 次人工确认 · 1 次驳回重跑",
  );
  await expect(page.getByRole("log")).toContainText("自动确认通过");
  await page.getByRole("button", { name: "再次运行", exact: true }).click();
  await page.getByRole("button", { name: "停止运行", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("模拟运行已停止");
});

test("disabling shows affected tasks, cancellation keeps enabled state", async ({
  page,
}) => {
  await page.goto("/?preview=workflows");
  const card = page.locator(".wf-card").filter({
    has: page.getByRole("heading", { name: "需求测试", exact: true }),
  });
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("V3.2 需求测试 · 冒烟");
  await expect(page.getByRole("dialog")).toContainText("新任务也无法选用");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card).toContainText("已启用");
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await page.getByRole("button", { name: "确认停用", exact: true }).click();
  await expect(card).toContainText("已停用");
  await card.getByRole("button", { name: "需求测试", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "运行工作流", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "启用", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "运行工作流", exact: true }),
  ).toBeEnabled();
});

test("skill publication and pausing update workflow availability in the same demo", async ({
  page,
}) => {
  await page.goto("/?preview=workflows");
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const builtin = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "文档摘要", exact: true }),
  });
  await builtin.getByRole("button", { name: "创建副本", exact: true }).click();
  await page.getByLabel("技能名称", { exact: true }).fill("发布门禁测试");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await expect(
    page
      .getByLabel("步骤 1 技能", { exact: true })
      .locator('option[value="document_summary_custom"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const skill = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "发布门禁测试", exact: true }),
  });
  await skill.getByRole("button", { name: "编辑技能", exact: true }).click();
  await page.getByRole("button", { name: "4 检查与启用" }).click();
  await page.getByRole("button", { name: "运行结构校验" }).click();
  await page.getByRole("button", { name: "启用技能", exact: true }).click();
  await expect(skill).toContainText("已发布·工作流可用");
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await page.getByLabel("工作流名称", { exact: true }).fill("引用已发布技能");
  await page
    .getByLabel("步骤 1 技能", { exact: true })
    .selectOption("document_summary_custom");
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(skill).toContainText("1 个工作流引用");
  await skill.getByRole("button", { name: "停用", exact: true }).click();
  await expect(skill).toContainText("工作流不可用");
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page
    .getByRole("button", { name: "引用已发布技能", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("请选择已发布的技能");
  await expect(
    page.getByRole("button", { name: "运行工作流", exact: true }),
  ).toBeDisabled();
});

test("mobile catalog and editor fit viewport; closing cancels pending timers", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?preview=workflows");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await expect(page.getByLabel("工作流名称", { exact: true })).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workflow-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "需求测试", exact: true }).click();
  await page.getByRole("button", { name: "运行工作流", exact: true }).click();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.getByRole("button", { name: "需求测试", exact: true }).click();
  await expect(page.locator(".wf-runtime")).toHaveCount(0);
});
