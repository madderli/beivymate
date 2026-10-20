# BeivyMate

BeIvyMate is an AI Worker Agent.

The system supports role-based AI agents, such as:

- Tester Agent
- Developer Agent
- PM Agent

The first MVP focuses on the Tester Agent.

## MVP

The Tester Agent MVP supports:

1. Requirement Understanding
2. Test Analysis
3. Test Design
4. Test Execution
5. Test Report

## Technology

- Python
- Pydantic
- Pytest

## Project Structure

```text
src/beivymate/    Python business services, runtime and local API
src/frontend/    Browser UI
resources/       Customer configuration, examples and shipped templates
tests/           Project tests and validation tools
```

## Personal portal (UI M02–M03)

The local account portal supports initialization, login, recovery and settings.
Workspaces, linked tasks, editable configurations and attachments are persisted locally.
Runtime execution is connected in subsequent UI milestones; the complete
external trial release is not yet ready. See [frontend startup and validation](src/frontend/README.md).

## 本地客户端架构与开发跟踪

各安装独立保存本机数据，通过包导入导出共享资源。统一规则见 [架构与状态规范](ARCHITECTURE.md)，逐模块进度见 [实施验收清单](IMPLEMENTATION_CHECKLIST.md)。
