import { WorkflowSteps } from "./WorkflowSteps";
import { useEffect, useState } from "react";
import { request } from "./api";
import { SkillTemplates } from "./SkillTemplates";
import { Dialog } from "./components";
type Entry = {
  id: string;
  name: string;
  builtin: boolean;
  revision: string;
  content: string;
  path: string;
};
export function ConfigurationLibrary({
  close,
  initialKind = "skills",
}: {
  close: () => void;
  initialKind?: "skills" | "workflows";
}) {
  const [models, setModels] = useState<Entry[]>([]);
  useEffect(() => {
    let active = true;
    request<{ items: Entry[] }>("/configuration/models")
      .then((r) => {
        if (active) setModels(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const [kind, setKind] = useState<string>(initialKind);
  const [items, setItems] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry>();
  const [content, setContent] = useState("");
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [copy, setCopy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [baseId, setBaseId] = useState("");
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  useEffect(() => {
    let active = true;
    setSelected(undefined);
    setCreating(false);
    setBaseId("");
    setError("");
    setItems([]);
    request<{ items: Entry[] }>(`/configuration/${kind}`)
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind]);
  const canDiscard = () =>
    creating
      ? window.confirm("创建内容尚未保存，确认放弃当前草稿？")
      : !selected ||
        (!copy && !templateDirty && content === selected.content) ||
        window.confirm("修改尚未保存，确认放弃当前草稿？");
  return (
    <Dialog
      title="技能与工作流配置"
      close={() => {
        if (!busy && canDiscard()) close();
      }}
    >
      <div className="dialog-body">
        <p>
          系统默认配置只读。自定义副本与手工编辑使用同一个文件；保存冲突时保留草稿。
        </p>
        <label>
          配置类型
          <select
            disabled={busy}
            aria-label="配置类型"
            value={kind}
            onChange={(e) => {
              if (canDiscard()) setKind(e.target.value);
            }}
          >
            <option value="skills">技能</option>
            <option value="workflows">工作流</option>
          </select>
        </label>
        <div className="configuration-create-actions">
          <button
            className="primary"
            disabled={busy || !items.length}
            onClick={() => {
              if (canDiscard()) {
                setCreating(true);
                setBaseId(items[0]?.id || "");
                setNewName("");
                setNewId("");
                setNewInstructions("");
                setError("");
              }
            }}
          >
            {kind === "skills" ? "新建技能" : "新建工作流"}
          </button>
        </div>
        {creating && (
          <form
            className="configuration-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              const source = items.find((i) => i.id === baseId);
              if (!source) return;
              if (items.some((i) => i.id === newId)) {
                setError("标识已存在，请使用不同的标识。");
                return;
              }
              const header = source.content
                .replace(/^id:.*$/m, `id: ${newId}`)
                .replace(
                  /^name:.*$/m,
                  `name: ${JSON.stringify(newName.trim())}`,
                );
              setSelected(source);
              setIdentity(newId);
              setContent(
                kind === "skills"
                  ? header +
                      (newInstructions.trim()
                        ? `\n## 客户工作要求\n\n${newInstructions.trim()}\n`
                        : "")
                  : header,
              );
              setCopy(true);
              setCreating(false);
              setError("");
            }}
          >
            <h3>{kind === "skills" ? "创建自定义技能" : "创建自定义工作流"}</h3>
            <p>
              {kind === "skills"
                ? "选择基础能力，再填写工作要求。执行契约和模板一并继承；系统默认文件保持只读。"
                : "选择起始工作流，随后通过步骤列表增加、删除或调整顺序。保存后即可用于任务。"}
            </p>
            <label>
              {kind === "skills" ? "基础技能" : "起始工作流"}
              <select
                aria-label={kind === "skills" ? "基础技能" : "起始工作流"}
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
              >
                {items.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              新配置名称
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label>
              新配置标识
              <input
                required
                pattern="[a-z][a-z0-9_-]*"
                title="使用小写字母开头，可包含数字、下划线和连字符"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </label>
            {kind === "skills" && (
              <label>
                工作要求
                <textarea
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  placeholder="描述希望技能完成的工作、质量标准及注意事项"
                />
              </label>
            )}
            <div className="dialog-actions">
              <button type="button" onClick={() => setCreating(false)}>
                取消创建
              </button>
              <button className="primary">继续编辑</button>
            </div>
          </form>
        )}
        <label>
          选择配置
          <select
            aria-label="选择配置"
            disabled={busy}
            value={selected?.id || ""}
            onChange={(e) => {
              if (!canDiscard()) return;
              setCreating(false);
              const item = items.find((i) => i.id === e.target.value);
              setSelected(item);
              setContent(item?.content || "");
              setIdentity(item?.id || "");
              setCopy(false);
              setError("");
            }}
          >
            <option value="">请选择</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.builtin ? "系统默认" : "自定义"}
              </option>
            ))}
          </select>
        </label>
        {selected && !creating && (
          <>
            <p className="muted">{selected.path}</p>
            {kind === "skills" && !copy && (
              <SkillTemplates
                key={selected.id}
                skill={selected.id}
                onDirty={setTemplateDirty}
              />
            )}
            {kind === "skills" &&
              !/^executor: test_execution$/m.test(content) && (
                <label>
                  运行模型
                  <select
                    disabled={busy || (selected.builtin && !copy)}
                    value={(
                      content.match(/^model: (.*)$/m)?.[1] || "null"
                    ).replace(/^["']|["']$/g, "")}
                    onChange={(e) =>
                      setContent(
                        content.replace(
                          /^model:.*$/m,
                          `model: ${e.target.value}`,
                        ),
                      )
                    }
                  >
                    <option value="null">使用助手默认模型</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

            <button
              className="secondary"
              disabled={busy || copy}
              onClick={() => {
                const next = selected.id + "_custom";
                setCopy(true);
                setIdentity(next);
                setContent(content.replace(/^id:.*$/m, `id: ${next}`));
              }}
            >
              创建自定义副本
            </button>
            {copy && (
              <label>
                副本标识
                <input
                  value={identity}
                  onChange={(e) => {
                    setIdentity(e.target.value);
                    setContent(
                      content.replace(/^id:.*$/m, `id: ${e.target.value}`),
                    );
                  }}
                />
              </label>
            )}
            {kind === "workflows" && (
              <WorkflowSteps
                content={content}
                change={setContent}
                readonly={busy || (selected.builtin && !copy)}
              />
            )}
            <label>
              配置内容
              <textarea
                aria-label="配置内容"
                rows={16}
                readOnly={busy || (selected.builtin && !copy)}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
            <p className="muted">
              技能模型由 model 指定配置标识，null
              表示使用助手默认模型。修改工作要求时保留文件头的稳定标识和契约。
            </p>
            <button
              className="primary"
              disabled={busy || (selected.builtin && !copy)}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const saved = await request<Entry>(
                    `/configuration/${kind}/${encodeURIComponent(identity)}`,
                    {
                      method: "PUT",
                      body: JSON.stringify({
                        content,
                        revision: copy ? undefined : selected.revision,
                        copyFrom: copy ? selected.id : undefined,
                      }),
                    },
                  );
                  setSelected(saved);
                  setContent(saved.content);
                  setCopy(false);
                  setItems((old) => [
                    ...old.filter((i) => i.id !== saved.id),
                    saved,
                  ]);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在保存…" : "保存配置"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
