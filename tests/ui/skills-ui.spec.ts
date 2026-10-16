import { test, expect } from "../../src/frontend/node_modules/@playwright/test";

test("application navigation mounts skill and model pages inside one sidebar", async ({
  page,
}, info) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/session")
        ? {
            authenticated: true,
            user: { id: "ui-user", name: "UI验收员" },
            csrfToken: "fixture",
            capabilities: ["configuration.manage"],
          }
        : { workspaces: [], tasks: [], workflows: [], models: [] },
    });
  });
  await page.goto("/#skills");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  await expect(page.locator(".ad-sidebar")).toHaveCount(1);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "模型配置", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "模型配置", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#models$/);
  await expect(page.locator(".ad-sidebar")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("model-settings-app.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "返回技能中心", exact: true }).click();
  await expect(page).toHaveURL(/#skills$/);
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的工作流" })).toBeVisible();
  await expect(page.locator(".ad-sidebar")).toHaveCount(1);
  await expect(page.locator(".wf-card")).toHaveCount(2);
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("skills-app-mobile.png"),
    fullPage: true,
  });
});

test("personal skill and role survive refresh without backend requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) requests.push(r.url());
  });
  await page.goto("/?ui=skills");
  const builtin = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "需求理解", exact: true }),
  });
  await builtin.getByRole("button", { name: "查看技能", exact: true }).click();
  await page.getByRole("button", { name: "创建个人副本", exact: true }).click();
  await page.getByLabel("技能名称", { exact: true }).fill("持久保存的技能");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "持久保存的技能", exact: true }),
  ).toBeVisible();
  await page.getByLabel("当前角色", { exact: true }).selectOption("developer");
  await page.reload();
  await expect(page.getByLabel("当前角色", { exact: true })).toHaveValue(
    "developer",
  );
  expect(requests).toEqual([]);
});

test("model switches, budget and failover settings survive refresh", async ({
  page,
}) => {
  await page.goto("/?ui=skills#models");
  await expect(
    page.getByRole("heading", { name: "模型配置", exact: true }),
  ).toBeVisible();
  const enabled = page.getByRole("switch", {
    name: "启用模型 balanced",
    exact: true,
  });
  await enabled.click();
  await page.getByRole("button", { name: "成本控制", exact: true }).click();
  await page.getByLabel("月度预算", { exact: true }).fill("88");
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  await page.getByLabel("速度优先映射模型").selectOption("vision");
  await page.reload();
  await expect(enabled).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "成本控制", exact: true }).click();
  await expect(page.getByLabel("月度预算", { exact: true })).toHaveValue("88");
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  await expect(page.getByLabel("速度优先映射模型")).toHaveValue("vision");
});

test("damaged local cache falls back to usable initial state", async ({
  page,
}) => {
  await page.goto("/?ui=skills");
  await page.evaluate(() => {
    localStorage.setItem("beivymate.ui.v1.skills", "broken JSON");
    localStorage.setItem("beivymate.ui.v1.models", "null");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  await expect(page.locator(".sc-card")).toHaveCount(8);
});
