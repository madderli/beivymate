import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";
async function enter(page: Page) {
  await page.goto("/?preview=agent");
  await page.getByRole("button", { name: "体验登录" }).click();
  await page.getByRole("button", { name: "进入 Agent" }).click();
}
test("default workspace, task confirmation, immutable completion and copy", async ({
  page,
}) => {
  await enter(page);
  await expect(
    page.getByRole("heading", { name: "欢迎回来，我们继续吧。" }),
  ).toBeVisible();
  await expect(page.locator(".ad-resume")).not.toContainText(
    "患者信息查询验证",
  );
  await page.screenshot({
    path: "tests/ui/test-results/agent-demo-workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /门诊微信支付 · 需求验证/ }).click();
  await expect(page.locator(".ad-execution")).toContainText("待确认");
  await page.screenshot({
    path: "tests/ui/test-results/agent-demo-task.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认并继续" }).click();
  await expect(page.getByRole("button", { name: "确认并继续" })).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "确认并继续" }).click();
  await expect(page.getByRole("button", { name: "确认并继续" })).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "确认并继续" }).click();
  await expect(page.getByRole("button", { name: "开始任务" })).toHaveCount(0);
  await expect(page.locator(".ad-execution-meta")).toContainText("已完成");
  await page.getByRole("button", { name: "复制任务" }).click();
  await expect(page.getByRole("heading", { name: /（副本）/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始任务" })).toBeEnabled();
});
test("deleted skills invalidate workflow and copied tasks, UI replacement repairs task", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "技能（Skills）", exact: true })
    .click();
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "需求理解", exact: true }),
    })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page
    .getByRole("button", { name: "工作流（Workflow）", exact: true })
    .click();
  await expect(page.locator(".ad-invalid")).toContainText("Skill 已删除");
  await page.getByRole("button", { name: /^HIS/ }).click();
  await page.getByRole("button", { name: /门诊微信支付 · 需求验证/ }).click();
  await expect(page.getByRole("button", { name: "确认并继续" })).toBeDisabled();
  await page.getByRole("button", { name: "复制任务" }).click();
  await expect(page.getByRole("button", { name: "开始任务" })).toBeDisabled();
  await page.getByRole("button", { name: "编辑任务" }).click();
  await page.getByLabel("任务步骤1技能").selectOption("s2");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByRole("button", { name: "开始任务" })).toBeEnabled();
});
test("first use creates persisted default workspace; statistics filter and mobile fit", async ({
  page,
}) => {
  await page.goto("/?preview=agent");
  await page.getByRole("button", { name: "体验登录" }).click();
  await page
    .getByRole("button", { name: "体验首次使用：创建第一个工作区" })
    .click();
  await page.getByLabel("名称", { exact: true }).fill("新产品");
  await page.getByRole("button", { name: "保存工作区" }).click();
  await expect(
    page.getByRole("heading", { name: "今天，有什么需要我协助？" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "体验登录" }).click();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(page.locator(".ad-header")).toContainText("新产品");
  await page.getByLabel("发送给 Ivy").fill("验证登录功能");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(
    page.getByRole("heading", { name: "验证登录功能" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "tests/ui/test-results/agent-demo-mobile.png",
    fullPage: true,
  });
});
test("statistics time filter changes totals and paused workflow blocks execution", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: /我的任务/ }).click();
  await expect(page.locator(".ad-metrics > div").first()).toContainText("4");
  await page.getByLabel("统计时间").selectOption("近7天");
  await expect(page.locator(".ad-metrics > div").first()).toContainText("3");
  await page.getByLabel("统计工作区").selectOption("cis");
  await expect(page.locator(".ad-metrics > div").first()).toContainText("1");
  await page
    .getByRole("button", { name: "工作流（Workflow）", exact: true })
    .click();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: /^HIS/ }).click();
  await page.getByRole("button", { name: /住院结算回归测试/ }).click();
  await expect(page.getByRole("button", { name: "开始任务" })).toBeDisabled();
});

test("workspace keeps header and composer stationary with long task lists and conversations", async ({
  page,
}) => {
  await enter(page);
  await page.evaluate(() => {
    const key = "beivymate-agent-design-demo-v1";
    const data = JSON.parse(localStorage.getItem(key)!);
    const source = data.tasks[0];
    data.tasks = Array.from({ length: 25 }, (_, i) => ({
      ...source,
      id: `long-${i}`,
      name: `任务 ${i}`,
      messages: Array.from({ length: 35 }, () => ({
        who: "assistant",
        text: "用于检查长对话的内容。".repeat(20),
      })),
    }));
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole("button", { name: "体验登录" }).click();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(page.locator(".ad-header")).toHaveText("HIS 医院信息系统");
  await expect(
    page
      .locator(".ad-composer")
      .getByRole("button", { name: "新任务", exact: true }),
  ).toBeVisible();
  const header = await page.locator(".ad-header").boundingBox();
  const footer = await page.locator(".ad-composer-foot").boundingBox();
  const list = page.getByRole("region", { name: "继续工作任务列表" });
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole("button", { name: /^任务 24 / })).toBeVisible();
  expect(await page.locator(".ad-header").boundingBox()).toEqual(header);
  expect(await page.locator(".ad-composer-foot").boundingBox()).toEqual(footer);
  await page.getByRole("button", { name: /^任务 24 / }).click();
  await page.locator(".ad-chat-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await page.locator(".ad-header").boundingBox()).toEqual(header);
  expect((await page.locator(".ad-composer-foot").boundingBox())!.y).toBe(
    footer!.y,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await expect(page.locator(".ad-composer-foot")).toBeInViewport();
});

test("attachments preview and removal, and quick task creation from a task", async ({
  page,
}) => {
  await enter(page);
  const welcome = await page.locator(".ad-welcome").boundingBox();
  const composer = await page.locator(".ad-composer").boundingBox();
  expect(composer!.y - (welcome!.y + welcome!.height)).toBeLessThan(25);
  await page.getByLabel("上传图片或文字附件").setInputFiles([
    {
      name: "需求.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("支付测试需求"),
    },
    {
      name: "界面.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    },
  ]);
  await page.getByRole("button", { name: "预览 需求.md", exact: true }).click();
  await expect(page.locator(".ad-text-preview")).toHaveText("支付测试需求");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page
    .getByRole("button", { name: "预览 界面.png", exact: true })
    .click();
  await expect(page.locator(".ad-file-preview")).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "移除 界面.png" }).click();
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(
    page
      .locator(".ad-message")
      .getByRole("button", { name: "预览 需求.md", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ad-composer .ad-attachments")).toBeEmpty();
  await page.getByRole("button", { name: "新任务", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("新的回归任务");
  await page.getByLabel("工作流", { exact: true }).selectOption("f1");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "新的回归任务", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始任务", exact: true }),
  ).toBeEnabled();
});
