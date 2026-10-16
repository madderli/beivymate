import { useEffect, useState } from "react";
import { request } from "./api";

export function OutputPreferences() {
  const [value, setValue] = useState("");
  const [revision, setRevision] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const data = await request<{ outputDirectory: string; revision: string }>(
        "/preferences/output",
      );
      setValue(data.outputDirectory);
      setRevision(data.revision);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel settings-panel">
      <h2>个人工作目录</h2>
      <label>
        默认客户产物目录
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="留空使用应用数据目录"
        />
      </label>
      <p>
        任务目录优先，其次工作区、个人设置。修改不搬迁已有文件，也不改变历史运行。
      </p>
      <button
        className="secondary"
        disabled={busy || !revision}
        onClick={async () => {
          setBusy(true);
          try {
            const data = await request<{ revision: string }>(
              "/preferences/output",
              {
                method: "PUT",
                body: JSON.stringify({ outputDirectory: value, revision }),
              },
            );
            setRevision(data.revision);
            setMessage("已保存，将用于后续新运行。");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        保存默认目录
      </button>
      <button
        className="text-button"
        onClick={() => {
          if (window.confirm("重新加载会替换当前未保存的目录草稿，是否继续？"))
            void load();
        }}
      >
        重新加载
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
