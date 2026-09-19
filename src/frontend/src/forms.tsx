import { useRef, useState } from "react";
import { api } from "./api";
import { Dialog } from "./components";
import { AttachmentInput } from "./attachments";
import type { Board, Workspace } from "./model";
export function TaskForm({
  board,
  initial,
  close,
  saved,
}: {
  board: Board;
  initial?: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [workspace, setWorkspace] = useState(
    initial || board.workspaces[0]?.id || "",
  );
  const [related, setRelated] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState(board.workflows[0]?.id || "");
  const requestKey = useRef(crypto.randomUUID());
  return (
    <Dialog
      title="新建测试任务"
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="dialog-body"
        onChange={() => {
          requestKey.current = crypto.randomUUID();
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const data = new FormData(e.currentTarget);
          data.set("relatedWorkspaces", JSON.stringify(related));
          files.forEach((f) => data.append("attachments", f));
          try {
            await api.createTask(data, requestKey.current);
            await saved();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            任务名称
            <input required name="title" />
          </label>
          <div className="form-grid">
            <label>
              主工作区
              <select
                name="workspace"
                required
                value={workspace}
                onChange={(e) => {
                  setWorkspace(e.target.value);
                  setRelated((old) =>
                    old.filter((id) => id !== e.target.value),
                  );
                }}
              >
                {board.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} · {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              工作流
              <select
                required
                name="workflow"
                value={workflow}
                onChange={(e) => setWorkflow(e.target.value)}
              >
                {board.workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>同步创建关联任务</legend>
            {board.workspaces
              .filter((w) => w.id !== workspace)
              .map((w) => (
                <label className="checkbox-label" key={w.id}>
                  <input
                    type="checkbox"
                    checked={related.includes(w.id)}
                    onChange={(e) =>
                      setRelated((old) =>
                        e.target.checked
                          ? [...old, w.id]
                          : old.filter((id) => id !== w.id),
                      )
                    }
                  />
                  {w.id} · {w.name}
                </label>
              ))}
          </fieldset>
          <div className="flow-preview">
            {board.workflows
              .find((w) => w.id === workflow)
              ?.steps.map((s) => (
                <span key={s.id}>
                  <b>{s.name}</b>
                </span>
              ))}
          </div>
          <label>
            需求与工作目标
            <textarea name="description" required={!files.length} />
          </label>
          <AttachmentInput
            value={files}
            change={(f) => {
              setFiles(f);
              requestKey.current = crypto.randomUUID();
            }}
          />
          <div className="form-grid">
            <label>
              目标版本
              <input name="version" required />
            </label>
            <label>
              环境标识
              <input name="environment" required />
            </label>
            <label>
              交付语言
              <select name="locale">
                <option value="zh-CN">中文</option>
                <option value="en-US">英语</option>
              </select>
            </label>
          </div>
          <p className="muted">
            编号、关联任务和附件由后端创建。保存不代表开始执行。
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="primary"
            disabled={busy || !workspace || !workflow}
          >
            {busy ? "正在提交…" : "创建任务"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function WorkspaceForm({
  workspace,
  close,
  saved,
}: {
  workspace?: Workspace;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={workspace ? "配置工作区" : "新增工作区"}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="dialog-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const fields = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await api.saveWorkspace(
              { ...fields, expectedRevision: workspace?.revision },
              workspace?.id,
            );
            await saved();
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            产品标识
            <input
              required
              name="id"
              defaultValue={workspace?.id}
              readOnly={!!workspace}
            />
          </label>
          <label>
            工作区名称
            <input required name="name" defaultValue={workspace?.name} />
          </label>
          <label>
            产品范围
            <input name="subtitle" defaultValue={workspace?.subtitle} />
          </label>
          <label>
            知识来源
            <input name="knowledge" defaultValue={workspace?.knowledge} />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在保存…" : "保存工作区"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
