import type { ReactNode } from "react";
import type { Task } from "./model";
import { useTaskGreeting, useWorkspaceGreeting } from "./useTimeGreeting";

export default function TaskReminder({
  tasks,
  children,
  workspaceName,
}: {
  tasks: Task[];
  children: ReactNode;
  workspaceName?: string;
}) {
  const greeting = useTaskGreeting();
  const workspaceGreeting = useWorkspaceGreeting();
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
        <p className="task-reminder-message" aria-live="polite">
          {workspaceName ? (
            <>
              {workspaceGreeting}
              {pending.length ? (
                <>
                  还有{" "}
                  <strong className="task-reminder-count">
                    {pending.length}
                  </strong>{" "}
                  项任务需要你的协助。
                </>
              ) : (
                "当前没有未完成任务，可以从容地开始新的目标。"
              )}
            </>
          ) : pending.length ? (
            <>
              {greeting.opening}还有{" "}
              <strong className="task-reminder-count">{pending.length}</strong>{" "}
              项任务需要你的协助，可以从下方列表继续处理。
            </>
          ) : (
            `${greeting.opening}${greeting.empty}`
          )}
        </p>
        {children}
      </div>
    </section>
  );
}
