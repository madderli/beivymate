import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";
import { boardFixture, session } from "./fixtures";
async function connected(page: Page) {
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/api/v1/workbench", (route) =>
    route.fulfill({ json: boardFixture() }),
  );
  await page.route("**/api/v1/conversations/**/messages", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "你好，林晓 ✦" }),
  ).toBeVisible();
}
test("disconnected default shows no fixture records, fake login or writable actions", async ({
  page,
}) => {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 503, json: { message: "服务未启动" } }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "beivymate.ui-m01.v1",
      JSON.stringify({ tasks: [{ title: "不能当作正式记录" }] }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "查看页面布局（只读）" }).click();
  await expect(
    page.getByRole("button", { name: "新建任务", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("医院信息系统", { exact: true })).toHaveCount(0);
  await expect(page.getByText("不能当作正式记录")).toHaveCount(0);
  await page.getByRole("button", { name: "与 Agent 对话" }).click();
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("beivymate.ui-m01.v1")!).tasks[0].title,
    ),
  ).toBe("不能当作正式记录");
});
test("HTML fallback is not treated as a successful API response", async ({
  page,
}) => {
  await page.route("**/api/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html>frontend</html>",
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("后端 API 未接通");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeDisabled();
});
test("credentials go to the API, failed login never creates a browser session", async ({
  page,
}) => {
  let sent: unknown;
  await page.route("**/api/v1/session", (route) => {
    if (route.request().method() === "POST") {
      sent = route.request().postDataJSON();
      return route.fulfill({
        status: 401,
        json: { message: "账号或密码错误" },
      });
    }
    return route.fulfill({ json: { authenticated: false, capabilities: [] } });
  });
  await page.goto("/");
  await page.getByLabel("用户名").fill("test-user");
  await page.getByLabel("密码", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码错误");
  expect(sent).toEqual({
    username: "test-user",
    password: "not-a-real-password",
    role: "tester",
  });
  expect(
    await page.evaluate(() => sessionStorage.getItem("beivy-demo-session")),
  ).toBeNull();
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
});
test("task creation uploads attachments and preserves the form on server failure", async ({
  page,
}) => {
  await connected(page);
  let body = "";
  let csrf = "";
  await page.route("**/api/v1/tasks", (r) => {
    body = r.request().postData() || "";
    csrf = r.request().headers()["x-csrf-token"];
    return r.fulfill({
      status: 422,
      json: { message: "后端：工作流输入不完整" },
    });
  });
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称").fill("寿险产品验收");
  await dialog.getByLabel("需求附件").setInputFiles({
    name: "requirement.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("寿险投保要求"),
  });
  await dialog.getByLabel("目标版本").fill("1");
  await dialog.getByLabel("环境标识").fill("uat");
  await dialog.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("工作流输入不完整");
  await expect(dialog.getByLabel("任务名称")).toHaveValue("寿险产品验收");
  expect(body).toContain("requirement.md");
  expect(body).toContain("寿险投保要求");
  expect(csrf).toBe("test-csrf");
});
test("start command cannot fabricate a running or completed state", async ({
  page,
}) => {
  await connected(page);
  let action: unknown;
  await page.route("**/api/v1/tasks/*/actions", (r) => {
    action = r.request().postDataJSON();
    return r.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.locator(".task-row").filter({ hasText: "问诊支付同步" }).click();
  await page.getByRole("button", { name: "启动", exact: true }).click();
  await expect(page.locator(".task-overline")).toContainText("待执行");
  expect(action).toEqual({ action: "start", expectedRevision: "task-r1" });
  await page.reload();
  await expect(page.locator(".task-overline")).toContainText("待执行");
});
test("review is version/hash bound; stale response leaves artifact and task unchanged", async ({
  page,
}) => {
  await connected(page);
  let decision: any;
  await page.route("**/api/v1/tasks/*/steps/*/artifact", (r) =>
    r.fulfill({
      json: {
        id: "artifact-A",
        revision: "3",
        subjectHash: "hash-A",
        title: "真实接口产物",
        content: "这是接口返回的内容，不是页面内置规则。",
        sources: ["requirement:1"],
        reviewable: true,
      },
    }),
  );
  await page.route("**/api/v1/tasks/*/steps/*/review", (r) => {
    decision = r.request().postDataJSON();
    return r.fulfill({
      status: 409,
      json: { message: "产物版本已变化，请重新加载" },
    });
  });
  await page.locator(".task-row").filter({ hasText: "支付跨产品验证" }).click();
  await page.getByRole("button", { name: "查看产物", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("不是页面内置规则");
  await page.getByRole("button", { name: "确认当前版本" }).click();
  expect(decision).toMatchObject({
    artifactId: "artifact-A",
    revision: "3",
    expectedSubjectHash: "hash-A",
    decision: "approved",
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("产物版本已变化");
});
test("conversation never fabricates a reply and model options come from backend", async ({
  page,
}) => {
  await connected(page);
  await page.route("**/api/v1/conversations/**/messages", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 503, json: { message: "模型连接不可用" } })
      : r.fulfill({ json: [] }),
  );
  await page.getByRole("button", { name: "与 Agent 对话" }).click();
  await page.getByLabel("对话模型").selectOption("local-test");
  await page
    .getByRole("textbox", { name: "发送消息", exact: true })
    .fill("分析需求");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("模型连接不可用");
  await expect(page.locator(".assistant-message")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "发送消息", exact: true }),
  ).toHaveValue("分析需求");
});
for (const width of [1440, 1024, 390])
  test("responsive API-fed workbench " + width, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await connected(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("workbench.png"),
      fullPage: true,
    });
    await page
      .locator(".task-row")
      .filter({ hasText: "支付跨产品验证" })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "切换明暗主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

test("slow workbench responses are not superseded by polling", async ({
  page,
}) => {
  await connected(page);
  let calls = 0;
  await page.route("**/api/v1/workbench", async (r) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 6500));
    const board = boardFixture();
    board.tasks[0].title = "慢响应已经更新";
    await r.fulfill({ json: board });
  });
  await expect(page.getByText("慢响应已经更新").first()).toBeVisible({
    timeout: 16000,
  });
  expect(calls).toBe(1);
});

test("outage preserves a stale snapshot, disables writes and recovers", async ({
  page,
}) => {
  await connected(page);
  await page.route("**/api/v1/workbench", (r) =>
    r.fulfill({ status: 503, json: { message: "暂时断线" } }),
  );
  await expect(
    page.getByText("连接中断 · 显示上次快照（可能过期）"),
  ).toBeVisible({ timeout: 8000 });
  await expect(
    page.locator(".task-row").filter({ hasText: "支付跨产品验证" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新建任务", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/v1/workbench");
  await page.route("**/api/v1/workbench", (r) =>
    r.fulfill({ json: boardFixture() }),
  );
  await expect(page.getByText("后端已连接", { exact: true })).toBeVisible({
    timeout: 8000,
  });
});

test("artifact arriving after a task switch cannot open on the new task", async ({
  page,
}) => {
  await connected(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/tasks/*/steps/*/artifact", async (r) => {
    await gate;
    await r.fulfill({
      json: {
        id: "old",
        revision: "1",
        subjectHash: "hash",
        title: "旧任务产物",
        content: "不能出现在新任务",
        sources: [],
        reviewable: true,
      },
    });
  });
  await page.locator(".task-row").filter({ hasText: "支付跨产品验证" }).click();
  const request = page.waitForRequest("**/artifact");
  await page.getByRole("button", { name: "查看产物", exact: true }).click();
  await request;
  await page.evaluate(() => {
    location.hash = "task/TASK-2026-00001-R01";
  });
  await expect(
    page.getByRole("heading", { name: "问诊支付同步", exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("button", { name: "启动", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("expired session clears business data", async ({ page }) => {
  await connected(page);
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ status: 401, json: { message: "会话已失效" } }),
  );
  await expect(page.getByLabel("密码", { exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.locator(".task-row")).toHaveCount(0);
});

test("workspace save success refreshes the server snapshot", async ({
  page,
}) => {
  await connected(page);
  const board = boardFixture();
  await page.route("**/api/v1/workbench", (r) => r.fulfill({ json: board }));
  await page.route("**/api/v1/workspaces", (r) => {
    const value = r.request().postDataJSON();
    board.workspaces.push({
      ...value,
      paused: false,
      color: "purple",
      revision: "1",
    });
    return r.fulfill({ status: 201, json: { id: value.id } });
  });
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("产品标识").fill("NEW");
  await dialog.getByLabel("工作区名称").fill("新的产品");
  await dialog.getByRole("button", { name: "保存工作区" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("新的产品").first()).toBeVisible();
});

test("task retry keeps its key and shows the server task", async ({ page }) => {
  await connected(page);
  const board = boardFixture();
  const keys: string[] = [];
  await page.route("**/api/v1/workbench", (r) => r.fulfill({ json: board }));
  await page.route("**/api/v1/tasks", (r) => {
    keys.push(r.request().headers()["idempotency-key"]);
    if (keys.length === 1)
      return r.fulfill({ status: 503, json: { message: "保存结果待核实" } });
    board.tasks.push({
      ...board.tasks[1],
      id: "SERVER-NEW",
      title: "新需求验收",
      group: "",
      main: true,
    });
    return r.fulfill({ status: 201, json: { id: "SERVER-NEW" } });
  });
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称").fill("新需求验收");
  await dialog.getByLabel("需求与工作目标").fill("验证需求");
  await dialog.getByLabel("目标版本").fill("1");
  await dialog.getByLabel("环境标识").fill("uat");
  await dialog.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("保存结果待核实");
  await dialog.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator(".task-row").filter({ hasText: "新需求验收" }),
  ).toHaveCount(1);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

test("keyboard can dismiss creation without writing", async ({ page }) => {
  await connected(page);
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") writes++;
  });
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toBe(0);
});

test("related task navigation preserves group identity", async ({ page }) => {
  await connected(page);
  await page.locator(".task-row").filter({ hasText: "支付跨产品验证" }).click();
  await page
    .locator(".related-strip")
    .getByRole("button", { name: /CIS/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "问诊支付同步", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-overline")).toContainText("关联任务");
});
