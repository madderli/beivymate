# BeIvyMate UI · M01 设计基线

默认入口为真实 API 驱动的前端骨架。**M01 尚未提供 Web API 服务，因此独立启动前端会显示“后台服务未连接”**，可以查看只读布局；业务操作不会伪装成功。这不是可发布试用版，认证、持久化、后台调度按后续 milestone 逐项接入。

## 启动

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

测试数据和接口替身只在 `tests/ui`。浏览器测试证明前端接口行为，不等同于真实后端联调。Python 业务代码没有因 M01 修改。后续每个功能需补充真实 HTTP→Application→Runtime 集成测试，再做用户场景验收。
