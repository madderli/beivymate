import { useEffect, useRef, useState } from "react";
import { request } from "./api";
import type { Task } from "./model";

export const runLabels: Record<string, string> = {
  prepared: "待启动检查",
  queued: "排队中",
  running: "执行中",
  waiting_review: "等待结果确认",
  waiting_authorization: "等待执行授权",
  waiting_input: "等待执行结果",
  paused: "已暂停",
  completed: "已完成",
  failed: "失败",
  rejected: "已拒绝",
  stopped: "已停止",
  uncertain: "状态待核实",
};
type Run = {
  id: string;
  status: string;
  task: string;
  created: string;
  error: string;
  control?: string;
};
type Detail = Run & {
  index: number;
  steps: {
    id: string;
    skill: string;
    review_mode: string;
    analysis_strategy?: string;
  }[];
  subjectHash: string;
  reviewSubject: unknown;
  outputDirectory: string;
  models: Record<string, string>;
  decisions: unknown[];
  events: unknown[];
  snapshot: { task: Task };
  warnings?: string[];
  artifacts: Record<
    string,
    Record<string, { id: string; revision: number; sha256: string }>
  >;
};
const terminal = ["completed", "failed", "rejected", "stopped"];

export function RunPanel({
  task,
  requestedRun,
  changed,
}: {
  task: Task;
  requestedRun?: string;
  changed: () => Promise<void>;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState(requestedRun || "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const commandKey = useRef<{ signature: string; key: string } | null>(null);
  const [round, setRound] = useState("");
  useEffect(() => {
    if (requestedRun) setSelected(requestedRun);
  }, [requestedRun]);
  useEffect(() => {
    let active = true;
    let flight = false;
    const load = async () => {
      if (flight) return;
      flight = true;
      try {
        const list = await request<Run[]>(
          `/tasks/${encodeURIComponent(task.id)}/runs`,
        );
        const id = list.some((r) => r.id === selected) ? selected : list[0]?.id;
        const next = id
          ? await request<Detail>(`/runs/${encodeURIComponent(id)}`)
          : null;
        if (active) {
          setRuns(list);
          setDetail(next);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        flight = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [task.id, selected]);
  async function send(path: string, body: object) {
    const signature = JSON.stringify([path, body]);
    if (commandKey.current?.signature !== signature)
      commandKey.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const result = await request<{ id?: string }>(path, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": commandKey.current!.key },
      });
      commandKey.current = null;
      if (result.id) setSelected(result.id);
      if (detail && !result.id)
        setDetail(await request<Detail>(`/runs/${detail.id}`));
      await changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const live = runs.some((r) => !terminal.includes(r.status));
  return (
    <section className="panel run-panel">
      <h2>后台运行</h2>
      <p>关闭页面或退出登录不会停止后台任务。暂停在安全执行点生效。</p>
      <div className="run-actions">
        <button
          className="primary"
          disabled={
            busy ||
            live ||
            task.status === "paused" ||
            task.status === "completed" ||
            !!task.configurationIssue
          }
          onClick={() =>
            void send(`/tasks/${task.id}/runs`, {
              expectedRevision: task.revision,
            })
          }
        >
          准备新运行
        </button>
        <label>
          运行历史
          <select
            value={detail?.id || ""}
            onChange={(e) => {
              setDetail(null);
              setSelected(e.target.value);
            }}
          >
            <option value="" disabled>
              暂无运行
            </option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.created).toLocaleString()} · {runLabels[r.status]} ·{" "}
                {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {detail && (
        <>
          <p>
            {detail.id !== runs[0]?.id && <strong>历史运行 · </strong>}
            <strong>{runLabels[detail.status]}</strong>
            {detail.control &&
              " · " + (detail.control === "pause" ? "暂停中" : "停止中")}{" "}
            · 已处理 {detail.index}／{detail.steps.length} 步 · 运行编号{" "}
            {detail.id}
          </p>
          {detail.error && <p role="alert">{detail.error}</p>}
          <ol>
            {detail.steps.map((step, i) => (
              <li key={step.id}>
                {step.id} · {step.skill} ·{" "}
                {i < detail.index
                  ? "已确认"
                  : i === detail.index
                    ? runLabels[detail.status]
                    : "尚未执行"}
              </li>
            ))}
          </ol>
          {detail.status === "prepared" && (
            <div className="review-callout">
              <h3>启动前检查</h3>
              <p>输出目录：{detail.outputDirectory}</p>
              <p>模型：{JSON.stringify(detail.models)}</p>
              <p>请核对步骤、输入和下方运行快照；本次配置已冻结。</p>
              {detail.warnings?.map((text) => (
                <p key={text}>{text}</p>
              ))}
              <button
                disabled={busy}
                onClick={() =>
                  void send(`/runs/${detail.id}/commands`, { action: "start" })
                }
              >
                确认并开始运行
              </button>
            </div>
          )}
          <div className="run-actions">
            {["queued", "running"].includes(detail.status) && (
              <button
                disabled={busy || !!detail.control}
                onClick={() =>
                  void send(`/runs/${detail.id}/commands`, { action: "pause" })
                }
              >
                暂停运行
              </button>
            )}
            {detail.status === "paused" && (
              <button
                disabled={busy}
                onClick={() =>
                  void send(`/runs/${detail.id}/commands`, { action: "resume" })
                }
              >
                恢复运行
              </button>
            )}
            {!terminal.includes(detail.status) && (
              <button
                disabled={busy || !!detail.control}
                onClick={() => {
                  if (
                    window.confirm(
                      "停止此运行？已发生的操作与产物会保留，外部操作不会撤销。",
                    )
                  )
                    void send(`/runs/${detail.id}/commands`, {
                      action: "stop",
                    });
                }}
              >
                停止运行
              </button>
            )}
          </div>
          {["waiting_review", "waiting_authorization"].includes(
            detail.status,
          ) && (
            <div className="review-callout">
              <h3>{runLabels[detail.status]}</h3>
              {detail.reviewSubject != null && (
                <pre className="run-subject">
                  {JSON.stringify(detail.reviewSubject, null, 2)}
                </pre>
              )}
              {detail.status === "waiting_authorization" && (
                <p>
                  授权执行当前步骤：{detail.steps[detail.index]?.skill}
                  。请先核对下方运行快照。
                </p>
              )}
              {["approved", "rejected"].map((action) => (
                <button
                  key={action}
                  disabled={busy}
                  onClick={() =>
                    void send(`/runs/${detail.id}/commands`, {
                      action,
                      subjectHash: detail.subjectHash,
                    })
                  }
                >
                  {action === "approved" ? "确认通过并继续" : "拒绝本次运行"}
                </button>
              ))}
            </div>
          )}
          {detail.status === "waiting_input" && (
            <label>
              已完成的执行轮次
              <input
                value={round}
                onChange={(e) => setRound(e.target.value)}
                type="number"
                min="1"
              />
              <button
                disabled={busy || !round}
                onClick={() =>
                  void send(`/runs/${detail.id}/commands`, {
                    action: "supply_execution",
                    round: Number(round),
                  })
                }
              >
                关联执行结果
              </button>
            </label>
          )}
          <div className="run-actions">
            {Object.entries(detail.artifacts).flatMap(([step, outputs]) =>
              Object.entries(outputs).map(([name, ref]) => (
                <a
                  key={ref.id}
                  href={`/api/v1/documents/${ref.id}/content?revision=${ref.revision}&sha256=${ref.sha256}`}
                >
                  下载 {step}／{name}
                </a>
              )),
            )}
          </div>
          <details>
            <summary>运行快照、产物引用与确认记录</summary>
            <p>输出目录：{detail.outputDirectory}</p>
            <pre className="run-subject">
              {JSON.stringify(
                {
                  task: detail.snapshot?.task,
                  models: detail.models,
                  artifacts: detail.artifacts,
                  decisions: detail.decisions,
                  events: detail.events,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}

type Notice = {
  id: number;
  run: string;
  task: string;
  status: string;
  message: string;
  at: string;
  title: string;
  workspace: string;
  step: string;
};
export function RunNotifications({
  openTask,
}: {
  openTask: (task: string, run: string) => void;
}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let flight = false;
    async function load() {
      if (flight) return;
      flight = true;
      try {
        const values = await request<Notice[]>("/notifications");
        if (active) setItems(values);
      } catch {
        /* Existing alerts remain visible while the connection is unavailable. */
      } finally {
        flight = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const completedIds = items.map((item) => item.id).join(",");
  useEffect(() => {
    if (!completedIds) return;
    const timer = setTimeout(
      () =>
        setHidden((old) => [
          ...new Set([...old, ...completedIds.split(",").map(Number)]),
        ]),
      4500,
    );
    return () => clearTimeout(timer);
  }, [completedIds]);
  if (!items.length && !error) return null;
  return (
    <aside className="run-notices" aria-label="任务状态通知">
      <button className="secondary" onClick={() => setExpanded(!expanded)}>
        任务通知（{items.length}）
      </button>
      {expanded && (
        <button
          disabled={!items.length}
          onClick={async () => {
            setError("");
            const results = await Promise.allSettled(
              items.map(async (item) => {
                await request(`/notifications/${item.id}/read`, {
                  method: "POST",
                });
                return item.id;
              }),
            );
            const cleared = results.flatMap((r) =>
              r.status === "fulfilled" ? [r.value] : [],
            );
            setItems((old) => old.filter((i) => !cleared.includes(i.id)));
            setHidden((old) => [...new Set([...old, ...cleared])]);
            if (results.some((r) => r.status === "rejected"))
              setError("部分通知清空失败，请重试。");
          }}
        >
          清空通知
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite">
        {(expanded
          ? items
          : items.filter((i) => !hidden.includes(i.id)).slice(0, 3)
        ).map((item) => (
          <section className="panel" key={item.id}>
            <strong>{runLabels[item.status]}</strong>
            <p>
              {item.workspace} · {item.title}
            </p>
            <small>
              {item.task} · {item.step}
            </small>
            <p>{item.message}</p>
            <small>{new Date(item.at).toLocaleString()}</small>
            <div>
              <button onClick={() => openTask(item.task, item.run)}>
                查看任务
              </button>
              <button onClick={() => setHidden([...hidden, item.id])}>
                收起提示
              </button>
              <button
                onClick={async () => {
                  try {
                    await request(`/notifications/${item.id}/read`, {
                      method: "POST",
                    });
                    setHidden((old) => [...old, item.id]);
                    setItems((old) => old.filter((i) => i.id !== item.id));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                标为已读
              </button>
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
