import { useRef, useState } from "react";
import { api } from "./api";
import { Dialog } from "./components";
import { AttachmentInput } from "./attachments";
import type { Board, Workspace, Task } from "./model";
export function TaskForm({
  board,
  initial,
  draft,
  initialFiles = [],
  created,
  close,
  saved,
}: {
  board: Board;
  initial?: string;
  draft?: Partial<Task>;
  initialFiles?: File[];
  created?: (id: string) => void;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [workspace, setWorkspace] = useState(
    initial || draft?.workspace || board.workspaces[0]?.id || "",
  );
  const [related, setRelated] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState(
    draft?.workflow || board.workflows[0]?.id || "",
  );
  const requestKey = useRef(crypto.randomUUID());
  return (
    <Dialog
      title="新建测试任务"
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        noValidate
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
            const result = await api.createTask(data, requestKey.current);
            await saved();
            close();
            created?.(result.id);
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
            <input required name="title" defaultValue={draft?.title} />
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
            <textarea
              name="description"
              required={!files.length}
              defaultValue={draft?.description}
            />
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
              <input name="version" required defaultValue={draft?.version} />
            </label>
            <label>
              环境标识
              <input
                name="environment"
                defaultValue={draft?.environment}
                placeholder="可选，执行测试前配置"
              />
            </label>
            <label>
              交付语言
              <select name="locale" defaultValue={draft?.locale}>
                <option value="zh-CN">中文</option>
                <option value="en-US">英语</option>
              </select>
            </label>
          </div>
          <label>
            任务类型
            <select name="taskType" defaultValue={draft?.taskType}>
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
              defaultValue={draft?.analysisStrategy}
            >
              <option value="standard">标准</option>
              <option value="simple">简要</option>
              <option value="deep">深入</option>
            </select>
          </label>
          <p className="muted strategy-help">
            简要：聚焦直接相关规则与未知项；标准：覆盖常规分析维度；深入：进一步分析跨产品依赖、项目例外和版本影响。策略会保存到任务配置。
          </p>
          <label>
            确认方式
            <select name="reviewMode" defaultValue={draft?.reviewMode}>
              <option value="manual">人工确认</option>
              <option value="auto">自动确认</option>
            </select>
          </label>
          <label>
            客户产物目录
            <input
              name="outputDirectory"
              defaultValue={draft?.outputDirectory}
              placeholder="可选，留空继承工作区或个人设置"
            />
          </label>
          <label>
            用例保存路径
            <input
              name="testCasesPath"
              defaultValue={draft?.testCasesPath}
              placeholder="可选，设计用例时配置"
            />
          </label>
          <p className="muted">
            编号、关联任务和附件会自动保存。创建后可编辑任务配置，并在运行面板中启动工作流。
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
  isDefault = false,
  close,
  saved,
}: {
  workspace?: Workspace;
  isDefault?: boolean;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      className="workspace-dialog"
      title={workspace ? "配置工作区" : "新增工作区"}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        noValidate
        className="dialog-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const fields = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await api.saveWorkspace(
              {
                ...fields,
                isDefault: fields.isDefault === "on",
                expectedRevision: workspace?.revision,
              },
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
        <fieldset disabled={busy} className="workspace-fields">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={isDefault}
            />
            设为默认工作区
          </label>
          <label>
            工作区标识
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
            产品标识
            <input name="product" defaultValue={workspace?.product} />
          </label>
          <label>
            客户项目（可选）
            <input name="project" defaultValue={workspace?.project} />
          </label>
          <label>
            客户产物目录
            <input
              name="outputDirectory"
              defaultValue={workspace?.outputDirectory}
              placeholder="可选，留空使用个人或应用默认目录"
            />
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
