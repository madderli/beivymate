import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
import { boardFixture, session } from "./fixtures";
import type { Workspace } from "../../src/frontend/src/model";

test("formal workspace form saves multiple entries and permits identifier changes without pending tasks", async ({
  page,
}) => {
  const board = boardFixture();
  board.tasks = [];
  let saved: Record<string, unknown> = {};
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path.endsWith("/workspaces")) {
      saved = route.request().postDataJSON();
      board.workspaces.push({
        ...saved,
        subtitle: saved.description,
        revision: "new-r1",
        paused: false,
        color: "green",
        knowledge: "",
      } as Workspace);
      if (saved.isDefault) board.defaultWorkspace = saved.id as string;
      return route.fulfill({ status: 201, json: { id: saved.id } });
    }
    if (route.request().method() === "PATCH" && path.includes("/workspaces/")) {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { id: saved.id } });
    }
    return route.fulfill({
      json: path.endsWith("/session")
        ? session
        : path.endsWith("/workbench")
          ? board
          : [],
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  await page
    .getByRole("button", { name: "新增工作区", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("工作区标识（简称）", { exact: true }).fill("LAB");
  await dialog.getByLabel("工作区名称", { exact: true }).fill("实验室协同");
  await dialog.getByLabel("工作区描述", { exact: true }).fill("实验室业务验证");
  for (const name of ["检验产品", "门诊产品"]) {
    await dialog.getByLabel("覆盖产品", { exact: true }).fill(name);
    await dialog.getByLabel("覆盖产品", { exact: true }).press("Enter");
  }
  await dialog.getByLabel("覆盖项目", { exact: true }).fill("一期项目");
  await dialog.getByLabel("覆盖项目", { exact: true }).press("Enter");
  await dialog.getByLabel("知识目录 1", { exact: true }).fill("/docs/lab");
  await dialog.getByLabel("知识目录 1", { exact: true }).press("Enter");
  await expect(dialog).toBeVisible();
  expect(saved).toEqual({});
  await dialog
    .getByRole("button", { name: "添加知识目录", exact: true })
    .click();
  await dialog.getByLabel("知识目录 2", { exact: true }).fill("/docs/clinic");
  await dialog.getByLabel("设为默认工作区").check();
  await dialog.getByRole("button", { name: "创建工作区", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(saved.products).toEqual(["检验产品", "门诊产品"]);
  expect(saved.projects).toEqual(["一期项目"]);
  expect(saved.knowledgeDirectories).toEqual(["/docs/lab", "/docs/clinic"]);
  expect(saved.isDefault).toBe(true);
  await page
    .getByRole("button", { name: "配置 实验室协同", exact: true })
    .click();
  await expect(dialog.getByLabel("工作区名称", { exact: true })).toHaveValue(
    "实验室协同",
  );
  await expect(
    dialog.getByRole("button", { name: "移除检验产品", exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("工作区标识（简称）", { exact: true }).fill("LAB2");
  await dialog.getByLabel("知识目录 1", { exact: true }).fill("/docs/updated");
  await dialog.getByLabel("知识目录 1", { exact: true }).press("Enter");
  await expect(dialog).toBeVisible();
  expect(saved.id).toBe("LAB");
  await dialog.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(saved.id).toBe("LAB2");
  expect(saved.expectedRevision).toBe("new-r1");
});

test("formal workspace with unfinished tasks is read-only", async ({
  page,
}) => {
  const board = boardFixture();
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
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  const card = page.locator(".wcd-card").first();
  await expect(
    card.getByRole("button", { name: "配置 医院信息系统", exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole("button", { name: "打开", exact: true }),
  ).toBeEnabled();
  await expect(card.locator(".wcd-task-summary > div").nth(1)).toHaveText(
    "独立任务1",
  );
  await expect(
    page.locator(".wcd-card").nth(1).locator(".wcd-task-summary > div").nth(2),
  ).toHaveText("关联任务1");
});

test("formal workspace disable is confirmed, persisted and prevents composition until reenabled", async ({
  page,
}) => {
  const board = boardFixture();
  board.tasks = [];
  board.workspaces[0].description = "验证正式卡片";
  board.workspaces[0].products = ["HIS", "CIS"];
  board.workspaces[0].knowledgeDirectories = [
    "/knowledge/hospital",
    "/knowledge/guides",
  ];
  let writes = 0;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      route.request().method() === "PATCH" &&
      path.endsWith("/workspaces/HIS")
    ) {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(board.workspaces[0].revision);
      board.workspaces[0].paused = body.paused;
      board.workspaces[0].revision = `revision-${++writes}`;
      return route.fulfill({ json: { id: "HIS" } });
    }
    return route.fulfill({
      json: path.endsWith("/session")
        ? session
        : path.endsWith("/workbench")
          ? board
          : [],
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  const card = page.locator(".wcd-card").first();
  await expect(card.locator(".wcd-tags").first()).toContainText("CIS");
  await expect(card.locator(".wcd-path")).toHaveCount(2);
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(writes).toBe(0);
  await card.getByRole("button", { name: "停用", exact: true }).click();
  const intro = page.locator(".wcd-confirm-intro");
  const icon = await intro.locator(".wcd-icon").boundingBox();
  const heading = await intro.locator("h3").boundingBox();
  const explanation = await intro.locator("p").boundingBox();
  expect(heading!.x).toBeGreaterThan(icon!.x + icon!.width);
  expect(explanation!.x).toBe(heading!.x);
  await page.getByRole("button", { name: "确认停用", exact: true }).click();
  await expect(card.locator(".wcd-enabled")).toHaveText("已停用");
  await card.getByRole("button", { name: "打开", exact: true }).click();
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "新任务", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "启用工作区", exact: true }).click();
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toBeEnabled();
  expect(writes).toBe(2);
});
