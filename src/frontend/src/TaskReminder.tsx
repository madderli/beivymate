import type { ReactNode } from "react";
import type { Task } from "./model";
import { useTimeGreeting } from "./useTimeGreeting";

export default function TaskReminder({
  tasks,
  children,
  workspaceName,
}: {
  tasks: Task[];
  children: ReactNode;
  workspaceName?: string;
}) {
  const greeting = useTimeGreeting()[1];
  const pending = tasks.filter((t) => t.status !== "completed");
  return (
    <section className="task-reminder" aria-label="AI 任务提醒">
      <span className="task-reminder-avatar" aria-hidden="true">
        <img src="/omnialba-mark.svg" alt="" />
      </span>
      <div
        className="task-reminder-bubble"
        tabIndex={workspaceName ? 0 : undefined}
      >
        <span className="task-reminder-name">
          OmniAlba · {workspaceName ? "工作区助手" : "任务提醒"}
        </span>
        {workspaceName && (
          <p className="workspace-conversation-context">{workspaceName}</p>
        )}
        <p className="task-reminder-message" aria-live="polite">
          {pending.length ? (
            <>
              {greeting}！今天要加把劲哦，还有{" "}
              <strong className="task-reminder-count">{pending.length}</strong>{" "}
              项任务需要你的协助。请查看待完成任务列表：
            </>
          ) : (
            `${greeting}！太棒了，您已经没有遗留的任务了！`
          )}
        </p>
        {children}
      </div>
    </section>
  );
}
