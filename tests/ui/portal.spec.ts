import { test, expect } from "../../src/frontend/node_modules/@playwright/test";

test("real local account initialization, refresh, logout and recovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "创建你的本地账户" }),
  ).toBeVisible();
  await page
    .getByLabel("初始化码", { exact: true })
    .fill("browser-test-initialization");
  await page.getByLabel("显示名称", { exact: true }).fill("外测用户");
  await page.getByLabel("用户名", { exact: true }).fill("employee@example.com");
  await page.getByLabel("密码", { exact: true }).fill("short");
  await page.getByLabel("确认密码", { exact: true }).fill("short");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "同时包含大写字母、小写字母、数字和符号",
  );
  await page.getByLabel("密码", { exact: true }).fill("Browser-password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Browser-password-123!");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  const code = await page.getByLabel("账户恢复码").innerText();
  expect(code.length).toBeGreaterThan(30);
  await page.getByRole("button", { name: "我已保存，返回登录" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("employee@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Browser-password-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你好，外测用户 ✦" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新建任务", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("后端已连接", { exact: true })).toHaveCount(0);
  await expect(page.getByText("使用后台数据", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "个人空间", exact: true }).click();
  await page.getByRole("button", { name: "个人账户设置", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("账户与试用权限");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("button", { name: "技能与工作流配置", exact: true })
    .click();
  const configuration = page.getByRole("dialog");
  await configuration
    .getByRole("combobox", { name: "选择配置", exact: true })
    .selectOption("test_analysis");
  await expect(
    configuration.getByLabel("配置内容", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await configuration.getByRole("button", { name: "创建自定义副本" }).click();
  await expect(
    configuration.getByRole("combobox", { name: "运行模型", exact: true }),
  ).toHaveValue("null");
  await configuration
    .getByRole("button", { name: "保存配置", exact: true })
    .click();
  await expect(
    configuration.getByRole("combobox", { name: "选择配置", exact: true }),
  ).toHaveValue("test_analysis_custom");
  await configuration.getByText("查看和维护技能模板", { exact: true }).click();
  await configuration
    .getByLabel("选择模板", { exact: true })
    .selectOption("templates/zh-CN/DefaultTestAnalysisTemplate.md");
  const templateText = configuration.getByLabel("模板内容", { exact: true });
  await templateText.fill(
    (await templateText.inputValue()) + "\n客户规则：检查支付冲正。",
  );
  await configuration
    .getByRole("button", { name: "保存模板", exact: true })
    .click();
  await expect(
    configuration.getByRole("button", { name: "保存模板", exact: true }),
  ).toBeDisabled();
  await configuration.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("button", { name: "技能与工作流配置", exact: true })
    .click();
  await configuration
    .getByRole("combobox", { name: "选择配置", exact: true })
    .selectOption("test_execution");
  await configuration.getByText("查看和维护技能模板", { exact: true }).click();
  await configuration
    .getByLabel("选择模板", { exact: true })
    .selectOption("templates/zh-CN/DefaultDefectTemplate.md");
  await expect(configuration.getByRole("status")).toContainText("参考资料");
  await expect(configuration.getByRole("status")).toContainText("不会改变");
  await expect(
    configuration.getByLabel("模板内容", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await configuration.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("button", { name: "产物与工作资产", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "当前账户暂无已登记产物",
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  for (const id of ["HIS", "CIS"]) {
    await page.getByRole("button", { name: "新增工作区", exact: true }).click();
    const dialog = page.getByRole("dialog");
    expect(
      await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
    await dialog.getByLabel("工作区标识", { exact: true }).fill(id);
    await dialog.getByLabel("工作区名称", { exact: true }).fill(id + " 产品");
    await dialog.getByLabel("产品范围", { exact: true }).fill("支付业务");
    await dialog.getByRole("button", { name: "保存工作区" }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const creation = page.getByRole("dialog");
  await creation.getByLabel("任务名称", { exact: true }).fill("跨产品支付验证");
  await creation
    .getByRole("combobox", { name: "主工作区", exact: true })
    .selectOption("HIS");
  await creation
    .getByRole("combobox", { name: "工作流", exact: true })
    .selectOption("uat");
  await creation.getByRole("checkbox", { name: /CIS/ }).check();
  await creation
    .getByLabel("需求与工作目标", { exact: true })
    .fill("验证支付与就诊的联动");
  await creation.getByLabel("需求附件").setInputFiles({
    name: "支付需求.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("支付联动规则"),
  });
  await creation.getByLabel("目标版本", { exact: true }).fill("1.0");
  await creation.getByLabel("环境标识", { exact: true }).fill("");
  await creation.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(creation).toHaveCount(0);
  await expect(page.locator(".task-row")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".task-row")).toHaveCount(2);
  await page.locator(".task-row").filter({ hasText: /-M/ }).click();
  await expect(page.locator(".task-overline")).toContainText("主任务");
  await expect(
    page.getByRole("button", { name: "启动", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.locator(".task-overline")).toContainText("已暂停");
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.locator(".task-overline")).toContainText("待执行");
  await page.getByRole("button", { name: "配置", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载附件" }).click();
  expect((await download).suggestedFilename()).toBe("支付需求.md");
  await page.getByRole("button", { name: "编辑任务配置", exact: true }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("目标版本", { exact: true }).fill("1.1");
  await edit.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.locator(".metadata")).toContainText("1.1");
  await page
    .locator(".related-strip")
    .getByRole("button", { name: /CIS/ })
    .click();
  await expect(page.locator(".task-overline")).toContainText("关联任务");
  await page.getByRole("button", { name: "配置", exact: true }).click();
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认删除" })
    .click();
  await expect(page.locator(".task-row")).toHaveCount(1);
  await page.locator(".task-row").click();
  await page.getByRole("button", { name: "配置", exact: true }).click();
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认删除" })
    .click();
  await expect(page.locator(".task-row")).toHaveCount(0);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "beivymate_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  await page.getByRole("button", { name: "个人空间", exact: true }).click();
  await page.getByRole("button", { name: "个性化与配色", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "账户与试用权限" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "个人空间", exact: true }).click();
  await page.getByRole("button", { name: /退出/ }).click();
  await expect(
    page.getByRole("heading", { name: "登录你的工作台" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "忘记密码？使用恢复码" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("employee@example.com");
  await page.getByLabel("恢复码", { exact: true }).fill(code);
  await page
    .getByLabel("新密码", { exact: true })
    .fill("Updated-password-456!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Updated-password-456!");
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  expect(await page.getByLabel("账户恢复码").innerText()).not.toBe(code);
  await page.getByRole("button", { name: "我已保存，返回登录" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("employee@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Updated-password-456!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你好，外测用户 ✦" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "个人空间", exact: true }).click();
  await page.getByRole("button", { name: "个性化与配色", exact: true }).click();
  await page.getByLabel("显示名称", { exact: true }).fill("更新后的用户");
  await page.getByRole("button", { name: "保存显示名称" }).click();
  await expect(
    page.getByText("显示名称已更新，账户身份保持不变。"),
  ).toBeVisible();
  await page
    .getByLabel("当前密码", { exact: true })
    .fill("Updated-password-456!");
  await page.getByLabel("新密码", { exact: true }).fill("Third-password-789!");
  await page
    .getByLabel("确认新密码", { exact: true })
    .fill("Third-password-789!");
  await page.getByRole("button", { name: "修改密码并重新登录" }).click();
  await expect(
    page.getByRole("heading", { name: "登录你的工作台" }),
  ).toBeVisible();
  await page.getByLabel("用户名", { exact: true }).fill("employee@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Third-password-789!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你好，更新后的用户 ✦" }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(stored).not.toContain(code);
  expect(stored).not.toContain("password");
});
