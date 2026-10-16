import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";
import { boardFixture, session } from "./fixtures";
import type { Board } from "../../src/frontend/src/model";

async function openTasks(page: Page, board: Board) {
  await page.route("**/api/v1/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    return r.fulfill({
      json: path.endsWith("/session")
        ? session
        : path.endsWith("/workbench")
          ? board
          : [],
    });
  });
  await page.goto("/#home");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  if ((page.viewportSize()?.width || 1440) <= 600)
    await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "我的任务", exact: true }).click();
}

test("reminder contains tasks and compact statistics align beside the title", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-15T01:00:00Z"));
  const board = boardFixture();
  await openTasks(page, board);
  await expect(page.getByRole("region", { name: "AI 任务提醒" })).toContainText(
    "早上好！今天要加把劲哦，还有 2 项任务需要你的协助。请查看待完成任务列表：",
  );
  await expect(page.getByRole("region", { name: "AI 任务提醒" })).toContainText(
    "待完成任务列表",
  );
  await expect(
    page.getByRole("heading", { name: "待完成任务列表", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".task-reminder-bubble .task-relation-label"),
  ).toContainText("关联任务 · 主任务：HIS");
  await expect(page.locator(".task-statistics")).toHaveCount(0);
  await expect(page.locator(".ad-header > div")).toBeHidden();
  await expect(page.locator(".task-workspace-heading").first()).toContainText(
    "HIS",
  );
  await expect(page.locator(".task-workspace-heading").first()).toContainText(
    "医院信息系统",
  );
  await expect(page.locator(".task-workspace-heading").nth(1)).toContainText(
    "CIS",
  );
  const counts = page.locator(".task-status-head");
  await expect(counts).toHaveCount(4);
  for (const head of await counts.all()) {
    const label = await head.locator("span").boundingBox();
    const count = await head.locator("strong").boundingBox();
    expect(
      Math.abs(label!.y + label!.height / 2 - (count!.y + count!.height / 2)),
    ).toBeLessThan(2);
    expect(count!.x).toBeGreaterThan(label!.x);
  }
  await expect(
    page.locator(".task-reminder-bubble .task-pending-section .ad-group"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "待完成任务统计", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-reminder-count")).toHaveText("2");
  const cardStyle = await page
    .locator(".task-status-grid > div")
    .first()
    .evaluate((el) => ({
      border: getComputedStyle(el).borderTopWidth,
      background: getComputedStyle(el).backgroundColor,
    }));
  expect(cardStyle.border).toBe("1px");
  expect(cardStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  const title = await page.locator(".task-home-top h1").boundingBox();
  const summary = await page.locator(".task-pending-statistics").boundingBox();
  const slogan = await page
    .locator(".task-home-top .homepage-heading p")
    .boundingBox();
  expect(summary!.height).toBeLessThanOrEqual(title!.height / 3);
  expect(summary!.x).toBeGreaterThan(title!.x + title!.width);
  expect(
    Math.abs(summary!.y + summary!.height - (slogan!.y + slogan!.height)),
  ).toBeLessThan(5);
  await page.screenshot({
    path: info.outputPath("my-tasks-desktop.png"),
    fullPage: true,
  });
  await page
    .locator(".task-pending-section")
    .getByRole("button", { name: /支付跨产品验证/ })
    .click();
  await expect(page).toHaveURL(/#task\/TASK-2026-00001-M$/);
});

test("completed tasks do not count as leftovers and the reminder updates from server data", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-15T06:00:00Z"));
  const board = boardFixture();
  await openTasks(page, board);
  await expect(page.locator(".task-reminder")).toContainText(
    "下午好！今天要加把劲哦，还有 2 项任务需要你的协助",
  );
  board.tasks.forEach((t) => {
    t.status = "completed";
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.locator(".task-reminder")).toContainText(
    "太棒了，您已经没有遗留的任务了",
  );
  await expect(page.locator(".task-pending-section .ad-group")).toHaveCount(0);
  await expect(page.locator(".task-status-head strong")).toHaveText([
    "0",
    "0",
    "0",
    "0",
  ]);
  await expect(page.locator(".task-statistics")).toHaveCount(0);
  await page.getByRole("button", { name: "分析统计", exact: true }).click();
  await expect(
    page.locator(".task-statistics .ad-metrics > div").nth(1),
  ).toContainText("2");
  await page.screenshot({
    path: info.outputPath("my-tasks-clear.png"),
    fullPage: true,
  });
});

test("empty task board stays positive and statistics filters do not change the reminder", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const board = boardFixture();
  board.tasks = [];
  await openTasks(page, board);
  await expect(page.locator(".task-reminder")).toContainText("晚上好！太棒了");
  await expect(page.locator(".task-empty-list")).toBeVisible();
  await page.getByRole("button", { name: "分析统计", exact: true }).click();
  await page.getByLabel("统计工作区", { exact: true }).selectOption("HIS");
  await expect(
    page.locator(".task-statistics .ad-metrics > div").first(),
  ).toContainText("0");
  await page.getByRole("button", { name: "我的任务", exact: true }).click();
  await expect(page.locator(".task-reminder")).toContainText("没有遗留的任务");
});

test("mobile cards, long workspace names and extra statuses remain readable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const board = boardFixture();
  board.workspaces[0].name = "医院信息系统与跨产品协同验证工作空间";
  board.tasks[1].status = "blocked";
  await openTasks(page, board);
  await expect(page.locator(".task-reminder")).toContainText(
    "还有 2 项任务需要你的协助",
  );
  await expect(
    page.locator(".task-status-head").filter({ hasText: "被阻碍" }),
  ).toContainText("1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("my-tasks-mobile.png"),
    fullPage: true,
  });
});

test("evening reminder highlights the actual single remaining task", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const board = boardFixture();
  board.tasks = board.tasks.slice(0, 1);
  await openTasks(page, board);
  await expect(page.locator(".task-reminder-message")).toHaveText(
    "晚上好！今天要加把劲哦，还有 1 项任务需要你的协助。请查看待完成任务列表：",
  );
  await expect(page.locator(".task-reminder-count")).toHaveText("1");
  await expect(page.locator(".task-reminder-bubble .ad-group")).toHaveCount(1);
});
