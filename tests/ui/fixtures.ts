import type { Board, Session } from "../../src/frontend/src/model";
export const session: Session = {
  authenticated: true,
  user: { id: "user-test", name: "林晓" },
  csrfToken: "test-csrf",
  capabilities: [
    "task.create",
    "task.execute",
    "workspace.write",
    "artifact.read",
    "documents.manage",
    "artifact.review",
    "chat",
  ],
};
export function boardFixture(): Board {
  return {
    workspaces: [
      {
        id: "HIS",
        name: "医院信息系统",
        subtitle: "收费与支付",
        color: "purple",
        paused: false,
        knowledge: "产品知识",
        revision: "w1",
      },
      {
        id: "CIS",
        name: "临床信息系统",
        subtitle: "问诊",
        color: "teal",
        paused: false,
        knowledge: "项目知识",
        revision: "w2",
      },
    ],
    tasks: [
      {
        id: "TASK-2026-00001-M",
        title: "支付跨产品验证",
        workspace: "HIS",
        group: "TASK-2026-00001",
        main: true,
        status: "review",
        steps: [
          {
            id: "understand",
            name: "需求理解",
            skill: "requirement_understand",
            status: "review",
            detail: "第 3 版待确认",
            review: true,
          },
        ],
        description: "测试接口提供的需求",
        environment: "test-env",
        version: "2.3",
        locale: "zh-CN",
        workflow: "standard",
        history: ["来自测试后端的执行记录"],
        revision: "task-r7",
        allowedActions: [],
      },
      {
        id: "TASK-2026-00001-R01",
        title: "问诊支付同步",
        workspace: "CIS",
        group: "TASK-2026-00001",
        main: false,
        status: "pending",
        steps: [
          {
            id: "understand",
            name: "需求理解",
            skill: "requirement_understand",
            status: "pending",
            detail: "等待启动",
            review: true,
          },
        ],
        description: "关联任务",
        environment: "test-env",
        version: "2.3",
        locale: "zh-CN",
        workflow: "standard",
        history: [],
        revision: "task-r1",
        allowedActions: ["start"],
      },
    ],
    workflows: [
      {
        id: "standard",
        name: "后端标准流程",
        steps: [{ id: "understand", name: "需求理解" }],
      },
    ],
    models: [
      { id: "local-test", name: "已配置本地模型", capabilities: ["chat"] },
    ],
  };
}
