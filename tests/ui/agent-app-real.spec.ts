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
  await page.getByLabel("工作区标识（简称）", { exact: true }).fill("HIS");
  await page.getByLabel("工作区名称", { exact: true }).fill("医院信息系统");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建工作区", exact: true })
    .click();
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
  await expect(page.locator(".task-reminder-count")).toHaveText("2");
  await page.getByRole("button", { name: "分析统计", exact: true }).click();
  await expect(page.locator(".ad-metrics")).toContainText("2");
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  await form.getByLabel("工作区标识（简称）", { exact: true }).fill("CIS");
  await form.getByLabel("工作区名称", { exact: true }).fill("临床信息系统");
  await form.getByLabel("设为默认工作区").check();
  await form.getByRole("button", { name: "创建工作区", exact: true }).click();
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  const his = page.locator(".wcd-card").filter({
    has: page.getByRole("heading", { name: "医院信息系统", exact: true }),
  });
  await expect(
    his.getByRole("button", { name: "配置 医院信息系统", exact: true }),
  ).toBeDisabled();
  await expect(
    his.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  const cis = page.locator(".wcd-card").filter({
    has: page.getByRole("heading", { name: "临床信息系统", exact: true }),
  });
  await cis.getByRole("button", { name: "停用", exact: true }).click();
  await page.getByRole("button", { name: "确认停用", exact: true }).click();
  await expect(cis.locator(".wcd-enabled")).toHaveText("已停用");
  await page.screenshot({
    path: testInfo.outputPath("workspace-cards-production.png"),
    fullPage: true,
  });
  await cis.getByRole("button", { name: "打开", exact: true }).click();
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "启用工作区", exact: true }).click();
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  await expect(page.locator(".sc-card")).toHaveCount(5);
  await page.getByRole("button", { name: "新建技能", exact: true }).click();
  await expect(form.getByLabel("技能名称", { exact: true })).toBeVisible();
  await form.getByLabel("技能名称", { exact: true }).fill("磁盘技能验收");
  await form.getByLabel("唯一标识", { exact: true }).fill("disk_acceptance");
  await form
    .getByLabel("技能描述", { exact: true })
    .fill("验证技能包真正保存到后端目录。");
  await form.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.locator(".sc-card")).toHaveCount(6);
  const packages = await page.request.get("/api/v1/skill-center");
  expect(
    (await packages.json()).items.some(
      (s: { id: string }) => s.id === "disk_acceptance",
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(page.locator(".sc-card")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "磁盘技能验收", exact: true }),
  ).toBeVisible();
  const definitions = await (
    await page.request.get("/api/v1/configuration/skills")
  ).json();
  const source = definitions.items.find(
    (s: { id: string }) => s.id === "test_analysis",
  );
  const sourceTemplates = await (
    await page.request.get("/api/v1/skill-center")
  ).json();
  const packageSource = sourceTemplates.items.find(
    (s: { id: string }) => s.id === "test_analysis",
  );
  const session = await (await page.request.get("/api/v1/session")).json();
  const imported = await page.request.put(
    "/api/v1/skill-center/imported_analysis",
    {
      headers: {
        "X-CSRF-Token": session.csrfToken,
        Origin: "http://127.0.0.1:4173",
      },
      data: {
        content: source.content
          .replace("id: test_analysis", "id: imported_analysis")
          .replace("name: 测试分析", "name: 导入分析验收"),
        files: packageSource.files,
        state: "published",
        imported: true,
      },
    },
  );
  expect(imported.ok(), await imported.text()).toBe(true);
  expect((await imported.json()).state).toBe("discovered");
  await page.reload();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const importedCard = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "导入分析验收", exact: true }),
  });
  await expect(importedCard.locator(".sc-state")).toHaveText("待验证");
  await importedCard
    .getByRole("button", { name: "验证技能", exact: true })
    .click();
  await expect(importedCard.locator(".sc-state")).toHaveText("已验证");
  await importedCard
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect(importedCard.locator(".sc-state")).toHaveText("启用");
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
