import { GitBranch, Info, ListTodo } from "lucide-react";
import { Dialog } from "../../components";
import "./workflow-confirmation.css";

export default function DisableWorkflowDialog({
  name,
  tasks,
  close,
  confirm,
}: {
  name: string;
  tasks: { name: string; status: string }[];
  close: () => void;
  confirm: () => void;
}) {
  const pending = tasks.filter((t) => t.status !== "已完成");
  return (
    <Dialog className="wf-disable-dialog" title="停用工作流？" close={close}>
      <div className="wc-body">
        <p className="wc-intro">停用前，请确认该工作流的使用情况。</p>
        <div className="wc-target">
          <span className="wc-target-icon">
            <GitBranch size={21} />
          </span>
          <div>
            <small>即将停用</small>
            <strong>{name}</strong>
          </div>
          <span className="wc-current-status">已启用</span>
        </div>
        <div className="wc-section-title">
          <ListTodo size={15} />
          <h3>正在使用的任务</h3>
          <span>{pending.length} 个</span>
        </div>
        {pending.length ? (
          <ul className="wc-task-list">
            {pending.map((task, i) => (
              <li key={`${task.name}-${i}`}>
                <span className="wc-task-dot" />
                <span className="wc-task-name">{task.name}</span>
                <span
                  className={`wc-task-status ${task.status === "执行中" ? "running" : task.status === "待确认" ? "waiting" : "paused"}`}
                >
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="wc-empty">当前没有正在使用该工作流的任务。</div>
        )}
        <div className="wc-impact">
          <Info size={17} />
          <div>
            <strong>停用后的影响</strong>
            <p>
              {pending.length
                ? "这些任务将无法继续运行，新任务也无法选用该工作流。"
                : "新任务将无法选用该工作流。"}
            </p>
            <small>工作流配置会保留，需要时可以重新启用。</small>
          </div>
        </div>
      </div>
      <footer className="wc-footer">
        <button className="wc-cancel" onClick={close}>
          取消
        </button>
        <button className="wc-confirm" onClick={confirm}>
          确认停用
        </button>
      </footer>
    </Dialog>
  );
}
