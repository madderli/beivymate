import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
const entry = "/?preview=workspace";

test("create workspace with multiple products, projects, knowledge paths and default selection", async ({
  page,
}, info) => {
  await page.goto(entry);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("工作区标识（简称）", { exact: true }).fill("OPD");
  await dialog.getByLabel("工作区名称", { exact: true }).fill("门诊协同工作区");
  await dialog
    .getByLabel("工作区描述", { exact: true })
    .fill("统一推进门诊业务与产品验证。");
  for (const product of ["自定义门诊产品", "医院业务协同平台"]) {
    await dialog.getByLabel("覆盖产品", { exact: true }).fill(product);
    await dialog.getByLabel("覆盖产品", { exact: true }).press("Enter");
  }
  await dialog.getByLabel("覆盖产品", { exact: true }).fill("自定义门诊产品");
  await dialog.getByLabel("覆盖产品", { exact: true }).press("Enter");
  await expect(dialog.locator(".wsd-tag")).toHaveCount(2);
  await dialog
    .getByRole("button", { name: "移除自定义门诊产品", exact: true })
    .click();
  await expect(dialog.locator(".wsd-tag")).toHaveCount(1);
  await dialog.getByLabel("覆盖产品", { exact: true }).fill("新的产品范围");
  await dialog
    .getByRole("button", { name: "添加覆盖产品", exact: true })
    .click();
  await dialog.getByLabel("覆盖项目", { exact: true }).fill("一期建设项目");
  await dialog.getByLabel("覆盖项目", { exact: true }).press("Enter");
  await dialog.getByLabel("覆盖项目", { exact: true }).fill("二期升级项目");
  await dialog.getByLabel("覆盖项目", { exact: true }).press("Enter");
  await expect(dialog.locator(".wsd-options")).toHaveCount(0);
  await dialog
    .getByLabel("知识目录 1", { exact: true })
    .fill("/docs/requirements");
  await dialog
    .getByRole("button", { name: "添加知识目录", exact: true })
    .click();
  await dialog.getByLabel("知识目录 2", { exact: true }).fill("/docs/manuals");
  await dialog.getByLabel("设为默认工作区", { exact: false }).check();
  const checkbox = dialog.getByLabel("设为默认工作区", { exact: false });
  const box = await checkbox.boundingBox();
  expect(box!.width).toBe(15);
  expect(box!.height).toBe(15);
  expect(
    await checkbox.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe("none");
  await checkbox.press("Space");
  await expect(checkbox).not.toBeChecked();
  expect(
    await checkbox.evaluate((el) => getComputedStyle(el).outlineColor),
  ).toBe("rgb(66, 130, 101)");
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();

  expect(
    await dialog
      .locator(".wsd-fields")
      .evaluate((el) => el.lastElementChild?.className),
  ).toBe("wsd-default");
  await page.screenshot({
    path: info.outputPath("workspace-create.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "创建工作区", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "OPD · 门诊协同工作区 已创建",
  );
  const card = page.locator(".wsd-workspace-grid article").filter({
    has: page.getByRole("heading", { name: "门诊协同工作区", exact: true }),
  });
  await expect(card).toContainText("2 个产品");
  await expect(card).toContainText("2 个项目");
  await expect(card).toContainText("2 个知识目录");
  await expect(card.locator(".wsd-default-badge")).toHaveText("默认");
  await expect(page.locator(".wsd-default-badge")).toHaveCount(1);
});

test("unfinished tasks make every field read-only and prevent saving", async ({
  page,
}, info) => {
  await page.goto(entry);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "查看配置", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("还有 2 项任务未完成，暂时无法编辑");
  for (const field of await dialog
    .locator(".wsd-fields input, .wsd-fields textarea, .wsd-fields button")
    .all())
    await expect(field).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "保存修改", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("workspace-locked.png"),
    fullPage: true,
  });
});

test("workspace without unfinished tasks allows changing identifier and all content", async ({
  page,
}) => {
  await page.goto(entry);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "编辑工作区", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("所有字段均可修改");
  await dialog.getByLabel("工作区标识（简称）", { exact: true }).fill("HIS");
  await dialog.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("标识已被使用");
  await dialog.getByLabel("工作区标识（简称）", { exact: true }).fill("LAB");
  await dialog
    .getByLabel("工作区名称", { exact: true })
    .fill("实验室协同工作区");
  await dialog
    .getByLabel("知识目录 1", { exact: true })
    .fill("/knowledge/new-lab");
  await dialog.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "LAB · 实验室协同工作区 已更新",
  );
  await page.getByRole("button", { name: "编辑工作区", exact: true }).click();
  await expect(
    page.getByLabel("工作区标识（简称）", { exact: true }),
  ).toHaveValue("LAB");
  await expect(page.getByLabel("知识目录 1", { exact: true })).toHaveValue(
    "/knowledge/new-lab",
  );
});

test("mobile form scrolls without horizontal overflow and keeps actions visible", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(entry);
  await expect(
    page.getByRole("button", { name: "创建工作区", exact: true }),
  ).toBeInViewport();
  const scroll = page.locator(".wsd-form-scroll");
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    page.getByLabel("设为默认工作区", { exact: false }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workspace-mobile.png"),
    fullPage: true,
  });
});
