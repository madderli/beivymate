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
  await page.getByRole("button", { name: "个人账户设置", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("账户与试用权限");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("尚未开放工作区创建");
  await page.getByRole("button", { name: "知道了" }).click();
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  await page
    .locator("main")
    .getByRole("button", { name: "新增工作区", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("尚未开放工作区创建");
  await page.getByRole("button", { name: "知道了" }).click();
  await page.getByRole("button", { name: "我的工作", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "你好，外测用户 ✦" }),
  ).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "beivymate_session",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  await page.getByRole("button", { name: "设置与个性化" }).click();
  await expect(
    page.getByRole("heading", { name: "账户与试用权限" }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "设置与个性化" }).click();
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
