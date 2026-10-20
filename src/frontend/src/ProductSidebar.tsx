import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand } from "./components";
import "./product-sidebar.css";

type IconName =
  | "tasks"
  | "workspaces"
  | "skills"
  | "workflows"
  | "analytics"
  | "settings"
  | "logout"
  | "chevron"
  | "down"
  | "close";
export function SidebarIcon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, ReactNode> = {
    tasks: (
      <path d="M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
    ),
    workspaces: (
      <>
        <path d="m3 8 9-5 9 5-9 5-9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    skills: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M17.5 14v7M14 17.5h7" />
      </>
    ),
    workflows: (
      <path d="M6 3v8a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v4M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    ),
    analytics: <path d="M4 20h16M7 16v-5M12 16V5M17 16V8" />,
    settings: (
      <>
        <path d="M4 7h3M11 7h9M4 17h9M17 17h3" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="17" r="2" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
        <path d="M10 12h10m-4-4 4 4-4 4" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return (
    <svg
      className="ps-icon"
      data-sidebar-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export type SidebarWorkspace = {
  id: string;
  name: string;
  count?: number;
  isDefault?: boolean;
};
export default function ProductSidebar({
  activePage,
  workspaceId,
  workspaces,
  taskCount,
  userName,
  mobile,
  close,
  navigate,
  openWorkspace,
  newWorkspace,
  settings,
  account,
  logout,
  busy = false,
  canCreate = true,
  roleControl,
  accountLabel,
  accountMenu,
  logoutLabel = "退出登录",
}: {
  activePage: string;
  workspaceId?: string;
  workspaces: SidebarWorkspace[];
  taskCount?: number;
  userName: string;
  mobile: boolean;
  close: () => void;
  navigate: (page: string) => void;
  openWorkspace: (id: string) => void;
  newWorkspace?: () => void;
  settings: () => void;
  account: () => void;
  logout: () => void;
  busy?: boolean;
  canCreate?: boolean;
  roleControl?: ReactNode;
  accountLabel?: string;
  accountMenu?: ReactNode;
  logoutLabel?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [roleOpen, setRoleOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const roleWrap = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!roleOpen) return;
    const dismiss = (e: PointerEvent) => {
      if (!roleWrap.current?.contains(e.target as Node)) setRoleOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [roleOpen]);
  useEffect(() => {
    if (!mobile || !matchMedia("(max-width: 600px)").matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), select:not(:disabled), a[href]",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (roleWrap.current?.querySelector(".ps-role-menu"))
          setRoleOpen(false);
        else closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    const resized = () => {
      if (!matchMedia("(max-width: 600px)").matches) closeRef.current();
    };
    window.addEventListener("resize", resized);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resized);
      previousFocus?.focus();
    };
  }, [mobile]);
  return (
    <>
      {mobile && (
        <button
          className="ps-backdrop"
          aria-label="收起导航遮罩"
          tabIndex={-1}
          onClick={close}
        />
      )}
      <aside
        ref={sidebar}
        id="product-sidebar"
        className={`ad-sidebar product-sidebar ${mobile ? "open" : ""}`}
        aria-label="产品导航"
      >
        <header className="ps-topbar">
          <Brand />
          <div className="ps-role-wrap" ref={roleWrap}>
            {roleControl || (
              <>
                <button
                  className="ps-role-pill"
                  aria-label="当前角色：测试工程师"
                  aria-expanded={roleOpen}
                  onClick={() => setRoleOpen(!roleOpen)}
                >
                  测试工程师
                  <SidebarIcon name="down" size={12} />
                </button>
                {roleOpen && (
                  <div className="ps-role-menu">
                    <button
                      aria-pressed="true"
                      onClick={() => setRoleOpen(false)}
                    >
                      测试工程师
                    </button>
                    <button disabled>产品经理 · 后续开放</button>
                    <button disabled>开发工程师 · 后续开放</button>
                  </div>
                )}
              </>
            )}
          </div>
          <button className="ps-close" aria-label="关闭导航" onClick={close}>
            <SidebarIcon name="close" size={18} />
          </button>
        </header>
        <nav className="ps-scroll" aria-label="主导航">
          <section aria-labelledby="ps-workbench-heading">
            <div className="ps-section-heading" id="ps-workbench-heading">
              工作台
            </div>
            <button
              className={`ps-nav-item ${activePage === "home" ? "active" : ""}`}
              aria-label="我的任务"
              aria-current={activePage === "home" ? "page" : undefined}
              onClick={() => navigate("home")}
            >
              <SidebarIcon name="tasks" />
              <span>我的任务</span>
              {taskCount !== undefined && (
                <span className="ps-count" aria-hidden="true">
                  {taskCount}
                </span>
              )}
            </button>
            <div
              className={`ps-workspace-heading ${["workspace", "workspaces", "task"].includes(activePage) ? "active" : ""}`}
            >
              <button
                className="ps-nav-item"
                aria-label="工作区"
                aria-current={activePage === "workspaces" ? "page" : undefined}
                onClick={() => navigate("workspaces")}
              >
                <SidebarIcon name="workspaces" />
                <span>工作区</span>
              </button>
              <button
                className={`ps-workspace-toggle ${expanded ? "expanded" : ""}`}
                aria-label={expanded ? "收起工作区列表" : "展开工作区列表"}
                aria-expanded={expanded}
                aria-controls="ps-workspace-list"
                onClick={() => setExpanded(!expanded)}
              >
                <SidebarIcon name="chevron" size={16} />
              </button>
            </div>
            <div
              className="ps-workspaces ad-workspaces"
              id="ps-workspace-list"
              hidden={!expanded}
            >
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  className={`ps-workspace-row ${workspaceId === w.id ? "active" : ""}`}
                  aria-current={workspaceId === w.id ? "page" : undefined}
                  title={w.name}
                  onClick={() => openWorkspace(w.id)}
                >
                  <span className="ps-status-dot" />
                  <span className="ps-workspace-name">
                    {w.id}{" "}
                    {w.count !== undefined && (
                      <span className="ps-workspace-count">({w.count})</span>
                    )}
                  </span>
                  {w.isDefault && <span className="ps-default">默认</span>}
                  <SidebarIcon name="chevron" size={14} />
                </button>
              ))}
              {newWorkspace && (
                <button
                  className="ps-new-workspace"
                  aria-label="新增工作区"
                  disabled={!canCreate}
                  onClick={newWorkspace}
                >
                  ＋ 新建工作区
                </button>
              )}
              {!workspaces.length && (
                <p className="ps-workspace-empty">还没有工作区</p>
              )}
            </div>
          </section>
          <section className="ps-tools" aria-labelledby="ps-tools-heading">
            <div className="ps-section-heading" id="ps-tools-heading">
              工具
            </div>
            {[
              ["skills", "技能中心"],
              ["workflows", "工作流"],
              ["analytics", "分析统计"],
            ].map(([page, label]) => (
              <button
                key={page}
                className={`ps-tool-item ${activePage === page ? "active" : ""}`}
                aria-current={activePage === page ? "page" : undefined}
                onClick={() => navigate(page)}
              >
                <SidebarIcon
                  name={page as "skills" | "workflows" | "analytics"}
                  size={18}
                />
                <span>{label}</span>
              </button>
            ))}
          </section>
        </nav>
        <footer className="ps-account-bar">
          <button
            className="ps-account"
            onClick={account}
            aria-label={accountLabel}
            title="个人账户"
          >
            <span className="ps-avatar">{userName.slice(0, 1)}</span>
            <span className="ps-account-copy">
              <strong>{userName}</strong>
              <small>个人账户</small>
            </span>
          </button>
          <div className="ps-account-actions">
            <button aria-label="设置" title="设置" onClick={settings}>
              <SidebarIcon name="settings" />
            </button>
            <button
              aria-label={logoutLabel}
              title={logoutLabel}
              disabled={busy}
              onClick={logout}
            >
              <SidebarIcon name="logout" />
            </button>
          </div>
          {accountMenu && <div className="ps-account-menu">{accountMenu}</div>}
        </footer>
      </aside>
    </>
  );
}
