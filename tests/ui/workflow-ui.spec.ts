import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";

const entry = "/?ui=skills#workflows";
async function create(page: Page, name: string, twoSteps = false) {
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await page.getByLabel("工作流名称", { exact: true }).fill(name);
  await page.getByLabel("最终输出", { exact: true }).fill("审阅结果");
  await page
    .getByLabel("步骤 1 技能", { exact: true })
    .selectOption("document_summary");
  if (twoSteps) {
    await page.getByRole("button", { name: "添加步骤", exact: true }).click();
    await page
      .getByLabel("步骤 2 技能", { exact: true })
      .selectOption("test_analysis");
    await page
      .getByRole("article", { name: "步骤 2", exact: true })
      .getByLabel("自动确认", { exact: true })
      .check();
  }
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
}

test("workflow configuration survives navigation and reload, including step inputs and models", async ({
  page,
}) => {
  await page.goto(entry);
  await create(page, "持久工作流", true);
  const card = page.locator(".wf-card").filter({
    has: page.getByRole("heading", { name: "持久工作流", exact: true }),
  });
  await card.getByRole("button", { name: "编辑", exact: true }).click();
  const select = page.getByLabel("步骤 2 输入来源", { exact: true });
  const reference = await select
    .locator('option[value^="step:"]')
    .first()
    .getAttribute("value");
  await select.selectOption(reference!);
  await page
    .getByLabel("步骤 1 模型", { exact: true })
    .selectOption("tier:质量优先");
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByLabel("步骤 2 输入来源", { exact: true })).toHaveValue(
    reference!,
  );
  await expect(page.getByLabel("步骤 1 模型", { exact: true })).toHaveValue(
    "tier:质量优先",
  );
  await expect(
    page
      .getByRole("article", { name: "步骤 2", exact: true })
      .getByLabel("自动确认", { exact: true }),
  ).toBeChecked();
});

test("disable confirmation uses padded panels and green buttons, and saves disabled state", async ({
  page,
}, info) => {
  await page.goto(entry);
  const card = page.locator(".wf-card").filter({
    has: page.getByRole("heading", { name: "支付异常验证", exact: true }),
  });
  await card.getByRole("button", { name: "停用", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("支付回调异常验证");
  await expect(dialog).toContainText("退款一致性复核");
  await expect(dialog.locator(".wc-section-title")).toContainText("2 个");
  expect(
    await dialog
      .locator(".wc-body")
      .evaluate((el) => getComputedStyle(el).paddingLeft),
  ).toBe("26px");
  expect(
    await dialog
      .getByRole("button", { name: "确认停用" })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(52, 116, 91)");
  await page.screenshot({
    path: info.outputPath("disable-workflow-desktop.png"),
  });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card).toContainText("已启用");
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await page.getByRole("button", { name: "确认停用", exact: true }).click();
  await page.reload();
  await expect(card).toContainText("已停用");
  await card.getByRole("button", { name: "支付异常验证", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "模拟运行", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "启用", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "模拟运行", exact: true }),
  ).toBeEnabled();
});

test("publication gates workflow references and remains consistent after refresh", async ({
  page,
}) => {
  await page.goto("/?ui=skills");
  const builtin = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "文档摘要", exact: true }),
  });
  await expect(builtin).toContainText("已发布·工作流可用");
  await builtin.getByRole("button", { name: "创建副本", exact: true }).click();
  await page.getByLabel("技能名称", { exact: true }).fill("正式发布测试");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  const option = page
    .getByLabel("步骤 1 技能", { exact: true })
    .locator('option[value="document_summary_custom"]');
  await expect(option).toHaveCount(0);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const skill = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "正式发布测试", exact: true }),
  });
  await skill.getByRole("button", { name: "编辑技能", exact: true }).click();
  await page.getByRole("button", { name: "4 检查与启用" }).click();
  await page.getByRole("button", { name: "运行结构校验" }).click();
  await page.getByRole("button", { name: "启用技能", exact: true }).click();
  await page.reload();
  await expect(skill).toContainText("已发布·工作流可用");
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.getByRole("button", { name: "新建工作流", exact: true }).click();
  await page.getByLabel("工作流名称", { exact: true }).fill("发布状态联动");
  await page
    .getByLabel("步骤 1 技能", { exact: true })
    .selectOption("document_summary_custom");
  await page.getByRole("button", { name: "保存工作流", exact: true }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(skill).toContainText("1 个工作流引用");
  await skill.getByRole("button", { name: "停用", exact: true }).click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "发布状态联动", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请选择已发布的技能");
  await expect(
    page.getByRole("button", { name: "模拟运行", exact: true }),
  ).toBeDisabled();
});

test("workflow resolves the configured model library rather than demo model state", async ({
  page,
}) => {
  await page.goto(entry);
  await create(page, "真实前端配置联动");
  await page.getByRole("button", { name: "用户菜单" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("switch", { name: "启用模型 balanced", exact: true })
    .click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page
    .getByRole("button", { name: "真实前端配置联动", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模型不可用");
  await expect(
    page.getByRole("button", { name: "模拟运行", exact: true }),
  ).toBeDisabled();
});

test("simulation pauses at manual confirmation, reruns, and completes automatically", async ({
  page,
}) => {
  await page.goto(entry);
  await create(page, "前端运行演练", true);
  await page.getByRole("button", { name: "前端运行演练", exact: true }).click();
  await page.getByRole("button", { name: "模拟运行", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认通过", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "驳回重跑", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认通过", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认通过", exact: true }).click();
  await expect(page.locator(".wf-run-summary")).toContainText(
    "1 次人工确认 · 1 次驳回重跑",
  );
  await expect(page.getByRole("log")).toContainText("自动确认通过");
});

test("legacy workflow data is migrated without losing references or task status", async ({
  page,
}) => {
  await page.goto(entry);
  await page.evaluate(() => {
    localStorage.removeItem("beivymate.ui.v1.workflow-library");
    localStorage.setItem(
      "beivymate.ui.v1.workflows",
      JSON.stringify([
        {
          id: "legacy",
          name: "迁移保留的工作流",
          skills: ["document_summary"],
          tasks: [{ name: "历史待确认任务", status: "待确认" }],
        },
      ]),
    );
  });
  await page.reload();
  await expect(page.locator(".wf-card")).toHaveCount(1);
  await expect(page.locator(".wf-card")).toContainText("文档摘要");
  await page
    .locator(".wf-card")
    .getByRole("button", { name: "停用", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("历史待确认任务");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.reload();
  await expect(page.locator(".wf-card")).toHaveCount(1);
  await page.evaluate(() =>
    localStorage.setItem("beivymate.ui.v1.workflow-library", "[{}]"),
  );
  await page.reload();
  await expect(page.locator(".wf-card")).toContainText("迁移保留的工作流");
});

test("mobile disable dialog and empty-task state keep comfortable spacing", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(entry);
  await create(page, "没有关联任务的工作流");
  const card = page.locator(".wf-card").filter({
    has: page.getByRole("heading", {
      name: "没有关联任务的工作流",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "停用", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("当前没有正在使用该工作流的任务");
  expect(
    await dialog
      .locator(".wc-body")
      .evaluate((el) => getComputedStyle(el).paddingLeft),
  ).toBe("20px");
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(15);
  expect(box!.width).toBeLessThanOrEqual(358);
  await expect(dialog.getByRole("button", { name: "确认停用" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("disable-workflow-mobile.png"),
  });
});

test("workflow search and status filters match the skills toolbar without summary cards", async ({
  page,
}, info) => {
  await page.goto("/?ui=skills#skills");
  const skillSearch = await page
    .locator(".sc-search:visible")
    .evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      border: getComputedStyle(el).border,
      radius: getComputedStyle(el).borderRadius,
    }));
  const skillFilter = await page
    .locator(".sc-source-filter > button")
    .first()
    .evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      border: getComputedStyle(el).border,
      radius: getComputedStyle(el).borderRadius,
    }));
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await expect(page.locator(".wf-stats")).toHaveCount(0);
  const workflowSearch = await page
    .locator(".sc-search:visible")
    .evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      border: getComputedStyle(el).border,
      radius: getComputedStyle(el).borderRadius,
    }));
  expect(workflowSearch).toEqual(skillSearch);
  const filter = page.getByLabel("工作流状态筛选");
  expect(
    await filter
      .locator("button")
      .first()
      .evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        border: getComputedStyle(el).border,
        radius: getComputedStyle(el).borderRadius,
      })),
  ).toEqual(skillFilter);
  const total = await page.locator(".wf-card").count();
  await expect(filter.locator("button").first().locator("span")).toHaveText(
    String(total),
  );
  await page.getByLabel("搜索工作流", { exact: true }).fill("支付异常验证");
  await expect(page.locator(".wf-card")).toHaveCount(1);
  await page.getByLabel("搜索工作流", { exact: true }).fill("");
  await filter.getByRole("button", { name: /已停用/ }).click();
  for (const card of await page.locator(".wf-card").all())
    await expect(card).toContainText("已停用");
  await filter.locator("button").first().click();
  await expect(page.locator(".wf-card")).toHaveCount(total);
  await page.screenshot({
    path: info.outputPath("workflow-toolbar-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workflow-toolbar-mobile.png"),
    fullPage: true,
  });
});
