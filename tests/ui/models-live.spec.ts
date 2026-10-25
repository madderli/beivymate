import { test, expect } from "../../src/frontend/node_modules/@playwright/test";
test("real model management, HTTP calls, inheritance, chat and frozen skill run", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("显示名称", { exact: true }).fill("模型验收员");
  await page.getByLabel("用户名", { exact: true }).fill("models@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("Secure-Password-123!");
  await page
    .getByLabel("初始化码", { exact: true })
    .fill("browser-test-initialization");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await page.getByRole("button", { name: "我已保存，返回登录" }).click();
  await page.getByLabel("用户名", { exact: true }).fill("models@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Secure-Password-123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "模型配置", exact: true })
    .click();
  await expect(page.getByLabel("通用默认模型", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "返回技能中心", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".homepage-heading h1:visible")).toHaveText(
    "模型配置",
  );
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: /添加厂商/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("请输入厂商名称和 Base URL");
  await expect(dialog.getByRole("alert")).toBeInViewport();
  await expect(dialog.getByRole("alert")).toBeFocused();

  await dialog.getByLabel("厂商名称", { exact: true }).fill("HTTP 验收厂商");
  await dialog
    .getByLabel("Base URL", { exact: true })
    .fill("http://127.0.0.1:8002/v1");
  await dialog.getByLabel("API Key", { exact: true }).fill("fixture-secret");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  // A directory request that never answers must not trap the user in the dialog.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stalled = async (
    route: import("../../src/frontend/node_modules/@playwright/test").Route,
  ) => {
    await held;
    await route.abort().catch(() => {});
  };
  await page.route("**/api/v1/models/connection/discover", stalled);
  await dialog
    .getByRole("button", { name: "测试并发现模型", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "测试中…", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await expect(dialog).toBeHidden();
  release();
  await page.unroute("**/api/v1/models/connection/discover", stalled);
  await page.getByRole("button", { name: /添加厂商/ }).click();
  await dialog.getByLabel("厂商名称", { exact: true }).fill("HTTP 验收厂商");
  await dialog
    .getByLabel("Base URL", { exact: true })
    .fill("http://127.0.0.1:8002/v1");
  await dialog.getByLabel("API Key", { exact: true }).fill("fixture-secret");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog
    .getByRole("button", { name: "测试并发现模型", exact: true })
    .click();
  await expect(dialog.getByText("fixture-a", { exact: true })).toBeVisible();
  await expect(dialog.getByText("未添加", { exact: true })).toHaveCount(2);
  await expect(dialog.locator(".mdiscovery-row input:checked")).toHaveCount(2);
  await dialog.getByRole("button", { name: "清空已选", exact: true }).click();
  await expect(dialog.locator(".mdiscovery-row input:checked")).toHaveCount(0);
  await dialog.getByRole("switch", { name: "只看已选" }).click();
  await expect(
    dialog.getByText("还没有勾选任何模型", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("switch", { name: "只看已选" }).click();
  await dialog.getByLabel("搜索发现的模型").fill("FIXTURE-A");
  await expect(dialog.getByLabel("搜索发现的模型")).toHaveCSS(
    "outline-style",
    "none",
  );
  await expect(dialog.getByLabel("搜索发现的模型")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(dialog.locator(".mdiscovery-search")).toHaveCSS(
    "border-top-width",
    "1px",
  );
  await expect(dialog.locator(".mdiscovery-row")).toHaveCount(1);
  await dialog
    .getByRole("checkbox", { name: "全选当前结果", exact: true })
    .check();
  await expect(dialog.locator(".mdiscovery-hint")).toContainText(
    "已勾选当前筛选的 1 项",
  );
  await dialog
    .getByRole("button", { name: "点此全选全部 2 项未添加模型" })
    .click();
  await dialog.getByRole("button", { name: "清除搜索", exact: true }).click();
  await dialog
    .getByRole("checkbox", { name: "fixture-a", exact: true })
    .uncheck();
  await expect(
    dialog.getByRole("checkbox", { name: "全选当前结果", exact: true }),
  ).toHaveJSProperty("indeterminate", true);
  await dialog.getByRole("switch", { name: "只看已选" }).click();
  await expect(dialog.locator(".mdiscovery-row")).toHaveCount(1);
  await expect(
    dialog.getByText("fixture-b", { exact: true }).first(),
  ).toBeVisible();
  await dialog.getByRole("switch", { name: "只看已选" }).click();
  await dialog.getByLabel("搜索发现的模型").fill("no-match");
  await expect(dialog.getByText("没有匹配「no-match」的模型")).toBeVisible();
  await dialog.getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(dialog.locator(".mdiscovery-row input:checked")).toHaveCount(1);
  await dialog
    .getByRole("checkbox", { name: "全选当前结果", exact: true })
    .check();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "确认添加", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".mr-table tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "编辑 HTTP 验收厂商", exact: true })
    .click();
  await dialog.getByRole("button", { name: "重新测试", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("填写完整鉴权信息");
  await dialog.getByLabel("API Key", { exact: true }).fill("changed-invalid");
  await dialog.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("API Key 无效");
  await dialog
    .getByLabel("使用已保存的密钥（不显示原文）", { exact: true })
    .check();
  await dialog.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(dialog.getByText("已添加", { exact: true })).toHaveCount(2);
  await expect(dialog.locator(".mdiscovery-row.added input")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭弹窗", exact: true }).click();

  await page.getByRole("button", { name: "检查模型版本", exact: true }).click();
  await expect(page.locator(".mr-group-head").getByRole("status")).toContainText("厂商未提供版本信息，暂时无法确认是否有更新");
  let versionStatus = "latest";
  await page.route("**/api/v1/models/lifecycle/check", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    for (const id of result.checkedModels) result.models[id].versionStatus = versionStatus;
    await route.fulfill({ response, json: result });
  });
  await page.getByRole("button", { name: "检查模型版本", exact: true }).click();
  await expect(page.locator(".mr-group-head").getByRole("status")).toHaveText("模型检查完成，当前模型均为最新版本。");
  versionStatus = "update_available";
  await page.getByRole("button", { name: "检查模型版本", exact: true }).click();
  await expect(page.locator(".mr-group-head").getByRole("status")).toContainText(/fixture-(?:a、fixture-b|b、fixture-a)模型有新版本，请使用“更换模型”功能更新。/);
  await page.unroute("**/api/v1/models/lifecycle/check");

  expect(
    (await (await page.request.get("/api/v1/models")).json()).models,
  ).toHaveLength(2);
  const card = (name: string) =>
    page
      .locator(".mr-table tbody tr")
      .filter({ has: page.locator("code").getByText(name, { exact: true }) });
  await expect(
    card("fixture-a").getByText("fixture-a", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "选择模型", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "选择模型", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  let finishToggle!: () => void;
  const toggleWait = new Promise<void>((resolve) => {
    finishToggle = resolve;
  });
  const holdSave = async (
    route: import("../../src/frontend/node_modules/@playwright/test").Route,
  ) => {
    if (route.request().method() === "PUT") await toggleWait;
    await route.continue();
  };
  await page.route("**/api/v1/models", holdSave);
  await page
    .getByRole("switch", { name: "启用厂商 HTTP 验收厂商", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "检查模型版本", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "同步中…", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑 HTTP 验收厂商", exact: true }),
  ).toBeEnabled();
  finishToggle();
  await expect(
    page.getByRole("switch", { name: "启用厂商 HTTP 验收厂商", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.unroute("**/api/v1/models", holdSave);
  await page
    .getByRole("switch", { name: "启用厂商 HTTP 验收厂商", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "启用厂商 HTTP 验收厂商", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await card("fixture-a")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await dialog.getByLabel("输出单价", { exact: true }).scrollIntoViewIfNeeded();
  const priceBoxes = await Promise.all(
    ["计费币种", "输入单价", "输出单价"].map((name) => dialog.getByLabel(name, { exact: true }).boundingBox()),
  );
  for (const box of priceBoxes) expect(box!.width).toBeGreaterThan(100);
  const editorFooter = await dialog.locator(".mr-footer").boundingBox();
  expect(priceBoxes[2]!.y + priceBoxes[2]!.height + 12).toBeLessThanOrEqual(editorFooter!.y);
  expect(Math.abs(priceBoxes[0]!.y - priceBoxes[1]!.y)).toBeLessThan(4);
  expect(Math.abs(priceBoxes[1]!.y - priceBoxes[2]!.y)).toBeLessThan(4);
  expect(priceBoxes[0]!.x + priceBoxes[0]!.width).toBeLessThan(priceBoxes[1]!.x);
  expect(priceBoxes[1]!.x + priceBoxes[1]!.width).toBeLessThan(priceBoxes[2]!.x);
  await dialog
    .getByLabel("来源标注", { exact: true })
    .fill("本机 HTTP 验收来源");
  await dialog.getByRole("button", { name: "校准", exact: true }).click();
  const calibration = page.locator(".mr-calibration-dialog");
  await calibration.getByLabel("结构化输出（JSON）", { exact: true }).check();
  await calibration
    .getByLabel("校准依据", { exact: true })
    .fill("HTTP 测试服务支持结构化输出");
  await calibration
    .getByRole("button", { name: "确认校准", exact: true })
    .click();
  await dialog.getByRole("button", { name: "保存模型" }).click();
  await expect(dialog).toBeHidden();
  await card("fixture-a")
    .getByRole("button", { name: "连接测试", exact: true })
    .click();
  await expect(page.locator(".ms-probe-result")).toContainText(
    "实际模型：fixture-a",
  );
  const failProbe = async (
    route: import("../../src/frontend/node_modules/@playwright/test").Route,
  ) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        message: "API Key 无效或已失效，请在编辑厂商中更新密钥。",
      }),
    });
  await page.route("**/api/v1/models/*/test", failProbe);
  await card("fixture-b")
    .getByRole("button", { name: "连接测试", exact: true })
    .click();
  await expect(page.locator(".ms-probe-result.error")).toContainText(
    "连接测试失败：API Key 无效",
  );
  await expect(
    card("fixture-a").getByRole("button", { name: "连接测试", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/v1/models/*/test", failProbe);

  await page.getByRole("button", { name: "默认模型配置", exact: true }).click();
  await page
    .getByLabel("通用默认模型", { exact: true })
    .selectOption({ label: "fixture-a" });
  // Selecting is a draft until the user saves.
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/models")).json()).defaults
          .general,
    )
    .toBe("");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("默认设置已保存");
  await page
    .getByRole("radio", { name: /分别设置模型/ })
    .check();
  await expect(page.getByLabel("通用默认模型", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("默认对话模型", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("默认技能模型", { exact: true })).toBeEnabled();
  await page
    .getByLabel("默认对话模型", { exact: true })
    .selectOption({ label: "fixture-b" });
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/models")).json()).defaults.chat,
    )
    .not.toBe("");
  await page
    .getByRole("radio", { name: /统一使用一个模型/ })
    .check();
  await expect(page.getByLabel("通用默认模型", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("默认对话模型", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("默认技能模型", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/models")).json()).defaults.chat,
    )
    .toBe("");
  await page.screenshot({
    path: info.outputPath("models-defaults.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  const advancedHeader = page.locator(".ms-advanced-heading");
  const headerBox = await advancedHeader.boundingBox();
  const firstCardBox = await page.locator(".mr-mapping > section").first().boundingBox();
  expect(headerBox!.y + headerBox!.height).toBeLessThan(firstCardBox!.y);
  const savedBefore = await (await page.request.get("/api/v1/models")).json();
  const idA = savedBefore.models.find(
    (m: { identifier: string }) => m.identifier === "fixture-a",
  ).id;
  const idB = savedBefore.models.find(
    (m: { identifier: string }) => m.identifier === "fixture-b",
  ).id;
  await page.getByLabel("均衡映射模型", { exact: true }).selectOption(idA);
  const mapping = page.getByRole("article", { name: "均衡调用链" });
  await mapping
    .getByRole("button", { name: "添加备用模型", exact: true })
    .click();
  await page.getByLabel("选择备用模型", { exact: true }).selectOption(idB);
  await mapping.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByLabel("同档内降级", { exact: false }).check();
  await page.getByLabel("调用超时", { exact: true }).fill("900");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get("/api/v1/models")).json()).failover.timeout).toBe(900);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/models")).json()).backups[
          "均衡"
        ],
    )
    .toEqual([idB]);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "从平台导入", exact: false }),
  ).toHaveCount(0);
  await page.locator(".mr-table-wrap").evaluate((e) => {
    e.scrollLeft = 0;
  });
  await page.screenshot({
    path: info.outputPath("models-restored.png"),
    fullPage: true,
  });
  await card("fixture-a")
    .getByRole("button", { name: "更换模型", exact: true })
    .click();
  await dialog
    .getByLabel("目标模型版本", { exact: true })
    .selectOption("fixture-b");
  await dialog.getByRole("button", { name: "对比版本", exact: true }).click();
  await expect(dialog.locator(".mm-comparison")).toContainText("厂商未提供");
  await page.screenshot({
    path: info.outputPath("model-upgrade-comparison.png"),
  });
  await dialog
    .getByRole("button", { name: "查看影响范围", exact: true })
    .click();
  await expect(dialog.locator(".mm-references")).toContainText("通用默认模型");
  await page.screenshot({
    path: info.outputPath("model-upgrade-references.png"),
  });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await card("fixture-a")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(dialog).toContainText("存在受保护引用");
  await expect(
    dialog.getByRole("button", { name: "确认删除", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "新增工作区", exact: true }).click();
  await dialog.getByLabel("工作区标识（简称）", { exact: true }).fill("HIS");
  await dialog.getByLabel("工作区名称", { exact: true }).fill("医院系统");
  await dialog.getByRole("button", { name: "创建工作区", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("对话模型", { exact: true })).toContainText(
    "fixture-a",
  );
  await page.getByLabel("发送给 Ivy", { exact: true }).fill("你好");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(page.locator(".workspace-message-bubble")).toContainText([
    "你好",
    "HTTP 模型回复：fixture-a",
  ]);
  const session = await (await page.request.get("/api/v1/session")).json();
  const headers = {
    "X-CSRF-Token": session.csrfToken,
    Origin: "http://127.0.0.1:4173",
  };
  // Prepare a real structured Skill run through the same saved model catalog.
  const created = await page.request.post("/api/v1/tasks", {
    headers: { ...headers, "Idempotency-Key": "model-task" },
    multipart: {
      title: "模型冻结验收",
      workspace: "HIS",
      workflow: "m6_test_analysis",
      description: "支付成功后更新订单",
      version: "1",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const taskId = (await created.json()).id;
  const board = await (await page.request.get("/api/v1/workbench")).json();
  const task = board.tasks.find((t: { id: string }) => t.id === taskId);
  const prepared = await page.request.post(`/api/v1/tasks/${taskId}/runs`, {
    headers: { ...headers, "Idempotency-Key": "model-run" },
    data: { expectedRevision: task.revision },
  });
  expect(prepared.status(), await prepared.text()).toBe(202);
  const runId = (await prepared.json()).id;
  const catalog = await (await page.request.get("/api/v1/models")).json();
  const modelB = catalog.models.find(
    (m: { identifier: string }) => m.identifier === "fixture-b",
  );
  catalog.defaults.general = modelB.id;
  catalog.services = catalog.services.map(
    ({
      configured,
      credentialError,
      ...s
    }: {
      configured: boolean;
      credentialError: string;
    }) => {
      void configured;
      void credentialError;
      return s;
    },
  );
  expect(
    (await page.request.put("/api/v1/models", { headers, data: catalog })).ok(),
  ).toBe(true);
  const started = await page.request.post(`/api/v1/runs/${runId}/commands`, {
    headers: { ...headers, "Idempotency-Key": "start-frozen" },
    data: { action: "start" },
  });
  expect(started.status(), await started.text()).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/v1/runs/${runId}`)).json()).status,
    )
    .toBe("waiting_review");
  const detail = await (await page.request.get(`/api/v1/runs/${runId}`)).json();
  expect(Object.values(detail.models)).toContain("fixture-a");
  await page.reload();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await expect(page.getByLabel("对话模型", { exact: true })).toContainText(
    "跟随默认：fixture-b",
  );
  await page.getByLabel("发送给 Ivy", { exact: true }).fill("再问一次");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByText("HTTP 模型回复：fixture-b", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("对话模型", { exact: true })
    .selectOption(
      catalog.models.find(
        (m: { identifier: string }) => m.identifier === "fixture-a",
      ).id,
    );
  await page.getByLabel("发送给 Ivy", { exact: true }).fill("指定模型");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(
    page.getByText("HTTP 模型回复：fixture-a", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "模型配置", exact: true })
    .click();
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await card("fixture-a")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await dialog.getByLabel("显示名", { exact: true }).fill("不能修改被引用模型");
  await dialog.getByRole("button", { name: "保存模型" }).click();
  await expect(dialog.getByRole("alert")).toContainText("未关闭任务引用");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const beforeMigration = await (
    await page.request.get("/api/v1/models")
  ).json();
  await page.evaluate(() =>
    localStorage.setItem(
      "beivymate.ui.v1.models",
      JSON.stringify({
        services: [
          {
            id: "legacy-user",
            name: "历史自定义来源",
            kind: "自定义",
            endpoint: "http://127.0.0.1:8002/v1",
            protocol: "OpenAI 兼容",
            auth: "API Key",
            enabled: true,
          },
        ],
        models: [
          {
            id: "legacy-user-model",
            serviceId: "legacy-user",
            name: "历史自定义模型",
            identifier: "fixture-a",
            capabilities: ["text"],
            orientation: "均衡",
            enabled: true,
            pricing: "付费",
          },
        ],
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "模型配置", exact: true })
    .click();
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导入旧浏览器配置", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/models")).json()).models.length,
  ).toBe(beforeMigration.models.length);
  await page
    .getByRole("button", { name: "导入旧浏览器配置", exact: true })
    .click();
  await expect(dialog).toContainText("历史自定义模型");
  await dialog.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/models")).json()).models.length,
    )
    .toBe(beforeMigration.models.length + 1);
  expect(
    await page.evaluate(() => localStorage.getItem("beivymate.ui.v1.models")),
  ).toContain("历史自定义模型");
  const upgradeContent = `---\nid: ui_upgrade\nname: UI 升级技能\ndescription: 升级验收\nrole: common\nmodel: "${modelB.id}"\nmodel_preference: {"mode":"specific","model":"${modelB.id}","capabilities":[]}\n---\n指令内容。`;
  const skillSaved = await page.request.put("/api/v1/skill-center/ui_upgrade", {
    headers,
    data: { content: upgradeContent, state: "draft", files: [] },
  });
  expect(skillSaved.ok(), await skillSaved.text()).toBe(true);
  await card("fixture-b")
    .getByRole("button", { name: "更换模型", exact: true })
    .click();
  await dialog.getByLabel("搜索目标模型", { exact: true }).fill("fixture-a");
  await expect(dialog.getByLabel("目标模型版本", { exact: true })).toHaveAttribute("size", "6");
  await dialog
    .getByLabel("目标模型版本", { exact: true })
    .selectOption("fixture-a");
  await dialog.getByRole("button", { name: "对比版本", exact: true }).click();
  await dialog
    .getByRole("button", { name: "查看影响范围", exact: true })
    .click();
  const editable = dialog.locator(".mm-references input:not(:disabled)");
  for (let index = 0; index < (await editable.count()); index++)
    await editable.nth(index).uncheck();
  await dialog
    .locator(".mm-references label")
    .filter({ hasText: "UI 升级技能" })
    .getByRole("checkbox")
    .check();
  await dialog
    .getByRole("button", { name: "确认替换选中引用", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("整体更新");
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByText("模型维护记录", { exact: true })).toHaveCount(0);
  const legacyGroup = page.locator(".mr-group").filter({
    has: page.locator(".mr-vendor-name strong", {
      hasText: "历史自定义来源",
    }),
  });
  const legacyExpand = legacyGroup.getByRole("button", {
    name: "展开或折叠 历史自定义来源",
    exact: true,
  });
  if ((await legacyExpand.getAttribute("aria-expanded")) === "false")
    await legacyExpand.click();
  await legacyGroup.getByRole("button", { name: "删除", exact: true }).click();
  await dialog
    .getByLabel("我确认删除，并将受影响配置标记为“模型缺失”", { exact: true })
    .check();
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "成本控制", exact: true }).click();
  await expect(page.getByText("暂无可计算费用", { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("models-real.png"),
    fullPage: true,
  });
  // The enable switch is user configuration; retirement still excludes a model
  // from the active total, including after another configuration is saved.
  const currentCatalog = await (await page.request.get("/api/v1/models")).json();
  const retired = currentCatalog.models.find(
    (m: { identifier: string }) => m.identifier === "fixture-b",
  );
  const totalEnabled = currentCatalog.models.filter(
    (m: { enabled: boolean; serviceId: string }) => m.enabled &&
      currentCatalog.services.some((s: { id: string; enabled: boolean }) => s.id === m.serviceId && s.enabled),
  ).length;
  await page.route("**/api/v1/models/lifecycle{,/check}", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.models[retired.id] = { ...state.models[retired.id], status: "retired" };
    await route.fulfill({ response, json: state });
  });
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  const activeStat = page.getByLabel("模型统计").locator("div").filter({ hasText: "已启动模型" }).locator("b");
  await expect(activeStat).toHaveText(String(totalEnabled - 1));
  await expect(card("fixture-b").getByRole("switch")).toBeDisabled();
  await page.getByRole("button", { name: "成本控制", exact: true }).click();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存设置", exact: true })).toBeEnabled();
  await expect(activeStat).toHaveText(String(totalEnabled - 1));

});
