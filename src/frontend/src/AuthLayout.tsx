import { type ReactNode } from "react";
import { useTimeGreeting } from "./useTimeGreeting";
import {
  Blocks,
  Check,
  ChevronRight,
  Code2,
  PanelsTopLeft,
} from "lucide-react";
import { Brand } from "./components";
import "./auth.css";

export function AuthLayout({ children }: { children: ReactNode }) {
  const greeting = useTimeGreeting();
  return (
    <main className="oa-auth">
      <aside className="oa-brand-panel" aria-label="OmniAlba 品牌问候">
        <header className="oa-brand-head">
          <Brand />
          <p className="oa-partner">YOUR EVERYDAY WORK PARTNER</p>
        </header>
        <div className="oa-brand-spacer" />
        <div className="oa-brand-copy">
          <div>
            <p className="oa-greeting-en">{greeting[0]}</p>
            <p className="oa-greeting-cn">{greeting[1]}，欢迎回来</p>
          </div>
          <div className="oa-slogan">
            <p className="oa-slogan-cn">每个清晨，我来搭把手</p>
            <p className="oa-slogan-en">Every dawn, a helping hand</p>
          </div>
        </div>
        <p className="oa-brand-foot">
          © {new Date().getFullYear()} OmniAlba · 每一个清晨
        </p>
      </aside>
      <section className="oa-auth-panel" aria-label="登录与角色选择">
        <div className="oa-stage">{children}</div>
      </section>
    </main>
  );
}

export function RoleSelection({
  enter,
  back,
  busy,
  error,
}: {
  enter: () => void;
  back: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <AuthLayout>
      <header className="oa-section-head">
        <h1>今天，以什么角色开始？</h1>
        <p>选择工作角色，进入你的 Agent 工作空间。</p>
      </header>
      <div className="oa-role-list" aria-label="选择工作角色">
        <button className="oa-role selected" aria-pressed="true">
          <Blocks size={25} />
          <span>测试工程师</span>
          <Check size={22} />
        </button>
        <button className="oa-role" disabled>
          <PanelsTopLeft size={25} />
          <span>产品经理</span>
          <small>后续开放</small>
        </button>
        <button className="oa-role" disabled>
          <Code2 size={25} />
          <span>开发工程师</span>
          <small>后续开放</small>
        </button>
      </div>
      {error && (
        <p className="oa-error" role="alert">
          {error}
        </p>
      )}
      <div className="oa-role-actions">
        <button className="oa-primary" disabled={busy} onClick={enter}>
          进入 Agent <ChevronRight size={17} />
        </button>
        <button className="oa-back" disabled={busy} onClick={back}>
          ‹ 返回登录
        </button>
      </div>
    </AuthLayout>
  );
}
