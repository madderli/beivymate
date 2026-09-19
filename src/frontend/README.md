# BeIvyMate UI · M01 设计基线

M02 已接通本地账户 API：初始化、登录/退出、修改名称/密码、恢复码以及安全凭据存储。Workspace/Task 和后台工作流仍按 M03/M04 接入，尚未开放的操作禁用，不显示模拟业务数据。完整 UI MVP 完成前不是对外发布版本。

## 启动

先在仓库根目录启动后端（仅监听本机）：

```sh
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m beivymate.application.web
```

首次启动在终端显示一次初始化码，在页面中创建账户并保存恢复码。默认数据目录为 `~/.beivymate`，可以通过 `--data-dir` 指定。Windows 使用 `.venv\Scripts\python.exe`。数据目录不要放入 Git 仓库。

另开终端启动前端：

```sh
npm ci --prefix src/frontend
npm run dev --prefix src/frontend
```

打开 http://127.0.0.1:5173/ 。默认将 `/api` 转发到 `http://127.0.0.1:8000`，可通过开发进程的 `BEIVYMATE_API_TARGET` 更改目标。正式部署使用同源 API。设置目标地址本身不会创建后端服务。

## 已建立的边界

- 会话由后端确认，密码只用于登录请求，不写浏览器存储。
- 任务/Workspace/流程/模型列表均读取 API；业务数据不存 localStorage 或 IndexedDB。
- 只开放后端会话 capabilities 允许的操作，后端仍必须独立授权每个请求。
- 任务动作提交 revision、幂等键；审批提交产物 ID、revision、subjectHash。
- 状态只能来自刷新后的后端快照，操作响应不制造“执行中”或“已完成”。
- 附件作为 FormData 上传，失败保留内存草稿，关闭页面会丢失未提交选择。
- 对话内容从 API 读取，没有硬编码回答；对话模型与 Skill 模型分开。
- 接口失败、401、409、非 JSON 响应显式处理；无自动重试写操作。
- 浏览器仅保存主题偏好。旧原型 localStorage/IndexedDB 没有被删除，也不会加载为正式业务数据。

## 范围与验证

保留登录、我的工作、Workspace、Task、关联关系、步骤进度、产物审核、附件、对话、知识/自动化/连接的页面基线。未实现的接口或业务功能明确禁用/显示待接入。流程配置编辑、用例轮次矩阵和缺陷数据接入仍属于原定 UI MVP，未用假数据替代。

```sh
npm run build --prefix src/frontend
npm run format:check --prefix src/frontend
# 已安装本机 Chrome（macOS/Linux）
PLAYWRIGHT_CHANNEL=chrome npm test --prefix src/frontend
# 或先安装 Playwright Chromium 后运行 npm test
```

Windows PowerShell：设置 `$env:PLAYWRIGHT_CHANNEL = 'chrome'` 后运行 `npm test --prefix src/frontend`。

测试数据和接口替身只在 `tests/ui`。浏览器测试证明前端接口行为，不等同于真实后端联调。M02 已有真实 HTTP→账户服务→SQLite 浏览器验收；任务和 Runtime 联调在后续 milestone 完成。

Playwright 配置位于 `tests/ui/playwright.config.ts`，仅用于 BeIvyMate 自身 UI 测试，不属于客户自动化 Skill。测试结果输出至 `tests/ui/test-results/`（不提交）；测试服务工作目录显式指向 `src/frontend`。


M02 真实服务浏览器验收（专用临时数据库，不使用个人账户）：

```sh
BEIVYMATE_REAL_API=1 PLAYWRIGHT_CHANNEL=chrome npm test --prefix src/frontend
```

Windows PowerShell：设置 `$env:BEIVYMATE_REAL_API = '1'` 及 `$env:PLAYWRIGHT_CHANNEL = 'chrome'` 后运行同一 npm 命令。测试启动 8001/4173 端口的隔离服务，结束后清理数据库；关闭认证流程 trace，避免记录恢复码。默认 `npm test` 仍运行可控接口的 UI 契约回归。

会话 8 小时有效，HttpOnly/SameSite Cookie；密码使用 Argon2，恢复码与会话令牌仅保存哈希。系统凭据库不可用时拒绝保存，不回退到明文。试用版当前无期限、授权全部功能，实际入口仅开放已实现能力；支付、商业许可证签发和企业 SSO 不在 M02。

账户规则：用户名支持员工邮箱、工号或中文名称（1～254 字符，不含空白/控制字符，大小写精确匹配）。新设或重置密码要求 12～256 字符，包含大小写字母、数字和符号，不含空白；校验以中文显示并在后端再次执行。已有账户的原密码仍可登录，改密时采用新规则。登录页不再提供原型的“查看页面布局”入口。

中文界面规则：系统导航、角色、表单、按钮和说明使用中文（工作区、测试助手、技能、运行等）；品牌名、客户配置名称、交付内容、文件路径和技术标识保留原值。交付语言选择不改变界面语言。
