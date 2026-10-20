import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";
import { boardFixture, session } from "./fixtures";
test.use({ timezoneId: "Asia/Shanghai" });
async function open(page: Page, empty = false) {
  const board = boardFixture();
  if (empty) board.tasks = [];
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith("/session")
        ? session
        : new URL(route.request().url()).pathname.endsWith("/workbench")
          ? board
          : [],
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "进入 Agent" }).click();
}
for (const [time, greeting] of [
  ["00:00", "凌晨好"],
  ["06:59", "凌晨好"],
  ["07:00", "早上好"],
  ["11:29", "早上好"],
  ["11:30", "中午好"],
  ["12:59", "中午好"],
  ["13:00", "下午好"],
  ["17:59", "下午好"],
  ["18:00", "晚上好"],
  ["23:59", "晚上好"],
]) {
  test(`workspace greeting at ${time} is ${greeting}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`2026-10-16T${time}:00+08:00`));
    await open(page);
    await expect(page.locator(".task-reminder-message")).toContainText(
      `${greeting}！`,
    );
    await expect(page.locator(".task-reminder-count")).toHaveText("1");
  });
}
test("workspace heading aligns with sidebar and assistant contains no duplicated name or footer", async ({
  page,
}, info) => {
  await open(page);
  const header = page.locator(".ad-workspace-shell .ad-header");
  const sidebar = page.locator(".ps-topbar");
  const headerBox = await header.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(headerBox!.y + headerBox!.height).toBe(
    sidebarBox!.y + sidebarBox!.height,
  );
  expect(
    await header
      .locator(".workspace-header-id")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("14px");
  expect(
    await header
      .locator(":scope > div")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("13px");
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(
      ".workspace-conversation-context, .workspace-conversation-invitation",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".task-reminder")).not.toContainText(
    "医院信息系统",
  );
  await expect(page.locator(".task-reminder-name")).toHaveText(
    "OmniAlba · 工作区助手",
  );
  await page.screenshot({
    path: info.outputPath("workspace-assistant.png"),
    fullPage: true,
  });
});
test("empty workspace has a positive greeting without an extra helper line", async ({
  page,
}) => {
  await open(page, true);
  await expect(page.locator(".task-reminder-message")).toContainText(
    "当前没有未完成任务",
  );
  await expect(page.locator(".task-reminder-hint")).toHaveCount(0);
});
test("workspace greeting changes at 11:30 without a reload", async ({
  page,
}) => {
  const time = new Date("2026-10-16T11:29:00+08:00");
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await open(page);
  await expect(page.locator(".task-reminder-message")).toContainText("早上好");
  await page.clock.runFor(60000);
  await expect(page.locator(".task-reminder-message")).toContainText("中午好");
});
