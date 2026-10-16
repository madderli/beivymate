import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
test("real Agent app: account, default workspace, attachments, copy, configuration and reload", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("显示名称", { exact: true }).fill("新版验收员");
  await page.getByLabel("用户名", { exact: true }).fill("agent@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Secure-Password-123!");
  await page
    .getByLabel("初始化码", { exact: true })
    .fill("browser-test-initialization");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await page.getByRole("button", { name: "我已保存，返回登录" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("agent@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "创建工作区", exact: true }).click();
  await page.getByLabel("工作区标识", { exact: true }).fill("HIS");
  await page.getByLabel("工作区名称", { exact: true }).fill("医院信息系统");
  await page.getByRole("button", { name: "保存工作区", exact: true }).click();
  await expect(page.locator(".ad-header")).toContainText("医院信息系统");
  await expect(page.locator(".ad-workspaces")).toContainText("默认");
  await page.getByLabel("发送给 Ivy").fill("分析支付成功后更新订单的业务规则");
  await page.getByLabel("上传图片或文字附件").setInputFiles({
    name: "需求.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("支付成功更新订单，重复回调不重复扣款。"),
  });
  await page.getByRole("button", { name: "新任务", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("任务名称", { exact: true }).fill("真实支付验证");
  await form.getByLabel("目标版本", { exact: true }).fill("1.0");
  await form.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "真实支付验证", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".production-attachment")).toHaveText("需求.md");
  const attachment = await page.request.get(
    (await page.locator(".production-attachment").getAttribute("href")) || "",
  );
  expect(await attachment.text()).toContain("重复回调");
  await page.getByRole("button", { name: "复制任务", exact: true }).click();
  await expect(form.getByLabel("任务名称", { exact: true })).toHaveValue(
    "真实支付验证（副本）",
  );
  await expect(form.getByLabel("目标版本", { exact: true })).toHaveValue("1.0");
  await form.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "真实支付验证（副本）", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我的任务", exact: true }).click();
  await expect(page.locator(".ad-metrics")).toContainText("2");
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  await form.getByLabel("工作区标识", { exact: true }).fill("CIS");
  await form.getByLabel("工作区名称", { exact: true }).fill("临床信息系统");
  await form.getByLabel("设为默认工作区").check();
  await form.getByRole("button", { name: "保存工作区", exact: true }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  await page.getByRole("button", { name: "新建技能", exact: true }).click();
  await expect(form.getByLabel("技能名称", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "关闭弹窗" }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(page.locator(".ad-header")).toContainText("临床信息系统");
  await page.screenshot({
    path: testInfo.outputPath("agent-production.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
