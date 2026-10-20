import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
const entry = "/?preview=workspace-cards";

test("workspace cards show full context, ellipsis and independent or related task counts", async ({
  page,
}, info) => {
  await page.goto(entry);
  const card = page.locator(".wcd-card").first();
  await expect(card.locator(".wcd-identity")).toContainText("HIS");
  await expect(card.locator("h2")).toHaveText(
    "医院挂号、收费与医保业务协同工作区",
  );
  await expect(card.locator(".wcd-default")).toHaveText("默认工作区");
  await expect(card.locator(".wcd-tags").first()).toContainText("医院信息系统");
  await expect(card.locator(".wcd-tags").nth(1)).toContainText("智慧医院建设");
  await expect(card.locator(".wcd-path")).toHaveCount(2);
  await card.getByRole("button", { name: /另有 1 个目录/ }).click();
  await expect(card.locator(".wcd-path")).toHaveCount(3);
  await expect(card.locator(".wcd-task-summary > div").nth(0)).toHaveText(
    "未完成任务3",
  );
  await expect(card.locator(".wcd-task-summary > div").nth(1)).toHaveText(
    "独立任务2",
  );
  await expect(card.locator(".wcd-task-summary > div").nth(2)).toHaveText(
    "关联任务1",
  );
  expect(
    await card
      .locator(".wcd-description")
      .evaluate((el) => getComputedStyle(el).textOverflow),
  ).toBe("ellipsis");
  await expect(
    card.getByRole("button", { name: "编辑", exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("workspace-cards-desktop.png"),
    fullPage: true,
  });
});

test("empty workspace supports editing, disable confirmation, cancellation and reenable", async ({
  page,
}) => {
  await page.goto(entry);
  const card = page.locator(".wcd-card").nth(2);
  await card.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("工作区标识（简称）", { exact: true }),
  ).toHaveValue("LIS");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("0 项未完成任务");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card.locator(".wcd-enabled")).toHaveText("已启用");
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await page.getByRole("button", { name: "确认停用", exact: true }).click();
  await expect(card.locator(".wcd-enabled")).toHaveText("已停用");
  await card.getByRole("button", { name: "启用", exact: true }).click();
  await expect(card.locator(".wcd-enabled")).toHaveText("已启用");
});

test("open workspace and creating or closing demo tasks updates counts and action locks", async ({
  page,
}) => {
  await page.goto(entry);
  await page
    .locator(".wcd-card")
    .nth(2)
    .getByRole("button", { name: "打开", exact: true })
    .click();
  await page.getByLabel("演示任务目标").fill("实验室业务验证");
  await page.getByRole("button", { name: "新任务", exact: true }).click();
  await expect(page.locator(".wcd-task-list")).toContainText("实验室业务验证");
  await page.getByRole("button", { name: "我的工作区", exact: true }).click();
  const card = page.locator(".wcd-card").nth(2);
  await expect(card.locator(".wcd-task-summary > div").nth(1)).toHaveText(
    "独立任务1",
  );
  await expect(
    card.getByRole("button", { name: "编辑", exact: true }),
  ).toBeDisabled();
  await expect(
    card.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  await card.getByRole("button", { name: "打开", exact: true }).click();
  await page
    .locator(".wcd-task-list")
    .getByRole("button", { name: /实验室业务验证/ })
    .click();
  await page.getByRole("button", { name: "关闭演示任务", exact: true }).click();
  await page.getByRole("button", { name: "我的工作区", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "编辑", exact: true }),
  ).toBeEnabled();
  await expect(
    card.getByRole("button", { name: "停用", exact: true }),
  ).toBeEnabled();
});

test("mobile card stays readable and disabled workspace opens with creation disabled", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(entry);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workspace-cards-mobile.png"),
    fullPage: true,
  });
  await page
    .locator(".wcd-card")
    .nth(3)
    .getByRole("button", { name: "打开", exact: true })
    .click();
  await expect(page.getByLabel("演示任务目标")).toBeDisabled();
  await page.getByRole("button", { name: "启用工作区", exact: true }).click();
  await expect(page.getByLabel("演示任务目标")).toBeEnabled();
});
