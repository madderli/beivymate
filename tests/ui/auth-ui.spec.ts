import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
import { session } from "./fixtures";

test("login layout uses local friendly fonts and a genuinely transparent logo", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-15T01:00:00Z"));
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ json: { authenticated: false, capabilities: [] } }),
  );
  const external: string[] = [];
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator(".oa-greeting-en")).toHaveText("Good morning");
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    english: document.fonts.check('16px "Omni Nunito"'),
    chinese: document.fonts.check('24px "Omni WenKai"'),
  }));
  expect(fonts).toEqual({ english: true, chinese: true });
  const alpha = await page.evaluate(async () => {
    const img = new Image();
    img.src = "/omnialba-transparent.png";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(img, 0, 0);
    return {
      corner: context.getImageData(0, 0, 1, 1).data[3],
      mark: context.getImageData(386, 270, 1, 1).data[3],
    };
  });
  expect(alpha.corner).toBe(0);
  expect(alpha.mark).toBeGreaterThan(240);
  expect(external).toEqual([]);
  await page.screenshot({
    path: info.outputPath("login-desktop.png"),
    fullPage: true,
  });
});

test("employee login authenticates before role selection; returning logs out", async ({
  page,
}, info) => {
  let authenticated = false;
  let credentials: unknown;
  let logouts = 0;
  await page.route("**/api/v1/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/session")) {
      if (r.request().method() === "POST") {
        credentials = r.request().postDataJSON();
        authenticated = true;
      }
      if (r.request().method() === "DELETE") {
        authenticated = false;
        logouts++;
      }
      return r.fulfill({
        json: authenticated
          ? session
          : { authenticated: false, capabilities: [] },
      });
    }
    return r.fulfill({
      json: path.endsWith("/workbench")
        ? { workspaces: [], tasks: [], workflows: [], models: [] }
        : [],
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "工号登录", exact: true }).click();
  await expect(page.getByLabel("用户名", { exact: true })).toHaveAttribute(
    "placeholder",
    "E2024001",
  );
  await page.getByLabel("用户名", { exact: true }).fill("E2024001");
  await page.getByLabel("密码", { exact: true }).fill("Account-Password-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "今天，以什么角色开始？" }),
  ).toBeVisible();
  expect(credentials).toEqual({
    username: "E2024001",
    password: "Account-Password-123!",
    role: "tester",
  });
  await expect(
    page.getByRole("button", { name: "产品经理 后续开放" }),
  ).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("role-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "返回登录" }).click();
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();
  expect(logouts).toBe(1);
});

test("initialization preserves password confirmation and one-time recovery code", async ({
  page,
}) => {
  let initialized = false;
  let calls = 0;
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({
      json: {
        authenticated: false,
        needsInitialization: !initialized,
        capabilities: [],
      },
    }),
  );
  await page.route("**/api/v1/account/initialize", (r) => {
    initialized = true;
    calls++;
    return r.fulfill({ json: { recoveryCode: "saved-once-recovery-code" } });
  });
  await page.goto("/");
  await page.getByLabel("初始化码", { exact: true }).fill("setup-token");
  await page.getByLabel("显示名称", { exact: true }).fill("验收用户");
  await page.getByLabel("用户名", { exact: true }).fill("user@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Different-Password-123!");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("两次输入的密码不一致");
  expect(calls).toBe(0);
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Secure-Password-123!");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await expect(page.getByLabel("账户恢复码")).toContainText(
    "saved-once-recovery-code",
  );
  await page.getByRole("button", { name: "我已保存，返回登录" }).click();
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("账户恢复码")).toHaveCount(0);
});

test("recovery retains API contract and clears password fields", async ({
  page,
}) => {
  let submitted: unknown;
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ json: { authenticated: false, capabilities: [] } }),
  );
  await page.route("**/api/v1/account/recover", (r) => {
    submitted = r.request().postDataJSON();
    return r.fulfill({ json: { recoveryCode: "new-recovery-code" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "忘记密码？使用恢复码" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("user@example.com");
  await page.getByLabel("恢复码", { exact: true }).fill("old-recovery-code");
  await page.getByLabel("新密码", { exact: true }).fill("Secure-Password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Secure-Password-123!");
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await expect(page.getByLabel("账户恢复码")).toContainText(
    "new-recovery-code",
  );
  expect(submitted).toEqual({
    username: "user@example.com",
    password: "Secure-Password-123!",
    recoveryCode: "old-recovery-code",
  });
});

test("mobile login and role selection fit the viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let authenticated = false;
  await page.route("**/api/v1/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/session")) {
      if (r.request().method() === "POST") authenticated = true;
      return r.fulfill({
        json: authenticated
          ? session
          : { authenticated: false, capabilities: [] },
      });
    }
    return r.fulfill({
      json: { workspaces: [], tasks: [], workflows: [], models: [] },
    });
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("login-mobile.png"),
    fullPage: true,
  });
  await page.getByLabel("用户名", { exact: true }).fill("user@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Account-Password-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入 Agent" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("role-mobile.png"),
    fullPage: true,
  });
});
