import { useState } from "react";
import { Check, Layers, LockKeyhole, Plus } from "lucide-react";
import { Brand } from "../components";
import { WorkspaceEditor, type WorkspaceDraft } from "../WorkspaceEditor";
const samples: WorkspaceDraft[] = [
  {
    key: "his",
    id: "HIS",
    name: "医院业务协同工作区",
    description: "围绕挂号、收费与医保结算，统一管理业务验证和跨产品协作。",
    products: ["HIS · 医院信息系统", "CIS · 临床信息系统"],
    projects: ["市一院 · 智慧医院建设", "市二院 · 门诊升级"],
    directories: [
      "/knowledge/hospital/requirements",
      "/knowledge/hospital/product-guides",
    ],
    isDefault: true,
    pending: [
      { name: "门诊收费与医嘱状态一致性核对", status: "待确认" },
      { name: "医保结算异常场景验证", status: "待执行" },
    ],
  },
  {
    key: "lis",
    id: "LIS",
    name: "检验业务工作区",
    description: "管理检验业务相关需求、项目资料与验证任务。",
    products: ["LIS · 检验信息系统"],
    projects: ["市一院 · 智慧医院建设"],
    directories: ["/knowledge/laboratory"],
    isDefault: false,
    pending: [],
  },
];
export default function WorkspaceDesignDemo() {
  const [workspaces, setWorkspaces] = useState(samples);
  const [editor, setEditor] = useState<{ value?: WorkspaceDraft } | null>({});
  const [notice, setNotice] = useState("");
  return (
    <div className="wsd-demo">
      <header className="wsd-demo-header">
        <Brand />
        <span>工作区设计预览</span>
        <a href="/">返回应用</a>
      </header>
      <main className="wsd-demo-main">
        <div className="wsd-page-heading">
          <div>
            <span>WORKSPACES</span>
            <h1>我的工作区</h1>
            <p>把相关的工作聚在一起，和 OmniAlba 一起推进。</p>
          </div>
          <button className="wsd-primary" onClick={() => setEditor({})}>
            <Plus size={16} />
            新增工作区
          </button>
        </div>
        <p className="wsd-preview-note">
          交互 Demo ·
          可预览新增、自由编辑与任务未完成时的只读状态。数据仅保留在本次页面中。
        </p>
        {notice && (
          <p className="wsd-success" role="status">
            <Check size={16} />
            {notice}
          </p>
        )}
        <div className="wsd-workspace-grid">
          {workspaces.map((w) => (
            <article key={w.key}>
              <div className="wsd-workspace-card-head">
                <span className="wsd-workspace-icon">
                  <Layers size={22} />
                </span>
                <b>{w.id}</b>
                {w.isDefault && <span className="wsd-default-badge">默认</span>}
              </div>
              <h2>{w.name}</h2>
              <p>{w.description || "还没有添加描述"}</p>
              <div className="wsd-workspace-meta">
                <span>{w.products.length} 个产品</span>
                <span>{w.projects.length} 个项目</span>
                <span>{w.directories.length} 个知识目录</span>
              </div>
              <footer>
                <span>
                  {w.pending.length
                    ? `${w.pending.length} 项任务待完成`
                    : "暂无未完成任务"}
                </span>
                <button
                  className="wsd-secondary"
                  onClick={() => setEditor({ value: w })}
                >
                  {w.pending.length ? (
                    <>
                      <LockKeyhole size={13} />
                      查看配置
                    </>
                  ) : (
                    "编辑工作区"
                  )}
                </button>
              </footer>
            </article>
          ))}
        </div>
      </main>
      {editor && (
        <WorkspaceEditor
          initial={editor.value}
          existing={workspaces}
          close={() => setEditor(null)}
          save={(value) => {
            setWorkspaces((old) => {
              const next = old.some((w) => w.key === value.key)
                ? old.map((w) => (w.key === value.key ? value : w))
                : [...old, value];
              return next.map((w) =>
                value.isDefault && w.key !== value.key
                  ? { ...w, isDefault: false }
                  : w,
              );
            });
            setEditor(null);
            setNotice(
              `${value.id} · ${value.name} 已${editor.value ? "更新" : "创建"}。`,
            );
          }}
        />
      )}
    </div>
  );
}
