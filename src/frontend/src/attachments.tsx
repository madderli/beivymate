import { useRef, useState } from "react";
export function AttachmentInput({
  value,
  change,
}: {
  value: File[];
  change: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div className="attachment-field">
      <div>
        <span>需求附件</span>
        <button
          className="secondary"
          type="button"
          onClick={() => input.current?.click()}
        >
          选择附件
        </button>
        <span className="muted">
          {value.length ? `已选择 ${value.length} 个附件` : "未选择附件"}
        </span>
        <input
          ref={input}
          aria-label="需求附件"
          hidden
          type="file"
          multiple
          accept=".md,.txt,.pdf,.docx,.xlsx,.png,.jpg,.jpeg"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            setError("");
            if (
              value.length + files.length > 5 ||
              files.some(
                (f) =>
                  f.size > 20 * 1024 * 1024 ||
                  !/\.(md|txt|pdf|docx|xlsx|png|jpe?g)$/i.test(f.name),
              )
            ) {
              setError(
                "最多 5 个附件，每个不超过 20 MB，文件格式不受支持或超出限制。",
              );
              return;
            }
            change([...value, ...files]);
          }}
        />
      </div>
      <p className="muted">
        创建任务时交给后端保存。当前选择是未提交草稿，关闭页面后不会保留。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {value.map((file, i) => (
        <div className="attachment-row" key={i}>
          <span>
            {file.name} · {Math.ceil(file.size / 1024)} KB
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => change(value.filter((_, n) => n !== i))}
          >
            移除
          </button>
        </div>
      ))}
    </div>
  );
}
