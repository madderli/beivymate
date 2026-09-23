import { useState } from "react";
import { Dialog } from "./components";
import { request } from "./api";
import type { Task, Workflow } from "./model";

export function TaskEdit({
  task,
  workflows,
  close,
  saved,
}: {
  task: Task;
  workflows: Workflow[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title="编辑任务配置"
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="dialog-body"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          setError("");
          try {
            await request(`/tasks/${encodeURIComponent(task.id)}`, {
              method: "PATCH",
              body: JSON.stringify({
                ...data,
                expectedRevision: task.revision,
              }),
            });
            await saved();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          当前只修改此任务；关联任务可分别配置环境与版本。标识和工作区归属保持不变。
        </p>
        <fieldset disabled={busy}>
          <label>
            任务名称
            <input name="title" defaultValue={task.title} />
          </label>
          <label>
            需求与工作目标
            <textarea name="description" defaultValue={task.description} />
          </label>
          <label>
            工作流
            <select name="workflow" defaultValue={task.workflow}>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标版本
            <input name="version" defaultValue={task.version} />
          </label>
          <label>
            环境标识
            <input
              name="environment"
              placeholder="可选，执行测试前配置"
              defaultValue={task.environment}
            />
          </label>
          <label>
            交付语言
            <select name="locale" defaultValue={task.locale}>
              <option value="zh-CN">中文</option>
              <option value="en-US">英语</option>
            </select>
          </label>
          <label>
            任务类型
            <select
              name="taskType"
              defaultValue={task.taskType || "requirement"}
            >
              <option value="requirement">完整需求</option>
              <option value="incremental">增量需求</option>
              <option value="defect">缺陷验证</option>
              <option value="regression">回归测试</option>
            </select>
          </label>
          <label>
            分析策略
            <select
              name="analysisStrategy"
              defaultValue={task.analysisStrategy || "standard"}
            >
              <option value="simple">简要</option>
              <option value="standard">标准</option>
              <option value="deep">深入</option>
            </select>
          </label>
          <p className="muted strategy-help">
            简要：聚焦直接相关规则与未知项；标准：覆盖常规分析维度；深入：进一步分析跨产品依赖、项目例外和版本影响。策略会保存到任务配置。
          </p>
          <label>
            确认方式
            <select
              name="reviewMode"
              defaultValue={task.reviewMode || "manual"}
            >
              <option value="manual">人工确认</option>
              <option value="auto">自动确认</option>
            </select>
          </label>
          <label>
            用例保存路径
            <input
              name="testCasesPath"
              placeholder="可选，设计用例时配置"
              defaultValue={task.testCasesPath ?? ""}
            />
          </label>
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {error && (
          <p>
            草稿仍保留。可先复制修改内容，关闭后刷新任务，再重新打开核对；不会强制覆盖文件。
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            保存任务
          </button>
        </div>
      </form>
    </Dialog>
  );
}
