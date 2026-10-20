import { test, expect } from "../../src/frontend/node_modules/@playwright/test";

test("offline browser to real Worker: frozen run, review, artifacts and durable notices", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("显示名称", { exact: true }).fill("运行验收员");
  await page.getByLabel("用户名", { exact: true }).fill("m04@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Secure-Password-123!");
  await page
    .getByLabel("初始化码", { exact: true })
    .fill("browser-test-initialization");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await page.getByRole("button", { name: "我已保存，返回登录" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("m04@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page
    .getByRole("button", { name: "工作流（Workflow）", exact: true })
    .click();
  await page
    .getByRole("button", { name: "打开工作流管理", exact: true })
    .click();
  const configuration = page.getByRole("dialog");
  await configuration
    .getByRole("combobox", { name: "配置类型", exact: true })
    .selectOption("workflows");
  await configuration
    .getByLabel("选择配置", { exact: true })
    .selectOption("m6_test_analysis");
  await expect(configuration.getByLabel("步骤标识").first()).toBeDisabled();
  await configuration.getByRole("button", { name: "创建自定义副本" }).click();
  await configuration
    .getByLabel("副本标识", { exact: true })
    .fill("browser_m04");
  await configuration
    .getByLabel("分析策略（仅支持分析的技能）")
    .first()
    .selectOption("深入");
  await expect(
    configuration.getByLabel("配置内容", { exact: true }),
  ).toHaveValue(/分析策略：深入/);
  await configuration
    .getByRole("button", { name: "保存配置", exact: true })
    .click();
  await expect(
    configuration.getByLabel("选择配置", { exact: true }),
  ).toHaveValue("browser_m04");
  await configuration.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  await page.getByLabel("工作区标识（简称）", { exact: true }).fill("PAY");
  await page.getByLabel("工作区名称", { exact: true }).fill("支付产品");
  await page.getByRole("button", { name: "创建工作区" }).click();
  await page.getByRole("button", { name: "新任务", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("支付离线运行验收");
  await page
    .getByRole("combobox", { name: "主工作区", exact: true })
    .selectOption("PAY");
  await page
    .getByRole("combobox", { name: "工作流", exact: true })
    .selectOption("browser_m04");
  await page
    .getByLabel("需求与工作目标", { exact: true })
    .fill("支付成功更新订单状态");
  await page.getByLabel("目标版本", { exact: true }).fill("1.0");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  const panel = page.locator(".run-panel");
  await panel.getByRole("button", { name: "准备新运行" }).click();
  await expect(
    panel.getByRole("heading", { name: "启动前检查" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "确认并开始运行" }).click();
  await expect(
    panel.getByRole("heading", { name: "等待结果确认" }),
  ).toBeVisible();
  await expect(page.getByLabel("任务状态通知")).toContainText(
    "支付离线运行验收",
  );
  await page.reload();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(
    panel.getByRole("heading", { name: "等待结果确认" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "确认通过并继续" }).click();
  await expect(panel).toContainText("已处理 1／2 步");
  await expect(
    panel.getByRole("button", { name: "确认通过并继续" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "确认通过并继续" }).click();
  await expect(panel).toContainText("已处理 2／2 步");
  await expect(panel.getByRole("button", { name: "停止运行" })).toHaveCount(0);
  await expect(page.getByLabel("任务状态通知")).toContainText("已完成");
  await expect(panel.getByRole("link", { name: /下载/ })).toHaveCount(2);
  const download = page.waitForEvent("download");
  await panel.getByRole("link", { name: /下载 understand/ }).click();
  expect((await download).suggestedFilename()).toBe(
    "requirement_understand.md",
  );
});
