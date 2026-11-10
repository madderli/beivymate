import {
  test,
  expect,
  type Page,
  type Locator,
} from "../../src/frontend/node_modules/@playwright/test";

async function cancelResourcePicker(page: Page, dialog: Locator) {
  const chooser = page.waitForEvent("filechooser");
  await dialog
    .locator(".sa-resource")
    .first()
    .getByRole("button", { name: "添加", exact: true })
    .click();
  const input = (await chooser).element();
  // A browser file picker emits a bubbling cancel event on its input when dismissed.
  await input.dispatchEvent("cancel", { bubbles: true, cancelable: false });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alertdialog")).toHaveCount(0);
}

test("create skill against real local API, resume draft, resources, validation and publication", async ({
  page,
}, info) => {
  const origin = { origin: "http://127.0.0.1:4173" };
  await page.request.post("/api/v1/account/initialize", {
    headers: origin,
    data: {
      username: "creator",
      name: "技能编写者",
      password: "Secure-Password-123!",
      setupToken: "browser-test-initialization",
    },
  });
  const login = await page.request.post("/api/v1/session", {
    headers: origin,
    data: { username: "creator", password: "Secure-Password-123!" },
  });
  const session = await login.json();
  await page.goto("/#skills");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await page
    .getByRole("button", { name: "新建技能", exact: true })
    .first()
    .click();
  let dialog = page.locator(".sa-dialog");
  await expect(dialog.getByPlaceholder("给技能起个名字")).toBeVisible();
  const descriptionTemplate = (
    await (await page.request.get("/api/v1/skill-authoring/options")).json()
  ).descriptionTemplate;
  await expect(dialog.getByLabel("技能描述", { exact: true })).toHaveValue(
    descriptionTemplate,
  );
  await expect(dialog.locator(".sa-count")).toHaveText(
    `${descriptionTemplate.length} / 1024 字`,
  );
  const descriptionBounds = await dialog
    .getByLabel("技能描述", { exact: true })
    .boundingBox();
  const counterBounds = await dialog.locator(".sa-count").boundingBox();
  expect(counterBounds!.y).toBeGreaterThanOrEqual(
    descriptionBounds!.y + descriptionBounds!.height,
  );
  expect(
    Math.abs(
      counterBounds!.x +
        counterBounds!.width -
        descriptionBounds!.x -
        descriptionBounds!.width,
    ),
  ).toBeLessThan(1);
  await expect(dialog.locator(".sa-description .sa-count")).toHaveCount(0);

  await expect(dialog.getByLabel("唯一标识", { exact: true })).toHaveValue("");
  await dialog.getByRole("button", { name: "技能名称·错误写法" }).click();
  await expect(dialog.getByRole("alertdialog")).toContainText("从名称上看不出");
  await dialog.getByRole("button", { name: "知道了" }).hover();
  await expect(dialog.getByRole("button", { name: "知道了" })).toHaveCSS(
    "background-color",
    "rgb(40, 93, 73)",
  );
  await dialog.getByRole("button", { name: "知道了" }).click();
  await dialog.getByPlaceholder("给技能起个名字").fill("Meeting Notes");
  await dialog.getByLabel("唯一标识", { exact: true }).focus();
  await expect(dialog.getByLabel("唯一标识", { exact: true })).toHaveValue(
    "meeting-notes",
  );
  await dialog
    .getByLabel("技能描述", { exact: true })
    .fill("当用户提供会议记录时，整理决定和行动项；不编造会议结论。");
  await expect(dialog.getByLabel("技能使用模型")).toContainText("尚未配置");
  await dialog.getByRole("button", { name: "下一步 →", exact: true }).click();
  await expect(dialog.getByLabel("技能内容", { exact: true })).toHaveValue(
    /^# Meeting Notes\n/,
  );
  await expect(dialog.locator(".sa-hint-line").first()).toHaveCSS(
    "font-style",
    "italic",
  );
  await expect(dialog.getByLabel("技能内容", { exact: true })).toHaveValue(
    /写给Agent看/,
  );
  expect(
    await dialog.getByLabel("技能内容", { exact: true }).inputValue(),
  ).not.toMatch(/^#{1,6} .+[：:]$/m);

  await expect(dialog.locator("textarea")).toHaveCount(1);
  const body =
    "# Meeting Notes\n\n## 工作目标\n整理会议记录。\n\n## 输入\n必需会议记录；缺失须补齐，不编造资料。\n\n## 工作步骤\n1. 通读记录，完成标准：讨论主题完整。\n2. 提取决定和行动项，完成标准：逐条有依据。\n\n## 输出\n纪要包含决定、责任人和待确认事项。\n\n## 边界\n不编造决定，不执行外部操作。\n\n## 验收\n每个决定均可回溯记录。";
  await dialog.getByLabel("技能内容", { exact: true }).fill(body);
  const docs = await page.request.get(
    "/api/v1/skill-authoring/documents/guide",
  );
  expect(docs.ok()).toBeTruthy();
  expect(await docs.text()).toContain("帮助手册");
  await expect(dialog.getByRole("link", { name: "技能示例" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await dialog.getByRole("button", { name: "下一步 →", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "执行脚本", exact: true }),
  ).toBeVisible();
  const ref = dialog.locator(".sa-resource").filter({
    has: page.getByRole("heading", { name: "参考资料", exact: true }),
  });
  await cancelResourcePicker(page, dialog);
  await expect(dialog.locator(".sa-aside pre")).toContainText(body);
  const upload = page.waitForEvent("filechooser");
  await ref.getByRole("button", { name: "添加", exact: true }).click();
  await (
    await upload
  ).setFiles({
    name: "rules.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("会议纪要不代替业务决定。"),
  });
  await expect(ref.getByText("rules.txt", { exact: true })).toBeVisible();
  await cancelResourcePicker(page, dialog);
  await expect(ref.getByText("rules.txt", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(dialog.locator(".sa-footer > small")).toHaveText(
    "当前内容已保存。",
  );
  let packages = await page.request.get("/api/v1/skill-center");
  let saved = (await packages.json()).items.find(
    (s: any) => s.id === "meeting-notes",
  );
  expect(saved.state).toBe("draft");
  expect(saved.body).toBe(body);
  expect(Buffer.from(saved.files[0].text || "").toString()).toContain(
    "会议纪要",
  );
  await dialog.getByRole("button", { name: "关闭新建技能" }).click();
  await page.reload();
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const card = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "Meeting Notes", exact: true }),
  });
  await expect(card.locator("time")).toHaveText(
    /^最后修改：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
  );
  const alignment = await card.locator(".sc-card-metrics").evaluate((e) => {
    const t = e.querySelector("time")!.getBoundingClientRect(),
      b = e.querySelector("button")!.getBoundingClientRect();
    return Math.abs(t.y + t.height / 2 - (b.y + b.height / 2));
  });
  expect(alignment).toBeLessThan(1);
  await card.getByRole("button", { name: "编辑技能", exact: true }).click();
  dialog = page.locator(".sa-dialog");
  await expect(dialog.locator(".sa-footer > small")).toHaveText(
    "当前内容已保存。",
  );
  await dialog.getByRole("button", { name: "下一步 →", exact: true }).click();
  await expect(dialog.getByLabel("技能内容", { exact: true })).toHaveValue(
    body,
  );
  await dialog.getByRole("button", { name: "下一步 →", exact: true }).click();
  await cancelResourcePicker(page, dialog);
  await expect(dialog.locator(".sa-footer > small")).toHaveText(
    "当前内容已保存。",
  );
  await expect(
    dialog.getByText("rules.txt", { exact: true }).first(),
  ).toBeVisible();
  await dialog.getByLabel("添加资源文件").setInputFiles([]);
  await expect(dialog.locator(".sa-footer > small")).toHaveText(
    "当前内容已保存。",
  );

  await dialog.getByRole("button", { name: "下一步 →", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "检查技能", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "检查技能", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("模型");
  await expect(
    dialog.getByRole("button", { name: "发布技能", exact: true }),
  ).toBeDisabled();
  // A real persisted model configuration; no model calls or endpoint response interception.
  let doc = await (await page.request.get("/api/v1/models")).json();
  doc.services = [
    {
      id: "local",
      name: "本地验收厂商",
      protocol: "ollama",
      endpoint: "http://127.0.0.1:11434",
      auth: "none",
      enabled: true,
      selfCert: false,
    },
  ];
  doc.models = [
    {
      id: "text",
      serviceId: "local",
      identifier: "local-text",
      name: "本地文本模型",
      enabled: true,
      capabilities: ["text"],
      orientation: "均衡",
      currency: "CNY",
    },
  ];
  doc.defaults.general = "text";
  expect(
    (
      await page.request.put("/api/v1/models", {
        headers: { ...origin, "x-csrf-token": session.csrfToken },
        data: doc,
      })
    ).ok(),
  ).toBeTruthy();
  await dialog.getByRole("button", { name: "检查技能", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "发布技能", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText(
      "结构与配置检查通过，请确认发布。实际效果需通过任务试用验证。",
      { exact: true },
    ),
  ).toHaveCount(0);
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "发布技能", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "发布技能", exact: true }).click();
  await expect(dialog.locator(".sa-header .sa-pill")).toHaveText("已发布");
  packages = await page.request.get("/api/v1/skill-center");
  saved = (await packages.json()).items.find(
    (s: any) => s.id === "meeting-notes",
  );
  expect(saved.state).toBe("published");
  for (let i = 0; i < 3; i++)
    await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(dialog.getByLabel("技能描述", { exact: true })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "保存草稿", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭新建技能" }).click();
  await expect(
    card.getByRole("button", { name: "编辑技能", exact: true }),
  ).toBeDisabled();
  await card.getByRole("button", { name: "停用", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "编辑技能", exact: true }),
  ).toBeEnabled();
  await card.getByRole("button", { name: "编辑技能", exact: true }).click();
  dialog = page.locator(".sa-dialog");
  await dialog
    .getByLabel("技能描述", { exact: true })
    .fill("修改后的会议纪要说明");
  await expect(dialog.locator(".sa-header .sa-pill")).toHaveText("草稿");
  await dialog.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(dialog.locator(".sa-footer > small")).toHaveText(
    "当前内容已保存。",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("skill-create-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({ path: info.outputPath("skill-create-desktop.png") });
  await dialog.getByRole("button", { name: "关闭新建技能" }).click();
  // Existing import entry continues to use its original dialog.
  await page.getByRole("button", { name: "导入技能", exact: true }).click();
  await expect(page.getByRole("heading", { name: /导入/ })).toBeVisible();
});

test("creation help icons and linked documents match the approved prototype", async ({
  page,
}, info) => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve(__dirname, "../..");
  const prototype = await fs.readFile(
    path.join(root, "prototypes/new-skill-demo.html"),
    "utf8",
  );
  const headers = { origin: "http://127.0.0.1:4173" };
  await page.request.post("/api/v1/account/initialize", {
    headers,
    data: {
      username: "creator",
      name: "技能编写者",
      password: "Secure-Password-123!",
      setupToken: "browser-test-initialization",
    },
  });
  await page.request.post("/api/v1/session", {
    headers,
    data: { username: "creator", password: "Secure-Password-123!" },
  });
  await page.goto("/#skills");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  await page
    .getByRole("button", { name: "新建技能", exact: true })
    .first()
    .click();
  const editor = page.locator(".sa-dialog");
  const descriptionHtml = prototype.match(
    /id="description-help"[\s\S]*?<div class="help-content">([\s\S]*?)<\/div>/,
  )![1];
  for (const item of [
    {
      button: "技能名称·错误写法",
      title: "技能名称·错误写法",
      text: "不要只写“智能助手” —— 从名称上看不出具体能做什么。技能名称应明确说明它做什么。例如“需求理解”、“会议纪要整理”。",
    },
    {
      button: "技能描述帮助",
      title: "怎样写好技能描述",
      html: descriptionHtml,
    },
    {
      button: "技能描述反例",
      title: "技能描述 · 反例",
      text: "“一款强大的需求分析工具” —— 没说清技能能干什么、什么时候用。",
    },
  ]) {
    await editor
      .getByRole("button", { name: item.button, exact: true })
      .click();
    const help = editor.getByRole("alertdialog");
    await expect(help.getByRole("heading", { level: 2 })).toHaveText(
      item.title,
    );
    if (item.html) {
      expect(await help.locator(".sa-help-content > div").innerHTML()).toBe(
        item.html,
      );
      await expect(help.locator("h3")).toHaveText([
        "1. 推荐格式",
        "2. 填写要点",
        "3. 示例：周报编写技能",
        "4. 写完后检查",
      ]);
      await expect(help.locator("ul li")).toHaveCount(5);
      await expect(help.locator("blockquote")).toHaveCount(2);
      await expect(help.locator("blockquote").last()).toContainText(
        "本周实际工作信息",
      );
      await expect(help.locator("ul")).toHaveCSS("padding-left", "20px");
      await expect(help.locator("li").first()).toHaveCSS("margin-top", "12px");
      await page.screenshot({
        path: info.outputPath("skill-description-help.png"),
      });
    } else
      await expect(help.locator(".sa-help-content")).toHaveText(item.text!);
    await expect(help.locator(".sa-help-content")).toHaveCSS(
      "padding",
      "18px 24px",
    );
    await help.getByRole("button", { name: "知道了" }).hover();
    await expect(help.getByRole("button", { name: "知道了" })).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
    await expect(help.getByRole("button", { name: "知道了" })).toHaveCSS(
      "background-color",
      "rgb(40, 93, 73)",
    );
    await help.getByRole("button", { name: "知道了" }).click();
  }
  await editor.getByRole("button", { name: "需求理解", exact: true }).click();
  await expect(editor.getByPlaceholder("给技能起个名字")).toHaveValue(
    "需求理解",
  );
  const sentence =
    "当客户给需求文档时，用它来评审文档是否说清楚，列出需要向产品确认的问题；不用于写测试用例、也不判断需求本身是否对。";
  await expect(
    editor.getByRole("button", { name: sentence, exact: true }),
  ).toHaveCount(0);
  await editor.getByLabel("技能描述", { exact: true }).fill(sentence);
  await expect(editor.getByLabel("技能描述", { exact: true })).toHaveValue(
    sentence,
  );
  await editor.getByRole("button", { name: "下一步 →", exact: true }).click();
  await editor
    .getByLabel("技能内容", { exact: true })
    .fill("还未保存的编辑内容，不得因查看帮助而丢失。");
  for (const [name, label] of [
    ["guide", "帮助手册"],
    ["example", "技能示例"],
  ]) {
    const expected = await fs.readFile(
      path.join(root, `prototypes/skill-writing-${name}.html`),
      "utf8",
    );
    const popupPromise = page.waitForEvent("popup");
    await editor.getByRole("link", { name: label, exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    const expectedText = await popup.evaluate(
      (source) =>
        new DOMParser()
          .parseFromString(source, "text/html")
          .querySelector("main")!
          .textContent!.replace("返回技能编辑预览", "返回技能编辑")
          .replace(/\s+/g, " ")
          .trim(),
      expected,
    );
    expect(
      await popup
        .locator("main")
        .textContent()
        .then((t) => t!.replace(/\s+/g, " ").trim()),
    ).toBe(expectedText);
    await expect(popup.locator("main")).toHaveCSS("padding", "32px 42px");
    if (name === "guide") {
      await expect(popup.locator("main > h1")).toHaveCount(1);
      await expect(popup.locator("main > h2").first()).toHaveText("工作目标");
      await expect(popup.locator("main > h3").first()).toHaveText("编写要点");
      await expect(
        popup.locator("main > ul").first().locator("li"),
      ).toHaveCount(2);
      await expect(
        popup.locator("main > ul").nth(1).locator("strong"),
      ).toHaveText(["做什么：", "什么情况下用：", "不用于什么："]);
      await page.screenshot({
        path: info.outputPath("skill-guide-editor.png"),
      });
      await popup.screenshot({
        path: info.outputPath("skill-guide-format.png"),
      });
    }

    await expect(popup.locator("nav")).toHaveCSS("display", "flex");
    const anchors = await popup.locator("nav a").first().getAttribute("href");
    await popup.locator("nav a").first().click();
    expect(popup.url()).toContain(anchors!);
    const downloadPromise = popup.waitForEvent("download");
    await popup.getByRole("link", { name: "下载 Markdown" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`skill-writing-${name}.md`);
    expect(await fs.readFile((await download.path())!, "utf8")).toBe(
      await fs.readFile(
        path.join(root, `prototypes/skill-writing-${name}.md`),
        "utf8",
      ),
    );
    await popup.route(`**/documents/${name}.md`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html>登录页面</html>",
      }),
    );
    await popup.getByRole("link", { name: "下载 Markdown" }).click();
    await expect(popup.getByRole("alert")).toContainText("未能下载 Markdown");
    const sidebar = await popup.locator(".doc-sidebar").boundingBox();
    const content = await popup.locator(".doc-content").boundingBox();
    expect(sidebar!.x + sidebar!.width).toBeLessThan(content!.x);
    const closePromise = popup.waitForEvent("close");
    await popup
      .getByRole("link", { name: "返回技能编辑", exact: true })
      .click();
    await closePromise;
    await expect(editor.getByLabel("技能内容", { exact: true })).toHaveValue(
      "还未保存的编辑内容，不得因查看帮助而丢失。",
    );
  }
});

test("search, centered steps, modal scroll lock and clean skill preview", async ({
  page,
}, info) => {
  const headers = { origin: "http://127.0.0.1:4173" };
  await page.request.post("/api/v1/account/initialize", {
    headers,
    data: {
      username: "creator",
      name: "技能编写者",
      password: "Secure-Password-123!",
      setupToken: "browser-test-initialization",
    },
  });
  await page.request.post("/api/v1/session", {
    headers,
    data: { username: "creator", password: "Secure-Password-123!" },
  });
  await page.goto("/#skills");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const search = page.getByPlaceholder("搜索名称、标识或技能描述…");
  await search.focus();
  await expect(search).toHaveCSS("border-top-width", "0px");
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(search).toHaveCSS("box-shadow", "none");
  await page
    .getByRole("button", { name: "新建技能", exact: true })
    .first()
    .click();
  const dialog = page.locator(".sa-dialog");
  await dialog.getByRole("button", { name: "需求理解", exact: true }).click();
  await dialog
    .getByLabel("技能描述", { exact: true })
    .fill("评审需求，不编造。");
  await expect(dialog.getByLabel("唯一标识", { exact: true })).toHaveValue(
    /^requirement-understanding/,
  );
  await expect(dialog.locator(".sa-steps button")).toHaveCount(0);
  for (let index = 0; index < 4; index++) {
    if (index > 0)
      await dialog
        .getByRole("button", { name: "下一步 →", exact: true })
        .click();
    if (index === 1)
      await dialog
        .getByLabel("技能内容", { exact: true })
        .fill("# 需求理解\n评审需求，缺少资料请补齐，不编造结果。");
    const placement = await dialog.locator(".sa-eyebrow").evaluate((e) => {
      const text = document.createRange();
      text.selectNodeContents(e);
      const t = text.getBoundingClientRect(),
        box = e.getBoundingClientRect(),
        pane = e.closest("main")!.getBoundingClientRect();
      return {
        textCenter: t.x + t.width / 2,
        mid: (pane.x + box.right) / 2,
        leftGap: box.right - t.right,
        rightGap:
          e.parentElement!.querySelector("h2")!.getBoundingClientRect().left -
          box.right,
        size: getComputedStyle(e).fontSize,
      };
    });
    expect(Math.abs(placement.textCenter - placement.mid)).toBeLessThan(1);
    expect(placement.size).toBe("13px");
    expect(placement.rightGap).toBe(18);
  }
  for (let i = 0; i < 3; i++)
    await dialog.getByRole("button", { name: "上一步", exact: true }).click();
  await dialog.getByPlaceholder("给技能起个名字").fill("测试理解（测试）");
  await dialog.getByLabel("唯一标识", { exact: true }).focus();
  await expect(dialog.getByLabel("唯一标识", { exact: true })).toHaveValue(
    "test-understanding-test",
  );
  await expect(dialog.locator(".sa-page-heading p")).toHaveText(
    "清晰的名称和描述，帮您在工作流和任务中快速找到它。",
  );
  await dialog.getByRole("button", { name: "需求理解", exact: true }).click();
  await expect(dialog.getByLabel("唯一标识", { exact: true })).toHaveValue(
    /^requirement-understanding(?:-\d+)?$/,
  );
  await expect(dialog.locator(".sa-aside pre")).not.toContainText("metadata:");
  const session = await (await page.request.get("/api/v1/session")).json();
  const collision = await page.request.put("/api/v1/skill-authoring", {
    headers: { ...headers, "x-csrf-token": session.csrfToken },
    data: {
      id: "collision-skill",
      name: "已存在技能",
      description: "唯一标识校验",
      roles: ["common"],
      icon: "🧩",
      modelPreference: { mode: "inherit", model: "", capabilities: [] },
      body: "# 已存在技能\n实际业务要求。",
      files: [],
    },
  });
  expect([200, 409]).toContain(collision.status());
  const generatedId = await dialog
    .getByLabel("唯一标识", { exact: true })
    .inputValue();
  await dialog.getByLabel("唯一标识", { exact: true }).fill("collision-skill");
  await dialog.getByLabel("技能描述", { exact: true }).focus();
  await expect(dialog.locator(".sa-id-error")).toHaveText(
    "唯一标识已被使用，请更换。",
  );
  await expect(dialog.getByLabel("唯一标识", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await dialog.getByLabel("唯一标识", { exact: true }).fill(generatedId);
  await dialog.getByLabel("技能描述", { exact: true }).focus();
  await expect(dialog.locator(".sa-id-error")).toHaveCount(0);

  const y = await page.evaluate(() => window.scrollY);
  await dialog
    .getByRole("button", { name: "技能描述帮助", exact: true })
    .click();
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const scroll = await dialog
    .locator(".sa-content")
    .evaluate((e) => e.scrollTop);
  await page.mouse.move(50, 650);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  expect(await dialog.locator(".sa-content").evaluate((e) => e.scrollTop)).toBe(
    scroll,
  );
  await dialog.getByRole("button", { name: "知道了", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("skill-centered-heading.png"),
  });
  await dialog
    .getByRole("button", { name: "关闭新建技能", exact: true })
    .click();
  await dialog.getByRole("button", { name: "放弃修改", exact: true }).click();
  expect(
    await page
      .locator("html")
      .evaluate((e) => (e as HTMLElement).style.overflow),
  ).toBe("");
});

test("skill cards clamp descriptions and collect issues at the bottom", async ({
  page,
}, info) => {
  const headers = { origin: "http://127.0.0.1:4173" };
  await page.request.post("/api/v1/account/initialize", {
    headers,
    data: {
      username: "creator",
      name: "编写者",
      password: "Secure-Password-123!",
      setupToken: "browser-test-initialization",
    },
  });
  const session = await (
    await page.request.post("/api/v1/session", {
      headers,
      data: { username: "creator", password: "Secure-Password-123!" },
    })
  ).json();
  const modelDoc = await (await page.request.get("/api/v1/models")).json();
  if (!modelDoc.models.length) {
    modelDoc.services = [
      {
        id: "card-local",
        name: "卡片测试厂商",
        protocol: "ollama",
        endpoint: "http://127.0.0.1:11434",
        auth: "none",
        enabled: true,
        selfCert: false,
      },
    ];
    modelDoc.models = [
      {
        id: "card-text",
        serviceId: "card-local",
        identifier: "local-text",
        name: "本地测试模型",
        enabled: true,
        capabilities: ["text"],
        orientation: "均衡",
        currency: "CNY",
      },
    ];
    modelDoc.defaults = { general: "card-text", chat: "", skill: "" };
    expect(
      (
        await page.request.put("/api/v1/models", {
          headers: { ...headers, "x-csrf-token": session.csrfToken },
          data: modelDoc,
        })
      ).ok(),
    ).toBeTruthy();
  }
  const blankNotes = await page.request.put("/api/v1/skill-authoring", {
    headers: { ...headers, "x-csrf-token": session.csrfToken },
    data: {
      id: "card-no-notes",
      name: "无备注技能",
      description: "整理会议记录，输出行动项。",
      roles: ["common"],
      icon: "📝",
      modelPreference: { mode: "inherit", model: "", capabilities: [] },
      body: "# 会议记录\n核对事实，不编造内容。",
      files: [],
    },
  });
  expect(blankNotes.ok()).toBeTruthy();
  const description =
    "根据会议记录核对每项决定和行动安排，保留分歧与不确定性，不编造结论。".repeat(
      24,
    );
  const save = await page.request.put("/api/v1/skill-authoring", {
    headers: { ...headers, "x-csrf-token": session.csrfToken },
    data: {
      id: "card-excerpt-check",
      name: "卡片长内容检查",
      description,
      roles: ["common"],
      icon: "📝",
      modelPreference: { mode: "inherit", model: "", capabilities: [] },
      body:
        "# 卡片检查\n" +
        Array.from(
          { length: 12 },
          (_, i) => `[必读资料${i}](references/missing-${i}.md)`,
        ).join("\n"),
      files: [],
    },
  });
  expect(save.ok()).toBeTruthy();
  const saved = await save.json();
  await page.request.post("/api/v1/skill-authoring/card-excerpt-check/state", {
    headers: { ...headers, "x-csrf-token": session.csrfToken },
    data: { action: "validate", revision: saved.revision },
  });
  await page.goto("/#skills");
  await page.getByRole("button", { name: "进入 Agent" }).click();
  await page.getByRole("button", { name: "技能中心", exact: true }).click();
  const card = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "卡片长内容检查", exact: true }),
  });
  await expect(card.locator(".sc-card-head .mm-resource-issue")).toHaveCount(0);
  const checkDescription = async () => {
    const lines = card.locator(".sc-description-line");
    await expect(lines).toHaveCount(3);
    const geometry = await card
      .locator(".sc-card-description")
      .evaluate((node) => {
        const rows = [
          ...node.querySelectorAll<HTMLElement>(".sc-description-line"),
        ];
        const last = rows[2];
        const range = document.createRange();
        range.selectNodeContents(last);
        return {
          height: node.clientHeight,
          line: parseFloat(getComputedStyle(node).lineHeight),
          width: node.clientWidth,
          lastWidth: last.getBoundingClientRect().width,
          lastTextWidth: range.getBoundingClientRect().width,
          lastHeight: last.getBoundingClientRect().height,
          mask: getComputedStyle(last.parentElement!).maskImage,
        };
      });
    expect(geometry.height).toBeGreaterThanOrEqual(geometry.line * 3 - 1);
    expect(Math.abs(geometry.lastWidth / geometry.width - 0.75)).toBeLessThan(
      0.01,
    );
    expect(geometry.lastTextWidth).toBeLessThanOrEqual(geometry.lastWidth + 1);
    expect(geometry.lastHeight).toBeGreaterThanOrEqual(geometry.line - 1);
    expect(geometry.mask).toBe("none");
  };
  await checkDescription();
  const blankCard = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "无备注技能", exact: true }),
  });
  await expect(blankCard.locator(".sc-card-note-slot")).toHaveText("");
  expect(
    (await blankCard.locator(".sc-card-note-slot").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(31);
  await card.getByRole("button", { name: "查看完整技能描述" }).click();
  const detail = page.getByRole("dialog", {
    name: "卡片长内容检查 · 技能描述",
  });
  await expect(detail.locator(".sc-card-details-content")).toHaveText(
    description,
  );
  await detail.getByRole("button", { name: "关闭弹窗" }).click();
  await expect(card.locator(".sc-card-issues .sc-excerpt-text")).toHaveCSS(
    "white-space",
    "nowrap",
  );
  await card.getByRole("button", { name: "查看全部技能提示" }).click();
  const issues = page.getByRole("dialog", {
    name: "卡片长内容检查 · 技能提示",
  });
  await expect(issues).toContainText("missing-11.md");
  await issues.getByRole("button", { name: "关闭弹窗" }).click();
  await page.screenshot({ path: info.outputPath("skill-card-excerpts.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkDescription();
  await card.getByRole("button", { name: "查看完整技能描述" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "卡片长内容检查 · 技能描述" })
      .locator(".sc-card-details-content"),
  ).toHaveText(description);
});
