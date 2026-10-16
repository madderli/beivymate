import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";
import { boardFixture, session } from "./fixtures";
async function openApp(page: Page, many = false) {
  const board = boardFixture();
  if (many)
    board.workspaces = Array.from({ length: 30 }, (_, i) => ({
      ...board.workspaces[0],
      id: `WS${i}`,
      name: `工作区 ${i}`,
    }));
  await page.route("**/api/v1/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    return r.fulfill({
      json: path.endsWith("/session")
        ? session
        : path.endsWith("/workbench")
          ? { ...board, defaultWorkspace: board.workspaces[0].id }
          : [],
    });
  });
  await page.goto("/#home");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  if ((page.viewportSize()?.width || 1440) <= 600)
    await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "我的任务", exact: true }).click();
  return board;
}

test("sidebar groups workbench and tools with exact attachment icon sizes", async ({
  page,
}, info) => {
  const board = await openApp(page);
  const sidebar = page.locator(".product-sidebar");
  await expect(sidebar.getByRole("region", { name: "工作台" })).toContainText(
    "我的任务",
  );
  const tools = sidebar.getByRole("region", {
    name: "工具",
  });
  await expect(tools.getByRole("button")).toHaveCount(3);
  await expect(tools).toContainText("技能中心");
  await expect(tools).toContainText("工作流");
  await expect(sidebar.locator(".ps-count")).toHaveText(
    String(board.tasks.filter((t) => t.status !== "completed").length),
  );
  await expect(
    sidebar.locator('.ps-nav-item [data-sidebar-icon="tasks"]'),
  ).toHaveAttribute("width", "20");
  await expect(
    sidebar.locator('.ps-tool-item [data-sidebar-icon="skills"]'),
  ).toHaveAttribute("width", "18");
  expect(
    await sidebar
      .locator(".brand-icon")
      .evaluate((el) => getComputedStyle(el).width),
  ).toBe("28px");
  await expect(sidebar.locator(".ps-account-bar")).toContainText(
    session.user!.name,
  );
  await page.screenshot({
    path: info.outputPath("sidebar-desktop.png"),
    fullPage: true,
  });
  await sidebar.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  await sidebar.getByRole("button", { name: "工作流", exact: true }).click();
  await expect(page.getByRole("heading", { name: "我的工作流" })).toBeVisible();
});

test("workspace list collapses independently and navigation uses real workspace data", async ({
  page,
}) => {
  const board = await openApp(page);
  const sidebar = page.locator(".product-sidebar");
  await expect(sidebar.locator(".ps-workspace-row")).toHaveCount(
    board.workspaces.length,
  );
  await expect(sidebar.locator(".ps-default")).toHaveText("默认");
  await sidebar.getByRole("button", { name: "收起工作区列表" }).click();
  await expect(sidebar.locator(".ps-workspaces")).toBeHidden();
  await sidebar.getByRole("button", { name: "展开工作区列表" }).click();
  await sidebar.locator(".ps-workspace-row").first().click();
  await expect(page).toHaveURL(
    new RegExp(`#workspace/${board.workspaces[0].id}$`),
  );
  await sidebar.getByRole("button", { name: "工作区", exact: true }).click();
  await expect(page).toHaveURL(/#workspaces$/);
  await sidebar
    .getByRole("button", { name: "新增工作区", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("工作区名称", { exact: true }),
  ).toBeVisible();
});

test("account and settings remain accessible from the compact footer", async ({
  page,
}) => {
  await openApp(page);
  const sidebar = page.locator(".product-sidebar");
  await sidebar.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("模型配置");
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await sidebar.locator(".ps-account").click();
  await expect(page.getByRole("dialog")).toContainText("个人账户");
  await expect(
    sidebar.getByRole("button", { name: "退出登录", exact: true }),
  ).toHaveCount(1);
});

test("mobile drawer matches the attachment, closes with Escape, and restores focus", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const menu = page.getByRole("button", { name: "打开导航", exact: true });
  await menu.click();
  const sidebar = page.locator(".product-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.locator(".ps-account-bar")).toBeVisible();
  expect(await sidebar.evaluate((el) => el.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("sidebar-mobile.png") });
  await sidebar.getByRole("button", { name: "当前角色：测试工程师" }).click();
  await expect(
    sidebar.getByRole("button", { name: "产品经理 · 后续开放" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(sidebar.locator(".ps-role-menu")).toHaveCount(0);
  await expect(sidebar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sidebar).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await sidebar.getByRole("button", { name: "技能中心", exact: true }).click();
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
});

test("many workspaces scroll while footer stays visible on a small phone", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openApp(page, true);
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  const sidebar = page.locator(".product-sidebar");
  expect(await sidebar.evaluate((el) => el.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(
    await sidebar
      .locator(".ps-scroll")
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  const footer = await sidebar.locator(".ps-account-bar").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(640);
  await expect(
    sidebar.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("sidebar-small-phone.png") });
  await sidebar.getByRole("button", { name: "关闭导航", exact: true }).click();
  await expect(sidebar).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});

test("sidebar trailing indicators align and workspace tasks use reminder row heights", async ({
  page,
}, info) => {
  await openApp(page);
  const sidebar = page.locator(".product-sidebar");
  const count = await sidebar.locator(".ps-count").boundingBox();
  const center = count!.x + count!.width / 2;
  for (const arrow of await sidebar
    .locator(".ps-workspace-toggle .ps-icon, .ps-workspace-row > .ps-icon")
    .all()) {
    const box = await arrow.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - center)).toBeLessThan(1);
  }
  const rowHeight = await page
    .locator(".task-reminder .ad-task-list > button")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  await sidebar.locator(".ps-workspace-row").first().click();
  await expect(
    page.locator(".workspace-conversation-intro .task-reminder"),
  ).toContainText("还有 1 项任务需要你的协助");
  const workspaceRow = page
    .locator(".workspace-reminder-tasks .ad-task-list > button")
    .first();
  expect(
    await workspaceRow.evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(rowHeight);
  await expect(
    page.getByText("和 OmniAlba 说说你的想法", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".ad-composer-foot")).toHaveCount(0);
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toHaveAttribute(
    "placeholder",
    "告诉 OmniAlba 你想完成什么？你也可以从点击「新任务」开始…",
  );
  await expect(page.locator(".ad-header .workspace-header-id")).toHaveText(
    "HIS",
  );
  await page.screenshot({
    path: info.outputPath("workspace-conversation.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workspaceRow).toBeVisible();
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workspace-conversation-mobile.png"),
    fullPage: true,
  });
  let sent = false;
  await page.route("**/conversations/**/messages", (route) => {
    if (route.request().method() === "POST") {
      sent = true;
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({
      json: sent
        ? [
            { id: "m1", role: "user", text: "帮我梳理今天的任务" },
            { id: "m2", role: "assistant", text: "我们先处理需要确认的任务。" },
          ]
        : [],
    });
  });
  await page
    .getByLabel("发送给 Ivy", { exact: true })
    .fill("帮我梳理今天的任务");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  const userBubble = page.locator(
    ".ad-chat-scroll > .ad-message.user .workspace-message-bubble",
  );
  const assistantBubble = page.locator(
    ".ad-chat-scroll > .ad-message.assistant .workspace-message-bubble",
  );
  await expect(userBubble).toContainText("帮我梳理今天的任务");
  await expect(assistantBubble).toContainText("我们先处理需要确认的任务。");
  expect(
    await userBubble.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(
    await assistantBubble.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    ),
  );
  await expect(page.getByLabel("发送给 Ivy", { exact: true })).toHaveValue("");
});

test("entering the app opens the configured default workspace", async ({
  page,
}) => {
  const board = boardFixture();
  board.defaultWorkspace = "CIS";
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({
      json: new URL(r.request().url()).pathname.endsWith("/session")
        ? session
        : new URL(r.request().url()).pathname.endsWith("/workbench")
          ? board
          : [],
    }),
  );
  await page.goto("/#home");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(page).toHaveURL(/#workspace\/CIS$/);
  await expect(page.locator(".workspace-conversation-context")).toHaveText(
    board.workspaces[1].name,
  );
});

test("workspace assistant scrolls within a fixed height and composer stays nearby", async ({
  page,
}, info) => {
  const board = await openApp(page);
  board.tasks = Array.from({ length: 12 }, (_, i) => ({
    ...board.tasks[0],
    id: `TASK-EXAMPLE-${i}`,
    title: `任务示例 ${i + 1}`,
  }));
  await page.route("**/api/v1/workbench", (r) => r.fulfill({ json: board }));
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.locator(".ps-workspace-row").first().click();
  const bubble = page.locator(
    ".workspace-conversation-intro .task-reminder-bubble",
  );
  const dimensions = await bubble.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    client: el.clientHeight,
    scroll: el.scrollHeight,
    overflow: getComputedStyle(el).overflowY,
  }));
  expect(dimensions.height).toBeGreaterThan(340);
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  expect(dimensions.overflow).toBe("auto");
  const assistant = await page
    .locator(".workspace-conversation-intro")
    .boundingBox();
  const composer = await page.locator(".ad-composer").boundingBox();
  expect(composer!.y - assistant!.y - assistant!.height).toBeCloseTo(24, 0);
  expect(composer!.height).toBe(180);
  expect(composer!.y + composer!.height).toBeCloseTo(
    page.viewportSize()!.height - 24,
    0,
  );
  await bubble.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    bubble.getByRole("button", { name: /任务示例 12/ }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("workspace-fixed-assistant.png"),
    fullPage: true,
  });
});
