import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
import { boardFixture, session } from "./fixtures";
test("production shell uses server data, not demo storage; completed tasks remain read-only", async ({
  page,
}) => {
  const board = boardFixture();
  board.tasks[0].status = "completed";
  await page.addInitScript(() =>
    localStorage.setItem(
      "beivymate-agent-design-demo-v1",
      JSON.stringify({ tasks: [{ name: "不能显示的模拟任务" }] }),
    ),
  );
  await page.route("**/api/v1/session", (r) => r.fulfill({ json: session }));
  await page.route("**/api/v1/workbench", (r) =>
    r.fulfill({ json: { ...board, defaultWorkspace: board.workspaces[0].id } }),
  );
  await page.route("**/api/v1/notifications", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/v1/tasks/*/runs", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/v1/conversations/**", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(page.locator(".ad-header")).toContainText(
    board.workspaces[0].name,
  );
  await expect(page.locator("body")).not.toContainText("不能显示的模拟任务");
  await expect(page.locator(".ad-chat-main")).not.toContainText(
    board.tasks[0].title,
  );
  await page.getByRole("button", { name: "工作区", exact: true }).click();
  await expect(
    page.getByText("已完成任务 · 查看历史或复制", { exact: true }),
  ).toHaveCount(0);
  // Completed-task deep links still preserve read-only history access.
  await page.evaluate((id) => {
    location.hash = `task/${id}`;
  }, board.tasks[0].id);
  await expect(page.getByRole("button", { name: "准备新运行" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "复制任务" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "删除任务" })).toHaveCount(0);
});
test("unavailable API cannot authenticate or create tasks", async ({
  page,
}) => {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 503, json: { message: "服务未启动" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".ad-task-list")).toHaveCount(0);
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
  await expect(page.getByRole("alert")).toContainText("后端接口未接通");
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
