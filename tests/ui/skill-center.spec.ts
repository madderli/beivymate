import {
  test,
  expect,
  type Page,
} from "../../src/frontend/node_modules/@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const uiEntry =
  process.env.BEIVYMATE_SKILLS_UI === "1" ? "/?ui=skills" : "/?preview=skills";
const entry = (role = "tester") =>
  `---\nid: imported_check\nname: 导入的校验技能\ndescription: 检查需求边界与异常业务规则。\nrole: ${role}\nversion: "1.0.0"\nexecutor: requirement_understand\ninputs:\n  - requirement\n---\n\n# 工作目标\n\n检查所有已知业务规则。\n`;
test("catalog, builtin read-only, personal copy and publication", async ({
  page,
}, info) => {
  await page.goto(uiEntry);
  await expect(page.getByRole("heading", { name: "我的技能库" })).toBeVisible();
  await expect(page.locator(".sc-card")).toHaveCount(8);
  await page.screenshot({
    path: info.outputPath("skill-center.png"),
    fullPage: true,
  });
  const builtin = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "需求理解", exact: true }),
  });
  await builtin.getByRole("button", { name: "查看技能", exact: true }).click();
  await expect(page.getByLabel("技能名称", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(
    page.getByRole("button", { name: "启用技能", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "创建个人副本", exact: true }).click();
  await page.getByLabel("技能名称", { exact: true }).fill("我的需求理解");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const personal = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "我的需求理解", exact: true }),
  });
  await expect(personal).toContainText("草稿");
  await personal.getByRole("button", { name: "编辑技能", exact: true }).click();
  await page.getByRole("button", { name: "4 检查与启用" }).click();
  await expect(
    page.getByRole("button", { name: "启用技能", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "运行结构校验" }).click();
  await page.screenshot({
    path: info.outputPath("skill-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "启用技能", exact: true }).click();
  await expect(personal).toContainText("启用");
  await expect(builtin).toContainText("需求理解");
});
test("paused skill invalidates existing workflow selection and unpublished skills cannot be selected", async ({
  page,
}) => {
  await page.goto(uiEntry);
  const skill = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "支付异常专项分析", exact: true }),
  });
  await expect(
    skill.getByRole("button", { name: "编辑技能", exact: true }),
  ).toBeDisabled();
  await expect(
    skill.getByRole("button", { name: "停用", exact: true }),
  ).toBeDisabled();
  await skill.getByRole("button", { name: "2 个工作流引用" }).click();
  await expect(page.getByRole("button", { name: "模拟完成任务" })).toHaveCount(
    3,
  );
  await page.getByRole("button", { name: "模拟完成任务" }).first().click();
  await expect(
    skill.getByRole("button", { name: "编辑技能", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "模拟完成任务" }).first().click();
  await page.getByRole("button", { name: "模拟完成任务" }).first().click();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await expect(
    skill.getByRole("button", { name: "编辑技能", exact: true }),
  ).toBeEnabled();
  await skill.getByRole("button", { name: "停用", exact: true }).click();
  await expect(skill).toContainText("停用");
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  if (process.env.BEIVYMATE_SKILLS_UI === "1") {
    const workflow = page.locator(".wf-card").filter({
      has: page.getByRole("heading", { name: "支付异常验证", exact: true }),
    });
    await workflow.getByRole("button", { name: "编辑", exact: true }).click();
    const picker = page.getByLabel("步骤 1 技能", { exact: true });
    await expect(
      picker.locator('option[value="regression_checklist"]'),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "保存工作流", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("停用");
    await picker.selectOption("requirement_understand");
    await page.getByRole("button", { name: "保存工作流", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return;
  }
  await expect(page.getByRole("alert")).toContainText("停用");
  await expect(page.getByRole("button", { name: "确认引用" })).toBeDisabled();
  await expect(
    page
      .getByLabel("工作流可引用技能")
      .locator('option[value="regression_checklist"]'),
  ).toHaveCount(0);
  await page
    .getByLabel("工作流可引用技能")
    .selectOption("requirement_understand");
  await expect(page.getByRole("button", { name: "确认引用" })).toBeEnabled();
});
test("real entry import is role-gated and preserves executor metadata", async ({
  page,
}) => {
  await page.goto(uiEntry);
  await page.getByLabel("当前角色", { exact: true }).selectOption("developer");
  await page.getByRole("button", { name: "导入技能", exact: true }).click();
  await page.getByLabel("导入 SKILL.md", { exact: true }).setInputFiles({
    name: "SKILL.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(entry()),
  });
  await expect(page.getByRole("alert")).toContainText("角色不匹配");
  await expect(page.getByRole("button", { name: "导入并启用" })).toBeDisabled();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByLabel("当前角色", { exact: true }).selectOption("tester");
  await page.getByRole("button", { name: "导入技能", exact: true }).click();
  await page.getByLabel("导入 SKILL.md", { exact: true }).setInputFiles({
    name: "SKILL.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(entry()),
  });
  await page.getByRole("button", { name: "确认并校验" }).click();
  await page.getByRole("button", { name: "导入为草稿" }).click();
  const skill = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "导入的校验技能", exact: true }),
  });
  await skill.getByRole("button", { name: "编辑技能", exact: true }).click();
  await page.getByRole("button", { name: "编辑入口源码", exact: true }).click();
  await expect(page.getByLabel("入口文件源码")).toHaveValue(
    /executor: requirement_understand/,
  );
  await expect(page.getByLabel("入口文件源码")).toHaveValue(
    /inputs:\n  - requirement/,
  );
});
test("folder migration, duplicate import and missing entry validation", async ({
  page,
}) => {
  const root = await mkdtemp(path.join(tmpdir(), "skill-center-"));
  try {
    const folder = path.join(root, "imported_check");
    await mkdir(path.join(folder, "templates"), { recursive: true });
    await writeFile(
      path.join(folder, "SKILL.md"),
      entry() + "\n模板见 templates/report.md",
    );
    await writeFile(path.join(folder, "templates", "report.md"), "# 报告模板");
    await page.goto(uiEntry);
    await page.getByRole("button", { name: "导入技能", exact: true }).click();
    await page.getByLabel("导入技能文件夹").setInputFiles(folder);
    await expect(page.locator(".sc-import-preview")).toContainText(
      "assets/templates/report.md",
    );
    await expect(page.locator(".sc-warning")).toContainText("预览迁移");
    await page.getByRole("button", { name: "确认并校验" }).click();
    await page.getByRole("button", { name: "导入并启用" }).click();
    await page.getByRole("button", { name: "导入技能", exact: true }).click();
    await page.getByLabel("导入技能文件夹").setInputFiles(folder);
    await expect(page.getByRole("alert")).toContainText("标识已存在");
    await page.getByLabel("导入 SKILL.md").setInputFiles({
      name: "README.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# not entry"),
    });
    await expect(page.getByRole("alert")).toContainText(
      "有且只有一个 SKILL.md",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("creation form and mobile layout", async ({ page }, info) => {
  await page.goto(uiEntry);
  await page.getByRole("button", { name: "新建技能", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.getByRole("button", { name: "3 资源文件", exact: true }).click();
  await page.screenshot({ path: info.outputPath("resource-layout.png") });
  await page.getByRole("button", { name: "4 检查与启用", exact: true }).click();
  const fits = await page
    .locator(".sc-editor-content")
    .evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  expect(fits).toBe(true);
  await page.screenshot({ path: info.outputPath("check-layout.png") });
  await page.getByRole("button", { name: "1 基本信息", exact: true }).click();
  await page.getByLabel("技能名称", { exact: true }).fill("订单边界检查");
  await page.getByLabel("唯一标识", { exact: true }).fill("order-boundary");
  await page
    .getByLabel("技能描述", { exact: true })
    .fill("核对订单边界条件和异常恢复场景。");
  await page.getByLabel("图标", { exact: true }).selectOption("🧪");
  await page.getByRole("checkbox", { name: "开发", exact: true }).check();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const created = page
    .locator(".sc-card")
    .filter({ has: page.getByRole("heading", { name: "订单边界检查" }) });
  await expect(created).toContainText("🧪");
  await expect(created).toContainText("开发");
  await expect(created).toContainText("测试");
  await expect(
    page
      .locator(".sc-card")
      .filter({ has: page.getByRole("heading", { name: "订单边界检查" }) }),
  ).toContainText("草稿");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("skill-mobile.png"),
    fullPage: true,
  });
});

test("status filters, package details and matching control heights", async ({
  page,
}) => {
  await page.goto(uiEntry);
  const filters = page.getByLabel("技能状态筛选");
  const search = await page.locator(".sc-search").boundingBox();
  const button = await filters.getByRole("button").first().boundingBox();
  expect(search?.height).toBe(button?.height);
  for (const [name, count] of [
    ["启用", 5],
    ["草稿", 1],
    ["停用", 1],
    ["校验失败", 1],
    ["全部", 8],
  ] as const) {
    await filters.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.locator(".sc-card")).toHaveCount(count);
  }
  await page
    .locator(".sc-card")
    .first()
    .getByRole("button", { name: "查看技能", exact: true })
    .click();
  await page
    .getByRole("button", { name: "参考文档 · business-rules.md", exact: true })
    .click();
  await expect(page.locator(".sc-package-preview pre")).toContainText(
    "请根据产品文档补充规则与来源",
  );
  await expect(
    page.getByRole("button", { name: "保存草稿", exact: true }),
  ).toHaveCount(0);
});

test("version increases only for validated saved content changes", async ({
  page,
}, info) => {
  await page.goto(uiEntry);
  const card = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "回归检查清单", exact: true }),
  });
  await card.getByRole("button", { name: "编辑技能", exact: true }).click();
  await expect(page.getByLabel("版本号", { exact: true })).toHaveValue("1.0.0");
  await expect(page.getByLabel("版本号", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByLabel("技能描述", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("版本号", { exact: true })).toHaveValue("1.0.0");
  await page
    .getByLabel("技能描述", { exact: true })
    .fill("更新后的回归范围说明");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await card.getByRole("button", { name: "编辑技能", exact: true }).click();
  await expect(page.getByLabel("版本号", { exact: true })).toHaveValue("1.0.1");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await card.getByRole("button", { name: "查看技能", exact: true }).click();
  await expect(page.getByLabel("版本号", { exact: true })).toHaveValue("1.0.1");
  await page.screenshot({ path: info.outputPath("compact-detail.png") });
});

test("skill model capability filters select tiers and models without saving requirements", async ({
  page,
}, info) => {
  await page.goto(uiEntry);
  const card = page.locator(".sc-card").filter({
    has: page.getByRole("heading", { name: "回归检查清单", exact: true }),
  });
  await card.getByRole("button", { name: "编辑技能", exact: true }).click();
  await expect(page.locator(".sc-model-preference")).toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByText("必要能力（可多选）", { exact: true }),
  ).toHaveCount(0);
  await page.locator(".sc-model-filter summary").click();
  await page.getByRole("checkbox", { name: "视觉理解", exact: true }).check();
  await expect(
    page
      .getByLabel("推荐档位", { exact: true })
      .locator("option:not([disabled])"),
  ).toHaveCount(1);
  await page.getByLabel("推荐档位", { exact: true }).selectOption("质量优先");
  await expect(page.getByLabel("已选模型能力")).toContainText("视觉理解");
  await page.getByLabel("模型选择", { exact: true }).selectOption("specific");
  await expect(
    page
      .getByLabel("推荐模型", { exact: true })
      .locator("option:not([disabled])"),
  ).toHaveCount(1);
  await page.getByLabel("推荐模型", { exact: true }).selectOption("vision");
  await page.getByRole("checkbox", { name: "语音合成", exact: true }).check();
  await expect(
    page.getByText("没有符合条件的模型", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("推荐模型", { exact: true })).toHaveValue(
    "vision",
  );
  await page.getByRole("button", { name: "清空筛选", exact: true }).click();
  await page.screenshot({ path: info.outputPath("skill-model-selection.png") });
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await card.getByRole("button", { name: "查看技能", exact: true }).click();
  await expect(page.locator(".sc-model-preference")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.getByLabel("推荐模型", { exact: true })).toHaveValue(
    "vision",
  );
  await expect(page.getByLabel("已选模型能力")).toContainText("函数调用");
  await expect(page.locator(".sc-package-preview pre")).toContainText(
    '"capabilities":[]',
  );
  await expect(page.getByLabel("推荐模型", { exact: true })).toBeDisabled();
});

async function openLibrary(page: Page) {
  await page.goto(uiEntry);
  await page.getByRole("button", { name: "用户菜单", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
}
test("registry wizard follows attachment and required labels stay inline", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openLibrary(page);
  await page.getByRole("button", { name: "添加厂商" }).click();
  await expect(page.getByLabel("模型标识", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("模拟结果")).toHaveCount(0);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请输入厂商名称");
  await page.getByLabel("厂商名称", { exact: true }).fill("研发网关");
  await page
    .getByLabel("Base URL", { exact: true })
    .fill("https://gateway.example.invalid/v1");
  await page.getByLabel("鉴权方式", { exact: true }).selectOption("AK-SK 签名");
  for (const label of await page
    .locator(".mr-field-label:has(.mr-required, .required-mark)")
    .all()) {
    const boxes = await label.evaluate((el) => {
      const marker = el.querySelector(".required-mark, .mr-required")!;
      const star = marker.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(
        el.querySelector(".required-mark") ? el.firstChild! : el.lastChild!,
      );
      const text = range.getBoundingClientRect();
      return {
        trailing: marker.classList.contains("required-mark"),
        starX: star.x,
        textX: text.x,
        textRight: text.right,
        starY: star.y,
        textY: text.y,
        color: getComputedStyle(marker).color,
      };
    });
    if (boxes.trailing) {
      expect(boxes.starX).toBeGreaterThanOrEqual(boxes.textRight);
      expect(boxes.color).toBe("rgb(156, 170, 135)");
    } else expect(boxes.starX).toBeLessThan(boxes.textX);
    expect(Math.abs(boxes.starY - boxes.textY)).toBeLessThan(3);
  }
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page
    .getByRole("button", { name: "测试并发现模型", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("完整鉴权信息");
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByLabel("AccessKey", { exact: true }).fill("demo-access");
  await page.getByLabel("SecretKey", { exact: true }).fill("demo-secret");
  await page.screenshot({ path: info.outputPath("vendor-information.png") });
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page
    .getByRole("button", { name: "测试并发现模型", exact: true })
    .click();
  await expect(page.locator(".mr-discovered input")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "测试并发现模型", exact: true }),
  ).toHaveCount(0);
  await page.locator(".mr-discovered input").last().uncheck();
  await page.screenshot({ path: info.outputPath("vendor-discovery.png") });
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.locator(".mr-review")).toContainText("2 个模型");
  await page.getByRole("button", { name: "确认添加", exact: true }).click();
  const group = page.locator(".mr-group").filter({
    has: page.locator(".mr-vendor-name strong", { hasText: "研发网关" }),
  });
  await expect(group.locator("tbody tr")).toHaveCount(2);
  await group
    .getByRole("button", { name: "编辑 研发网关", exact: true })
    .click();
  await page.getByLabel("鉴权方式", { exact: true }).selectOption("OAuth 2.0");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("测试连接");
  await page.getByLabel("Client ID", { exact: true }).fill("client");
  await page.getByLabel("Client Secret", { exact: true }).fill("secret");
  await page
    .getByLabel("Token URL", { exact: true })
    .fill("https://auth.example.invalid/token");
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(page.locator(".sc-success")).toContainText("连接成功");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(group).toContainText("OAuth 2.0");
  await group
    .getByRole("button", { name: "编辑 研发网关", exact: true })
    .click();
  await expect(page.locator(".mr-source-types input")).toHaveCount(5);
  await page.getByLabel("鉴权方式", { exact: true }).selectOption("无");
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(page.locator(".sc-success")).toContainText("连接成功（模拟）");
  await page.getByRole("button", { name: "重新测试", exact: true }).click();
  await expect(page.locator(".sc-success")).toHaveCount(0);
  await expect(page.locator(".sc-success")).toContainText("连接成功（模拟）");
});

test("platform import matches attachment including configure and deduplication", async ({
  page,
}, info) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "从平台导入" }).click();
  await expect(page.getByLabel("导入到", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "同步目录", exact: true }).click();
  await expect(page.locator(".mr-discovered input")).toHaveCount(6);
  await expect(page.locator(".mr-discovered input:checked")).toHaveCount(3);
  await page.getByLabel("搜索平台模型").fill("vision");
  await page.locator(".mr-discovered input").check();
  await page.screenshot({ path: info.outputPath("platform-import.png") });
  await page.getByRole("button", { name: "导入选中", exact: true }).click();
  const group = page.locator(".mr-group").filter({
    has: page.locator(".mr-vendor-name strong", { hasText: "OpenRouter" }),
  });
  await expect(group.locator("tbody tr")).toHaveCount(4);
  await expect(group).toContainText("未配置");
  await group.getByRole("button", { name: "去配置", exact: true }).click();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("填写密钥");
  await page.getByLabel("密钥", { exact: true }).fill("demo-key");
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(group).toContainText("已配置");
  await page.getByRole("button", { name: "从平台导入" }).click();
  await page.getByRole("button", { name: "同步目录", exact: true }).click();
  await expect(page.locator(".mr-discovered input")).toHaveCount(6);
  await page.getByRole("button", { name: "导入选中", exact: true }).click();
  await expect(group.locator("tbody tr")).toHaveCount(4);
});

test("registry model fields, sync and unavailable mapping match attachment", async ({
  page,
}, info) => {
  await openLibrary(page);
  const company = page.locator(".mr-group").filter({
    has: page.locator(".mr-vendor-name strong", {
      hasText: "公司内网模型服务",
    }),
  });
  await company.getByRole("button", { name: /展开或折叠/ }).click();
  await company.getByRole("button", { name: "添加模型" }).click();
  await page.getByLabel("模型 ID", { exact: true }).fill("internal/vision");
  await page.getByLabel("显示名", { exact: true }).fill("内部视觉模型");
  await page.getByLabel("来源标注", { exact: true }).fill("内部部署第二版");
  await page.getByLabel("上下文窗口（K）", { exact: true }).fill("64");
  await page.getByRole("radio", { name: "内部免费", exact: true }).check();
  await page.getByRole("button", { name: "校准", exact: true }).click();
  await page.getByRole("checkbox", { name: "视觉理解", exact: true }).check();
  await page.getByRole("button", { name: "确认校准", exact: true }).click();
  await expect(page.getByLabel("输入单价")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("model-editor.png") });
  await page.getByRole("button", { name: "保存模型", exact: true }).click();
  const row = company
    .locator("tbody tr")
    .filter({ hasText: "internal/vision" });
  await expect(row).toContainText("64K");
  await expect(row).toContainText("内部");
  await company.getByRole("button", { name: "重新同步", exact: true }).click();
  await expect(row).toContainText("已下线");
  await expect(row.getByRole("switch")).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  await expect(
    page
      .getByLabel("质量优先映射模型")
      .locator("option")
      .filter({ hasText: "内部视觉模型" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  const platform = page.locator(".mr-group").filter({
    has: page.locator(".mr-vendor-name strong", { hasText: "统一模型平台" }),
  });
  await platform.getByRole("button", { name: /展开或折叠/ }).click();
  await platform.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "引用它将被标记为不可用",
  );
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  await expect(page.getByLabel("速度优先映射模型")).toContainText(
    "原引用不可用",
  );
});

test("registry enable controls update skill candidates and mobile layout", async ({
  page,
}, info) => {
  await openLibrary(page);
  await page
    .getByRole("switch", { name: "启用厂商 厂商服务（演示）", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "返回技能中心", exact: true }).click();
  await page.getByRole("button", { name: "新建技能", exact: true }).click();
  await expect(page.locator(".sc-model-preference")).toHaveAttribute(
    "open",
    "",
  );
  await page.getByLabel("模型选择", { exact: true }).selectOption("specific");
  await expect(
    page
      .getByLabel("推荐模型", { exact: true })
      .locator('option[value="vision"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  const abandon = page.getByRole("button", { name: "放弃修改", exact: true });
  if (await abandon.count()) await abandon.click();
  await page.getByRole("button", { name: "用户菜单", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("registry-mobile.png"),
    fullPage: true,
  });
});

test("tier-only failover sequence and prototype cost controls", async ({
  page,
}, info) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "成本控制", exact: true }).click();
  await expect(page.getByLabel("月度预算", { exact: true })).toHaveValue("200");
  await expect(page.locator(".mc-usage")).toHaveCount(3);
  await page.getByLabel("月度预算", { exact: true }).fill("100");
  await expect(page.locator(".mc-card").getByRole("status")).toContainText(
    "达到月度预算",
  );
  await page.getByRole("switch", { name: "超额提醒", exact: true }).click();
  await expect(page.locator(".mc-card").getByRole("status")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("cost-prototype.png") });
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  await expect(
    page.getByText("降级序列（运行时）", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("演练技能", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("演练起始档位", { exact: true })).toHaveCount(0);
  const chain = page.getByRole("article", { name: "质量优先调用链" });
  for (const id of ["balanced", "light"]) {
    await chain
      .getByRole("button", { name: "添加备用模型", exact: true })
      .click();
    await chain.getByLabel("选择备用模型").selectOption(id);
    await chain.getByRole("button", { name: "添加", exact: true }).click();
  }
  await chain
    .getByRole("button", { name: "上移 轻量文本模型（演示）", exact: true })
    .click();
  await page
    .getByRole("button", { name: "模拟演练一次降级", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("实际模型：轻量文本模型");
  await page.getByRole("radio", { name: "直接报错", exact: false }).check();
  await page
    .getByRole("button", { name: "模拟演练一次降级", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("直接报错策略");
  await chain
    .getByRole("button", { name: "移除", exact: true })
    .first()
    .click();
  await chain
    .getByRole("button", { name: "移除", exact: true })
    .first()
    .click();
  await page.getByRole("radio", { name: "允许跨档降级", exact: false }).check();
  await page
    .getByRole("button", { name: "模拟演练一次降级", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("已跨档降级");
  for (const name of ["超时", "接口报错", "限流 429"])
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await page
    .getByRole("button", { name: "模拟演练一次降级", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("不在触发条件");
  await page.getByRole("button", { name: "清空日志", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("等待演练");
  await page.getByRole("button", { name: "高级配置", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "允许跨档降级", exact: false }),
  ).toBeChecked();
});

test("model calibration can repeat, cancel and persist capabilities into skill selection", async ({
  page,
}, info) => {
  await openLibrary(page);
  const row = page.locator("tbody tr").filter({ hasText: "通用模型（演示）" });
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".mr-capability-facts")).toContainText("函数调用");
  await page.getByRole("button", { name: "校准", exact: true }).click();
  await page.getByRole("checkbox", { name: "视觉理解", exact: true }).check();
  await page.getByLabel("校准依据", { exact: true }).fill("核对厂商能力文档");
  await page.getByRole("button", { name: "确认校准", exact: true }).click();
  await expect(page.locator(".mr-capability-facts")).toContainText(
    "已校准 · 1 次",
  );
  await page.getByRole("button", { name: "校准", exact: true }).click();
  await page.getByRole("checkbox", { name: "音频理解", exact: true }).check();
  await page.screenshot({ path: info.outputPath("model-calibration.png") });
  await page.getByRole("button", { name: "确认校准", exact: true }).click();
  await expect(page.locator(".mr-capability-facts")).toContainText(
    "已校准 · 2 次",
  );
  await page.getByRole("button", { name: "校准", exact: true }).click();
  await page.getByRole("checkbox", { name: "视觉理解", exact: true }).uncheck();
  await page
    .locator(".mr-calibration-dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(page.locator(".mr-capability-facts")).toContainText("视觉理解");
  await page.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect(row).toContainText("音频理解");
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator(".mr-capability-facts")).toContainText(
    "已校准 · 2 次",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "返回技能中心", exact: true }).click();
  await page.getByRole("button", { name: "新建技能", exact: true }).click();
  await expect(page.locator(".sc-model-preference")).toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".sc-model-filter summary").click();
  await page.getByRole("checkbox", { name: "音频理解", exact: true }).check();
  await page.getByLabel("推荐档位", { exact: true }).selectOption("均衡");
  await expect(page.getByLabel("已选模型能力")).toContainText("音频理解");
});
