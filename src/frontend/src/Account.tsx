import { useState } from "react";
import { Brand } from "./components";
import { api, request } from "./api";
import type { Session } from "./model";
const passwordRule =
  "密码需为 12～256 个字符，同时包含大写字母、小写字母、数字和符号，不能包含空白字符。";
function validatePassword(value: string) {
  if (
    Array.from(value).length < 12 ||
    Array.from(value).length > 256 ||
    /\s/u.test(value) ||
    ![/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9\s]/u].every((rule) =>
      rule.test(value),
    )
  )
    throw new Error(passwordRule);
}

export function PersonalLogin({
  session,
  connected,
  connectionError,
  refresh,
  loggedIn,
}: {
  session: Session | null;
  connected: boolean;
  connectionError: string;
  refresh: () => Promise<void>;
  loggedIn: (session: Session) => Promise<void>;
}) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const initializing = !!session?.needsInitialization;
  const mode = initializing ? "initialize" : recovery ? "recover" : "login";
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="story-content">
          <span className="eyebrow">你的个人智能工作伙伴</span>
          <h1>
            把专注留给判断。
            <br />
            <span>让助手接住日常。</span>
          </h1>
          <p>
            个人账户，本机保存。
            <br />
            由你决定，让助手协作。
          </p>
        </div>
        <small>个人工作空间 · 企业身份与凭据独立关联</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="pill">外测体验 · 本地账户</span>
          <h2>
            {code
              ? "请保存恢复码"
              : initializing
                ? "创建你的本地账户"
                : recovery
                  ? "恢复账户"
                  : "登录你的工作台"}
          </h2>
          {code ? (
            <>
              <p>
                恢复码只展示这一次。请保存到安全位置；遗失密码和恢复码后，无法通过在线邮件找回。本次恢复会使旧恢复码失效。
              </p>
              <pre
                aria-label="账户恢复码"
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {code}
              </pre>
              <button
                className="primary full"
                onClick={async () => {
                  await refresh();
                  setCode("");
                  setRecovery(false);
                }}
              >
                我已保存，返回登录
              </button>
            </>
          ) : (
            <>
              {!connected && (
                <div className="notice" role="alert">
                  <div>
                    <strong>尚未连接本地账户服务</strong>
                    <p>
                      请先在项目根目录启动后端，再点击“重新连接”。首次使用时，连接成功后会自动显示“创建你的本地账户”。
                    </p>
                    <code style={{ overflowWrap: "anywhere" }}>
                      .venv/bin/python -m beivymate.application.web
                    </code>
                    {connectionError && (
                      <details>
                        <summary>连接诊断</summary>
                        <p>{connectionError}</p>
                      </details>
                    )}
                    <button
                      className="text-button"
                      onClick={() => void refresh()}
                    >
                      重新连接
                    </button>
                  </div>
                </div>
              )}
              <form
                noValidate
                key={mode}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  setBusy(true);
                  setError("");
                  const username = String(data.get("username")).trim();
                  const password = String(data.get("password"));
                  try {
                    if (!username || !password)
                      throw new Error("请填写用户名和密码。");
                    if (mode !== "login") validatePassword(password);
                    if (
                      mode === "initialize" &&
                      (!String(data.get("name") || "").trim() ||
                        !data.get("setupToken"))
                    )
                      throw new Error("请填写显示名称和初始化码。");
                    if (mode === "recover" && !data.get("recoveryCode"))
                      throw new Error("请填写恢复码。");
                    if (
                      mode !== "login" &&
                      password !== data.get("confirmation")
                    )
                      throw new Error("两次输入的密码不一致。");
                    if (mode === "initialize") {
                      const result = await request<{ recoveryCode: string }>(
                        "/account/initialize",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            username,
                            password,
                            name: data.get("name"),
                            setupToken: data.get("setupToken"),
                            role: "tester",
                          }),
                        },
                      );
                      setCode(result.recoveryCode);
                    } else if (mode === "recover") {
                      const result = await request<{ recoveryCode: string }>(
                        "/account/recover",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            username,
                            password,
                            recoveryCode: data.get("recoveryCode"),
                          }),
                        },
                      );
                      setCode(result.recoveryCode);
                    } else {
                      const result = await api.login(username, password);
                      if (!result.authenticated)
                        throw new Error("登录未成功。");
                      await loggedIn(result);
                    }
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    form
                      .querySelectorAll<HTMLInputElement>(
                        'input[name="password"], input[name="confirmation"]',
                      )
                      .forEach((input) => {
                        input.value = "";
                      });
                    setBusy(false);
                  }
                }}
              >
                <fieldset
                  disabled={busy}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  {initializing && (
                    <>
                      <label>
                        初始化码
                        <input
                          name="setupToken"
                          type="password"
                          required
                          autoComplete="off"
                        />
                      </label>
                      <p className="muted">从本机后端启动窗口复制初始化码。</p>
                      <label>
                        显示名称
                        <input
                          name="name"
                          required
                          maxLength={80}
                          autoComplete="name"
                        />
                      </label>
                    </>
                  )}
                  <label>
                    用户名（邮箱或工号）
                    <input
                      name="username"
                      aria-label="用户名"
                      required
                      autoComplete="username"
                      maxLength={254}
                    />
                  </label>
                  {mode === "recover" && (
                    <label>
                      恢复码
                      <input
                        name="recoveryCode"
                        required
                        type="password"
                        autoComplete="off"
                      />
                    </label>
                  )}
                  <label>
                    {mode === "recover" ? "新密码" : "密码"}
                    <input
                      name="password"
                      type="password"
                      required

                      maxLength={256}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                    />
                  </label>
                  {mode !== "login" && <p className="muted">{passwordRule}</p>}
                  {mode !== "login" && (
                    <label>
                      确认密码
                      <input
                        name="confirmation"
                        type="password"
                        required

                        maxLength={256}
                        autoComplete="new-password"
                      />
                    </label>
                  )}
                  <label>
                    工作角色
                    <select name="role">
                      <option value="tester">测试工程师</option>
                      <option disabled>产品经理助手 · 规划中</option>
                      <option disabled>开发助手 · 规划中</option>
                    </select>
                  </label>
                  <button
                    className="primary full"
                    disabled={!connected || busy}
                  >
                    {busy
                      ? "正在处理…"
                      : initializing
                        ? "创建账户"
                        : recovery
                          ? "重置密码"
                          : "登录"}
                  </button>
                </fieldset>
              </form>
              {!initializing && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setRecovery(!recovery);
                    setError("");
                  }}
                >
                  {recovery ? "返回登录" : "忘记密码？使用恢复码"}
                </button>
              )}
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function AccountSettings({
  session,
  changed,
}: {
  session: Session;
  changed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h2>账户与试用权限</h2>
      <p>身份：{session.user?.name} · 角色：测试工程师</p>
      <p>
        试用版开放全部已实现功能；尚未接入的功能按开发阶段开放。当前试用不设到期时间。
      </p>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setMessage("");
          try {
            await request("/account/profile", {
              method: "PATCH",
              body: JSON.stringify({ name: data.get("name") }),
            });
            await changed();
            setMessage("显示名称已更新，账户身份保持不变。");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          显示名称
          <input
            name="name"
            defaultValue={session.user?.name}
            required
            maxLength={80}
            disabled={busy}
          />
        </label>
        <button className="secondary" disabled={busy}>
          保存显示名称
        </button>
      </form>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          setBusy(true);
          setMessage("");
          try {
            if (!data.get("currentPassword"))
              throw new Error("请填写当前密码。");
            validatePassword(String(data.get("newPassword") || ""));
            if (data.get("newPassword") !== data.get("confirm"))
              throw new Error("两次输入的密码不一致。");
            await request("/account/password", {
              method: "POST",
              body: JSON.stringify({
                currentPassword: data.get("currentPassword"),
                newPassword: data.get("newPassword"),
              }),
            });
            form.reset();
            await changed();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
          <h3>修改密码</h3>
          <p className="muted">{passwordRule}</p>
          <p>
            修改成功后，所有登录会话失效，需要重新登录；已授权后台任务不因此停止。
          </p>
          <label>
            当前密码
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            新密码
            <input
              name="newPassword"
              type="password"
              required

              maxLength={256}
              autoComplete="new-password"
            />
          </label>
          <label>
            确认新密码
            <input
              name="confirm"
              type="password"
              required

              maxLength={256}
              autoComplete="new-password"
            />
          </label>
          <button className="secondary">修改密码并重新登录</button>
        </fieldset>
      </form>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          setBusy(true);
          setMessage("");
          try {
            await request(
              `/account/credentials/${encodeURIComponent(String(data.get("connection")))}`,
              {
                method: "PUT",
                body: JSON.stringify({ secret: data.get("secret") }),
              },
            );
            form.reset();
            setMessage("凭据已保存到系统安全凭据库；不代表已连接企业系统。");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
          <h3>企业连接凭据</h3>
          <p>仅存入操作系统安全凭据库；不会写入工作流或业务资料。</p>
          <label>
            连接标识
            <input
              name="connection"
              required
              pattern="[A-Za-z0-9_-]+"
              maxLength={80}
            />
          </label>
          <label>
            连接密钥
            <input
              name="secret"
              type="password"
              required
              autoComplete="off"
              maxLength={8192}
            />
          </label>
          <button className="secondary">安全保存凭据</button>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
