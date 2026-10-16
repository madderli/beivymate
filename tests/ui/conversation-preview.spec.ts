import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
test("conversation creates linked tasks and manual review advances a version", async ({
  page,
}) => {
  const api: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) api.push(r.url());
  });
  await page.goto("/?preview=conversation");
  await page.getByRole("button", { name: /验证微信支付，协同/ }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("TASK-001-M · 主任务")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /关联任务 · CIS/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "审阅并确认", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("模拟产物");
  await page.getByRole("button", { name: "确认当前版本并继续" }).click();
  await expect(
    page.getByText("体验用户已确认 v1", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("工作身份").selectOption("开发工程师");
  await expect(
    page.getByRole("heading", { name: "你好，今天一起完成什么工作？" }),
  ).toBeVisible();
  await page.getByLabel("工作身份").selectOption("测试工程师");
  await expect
    .poll(() => page.locator(".cp-stats").innerText())
    .toContain("待确认");
  expect(api).toEqual([]);
});
test("release automatic flow completes with failed evidence and responsive layout", async ({
  page,
}) => {
  await page.goto("/?preview=conversation");
  await page.getByRole("button", { name: /验证 CIS 门诊月度版本/ }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".cp-progress-message")).toContainText(
    "所有步骤已完成",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: /查看测试报告结果/ }).click();
  await expect(page.getByRole("dialog")).toContainText("失败 1");
  await expect(page.getByRole("dialog")).toContainText("不代表批准发布");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("workspace creation and task form do not require a requirement description", async ({
  page,
}) => {
  await page.goto("/?preview=conversation");
  await page.getByRole("button", { name: "工作区管理", exact: true }).click();
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  await page.getByLabel("简称", { exact: true }).fill("INS");
  await page.getByLabel("名称", { exact: true }).fill("保险系统");
  await page.getByRole("button", { name: "保存工作区" }).click();
  await page
    .locator(".cp-workspace-list")
    .getByRole("button", { name: /保险系统/ })
    .click();
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByLabel("任务名称").fill("发布检查");
  await page.getByLabel("工作流", { exact: true }).selectOption("发布验证流程");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(page.locator(".cp-task-panel")).toContainText("发布检查");
});
test("notifications expire without losing task results and can be cleared", async ({
  page,
}) => {
  await page.goto("/?preview=conversation");
  await page.getByRole("button", { name: /验证微信支付，协同/ }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "审阅并确认", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cp-toasts")).toContainText("待确认");
  await expect(page.locator(".cp-toasts")).toBeEmpty({ timeout: 8000 });
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await page.getByLabel("对助手说").fill("打开 TASK-001-M");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /查看需求理解结果/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "任务通知", exact: true }).click();
  await page.getByRole("button", { name: "清空通知" }).click();
  await expect(page.locator(".cp-notifications")).toContainText("暂时没有通知");
  await expect(
    page.getByRole("button", { name: /查看需求理解结果/ }),
  ).toBeVisible();
});
test("linked tasks wait for a predecessor and share the release condition", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/?preview=conversation");
  await page.getByRole("button", { name: /验证微信支付，协同/ }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("button", { name: /关联任务 · CIS/ }).click();
  await page.getByText("关联与发布设置", { exact: true }).click();
  await page.getByLabel("前置任务", { exact: true }).selectOption("TASK-001-M");
  await page.getByLabel("所有关联任务完成后才可申请发布").check();
  await page.clock.fastForward(3000);
  await expect(page.locator(".cp-task-panel .cp-step").first()).toContainText(
    "执行中",
  );
  await expect(page.locator(".cp-task-panel")).toContainText(
    "暂不满足发布条件",
  );
  await page.getByRole("button", { name: /主任务 · HIS/ }).click();
  await expect(page.getByLabel("所有关联任务完成后才可申请发布")).toBeChecked();
  await expect(
    page.getByLabel("前置任务").locator('option[value="TASK-001-R01"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "取消任务", exact: true }).click();
  await expect(page.locator(".cp-progress-message")).toContainText("已取消");
});
test("status cards show workspace counts and filter without double counting", async ({
  page,
}) => {
  await page.goto("/?preview=conversation");
  await expect(
    page.getByRole("region", { name: "待确认任务统计" }),
  ).toContainText("暂无任务");
  await page.getByRole("button", { name: /验证微信支付，协同/ }).click();
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("button", { name: "审阅并确认", exact: true }).waitFor();
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  const card = page.getByRole("region", { name: "待确认任务统计" });
  await expect(
    card.getByRole("button", { name: "待确认全部任务 2", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "待确认 CIS 1个任务", exact: true })
    .click();
  const results = page.getByRole("region", { name: "筛选任务列表" });
  await expect(results).toContainText("TASK-001-R01");
  await expect(results).not.toContainText("TASK-001-M");
  await card
    .getByRole("button", { name: "待确认全部任务 2", exact: true })
    .click();
  await expect(results).toContainText("TASK-001-M");
  await expect(results).toContainText("TASK-001-R01");
});
