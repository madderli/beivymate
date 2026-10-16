/** A view over the one Markdown document, not a second workflow format. */
export function WorkflowSteps({
  content,
  change,
  readonly,
}: {
  content: string;
  change: (text: string) => void;
  readonly: boolean;
}) {
  const matches = [...content.matchAll(/^## 步骤：([^\n]+)\s*$/gm)];
  const prefix = matches.length ? content.slice(0, matches[0].index) : content;
  const blocks = matches.map((m, i) =>
    content.slice(m.index, matches[i + 1]?.index ?? content.length),
  );
  const update = (next: string[]) =>
    change(prefix + next.map((block) => block.trimEnd() + "\n\n").join(""));
  const field = (block: string, name: string) =>
    block.match(new RegExp("^- " + name + "：(.*)$", "m"))?.[1]?.trim() || "";
  function setField(index: number, name: string, value: string) {
    const expression = new RegExp("^- " + name + "：.*$", "m");
    const next = [...blocks];
    next[index] = expression.test(next[index])
      ? next[index].replace(
          expression,
          "- " + name + "：" + value.replace(/[\r\n]/g, ""),
        )
      : next[index].trimEnd() +
        "\n- " +
        name +
        "：" +
        value.replace(/[\r\n]/g, "") +
        "\n\n";
    update(next);
  }
  return (
    <details className="workflow-step-editor" open>
      <summary>工作流步骤列表</summary>
      <p>
        表单与下方 Markdown
        编辑同一份内容。保存时校验技能、输入依赖和支持的策略；不会固定测试步骤顺序。
      </p>
      {blocks.map((block, i) => (
        <fieldset disabled={readonly} key={i}>
          <legend>第 {i + 1} 步</legend>
          <label>
            步骤标识
            <input
              value={matches[i][1].trim()}
              onChange={(e) => {
                const next = [...blocks];
                next[i] = block.replace(
                  /^## 步骤：[^\n]+/,
                  "## 步骤：" + e.target.value.replace(/[\r\n]/g, ""),
                );
                update(next);
              }}
            />
          </label>
          <label>
            技能标识
            <input
              value={field(block, "技能")}
              onChange={(e) => setField(i, "技能", e.target.value)}
            />
          </label>
          <label>
            输入引用（多个用“、”分隔）
            <input
              value={field(block, "输入")}
              onChange={(e) => setField(i, "输入", e.target.value)}
            />
          </label>
          <label>
            分析策略（仅支持分析的技能）
            <select
              value={field(block, "分析策略")}
              onChange={(e) => {
                if (!e.target.value) {
                  const next = [...blocks];
                  next[i] = block.replace(/^- 分析策略：.*\n?/m, "");
                  update(next);
                } else setField(i, "分析策略", e.target.value);
              }}
            >
              <option value="">继承任务／技能默认值</option>
              <option>简要</option>
              <option>标准</option>
              <option>深入</option>
            </select>
          </label>
          {["结果确认", "执行授权"].map((name) => (
            <label key={name}>
              {name}
              <select
                value={field(block, name)}
                onChange={(e) => {
                  if (!e.target.value) {
                    const next = [...blocks];
                    next[i] = block.replace(
                      new RegExp("^- " + name + "：.*\\n?", "m"),
                      "",
                    );
                    update(next);
                  } else setField(i, name, e.target.value);
                }}
              >
                <option value="">使用默认值</option>
                <option>人工</option>
                <option>自动</option>
              </select>
            </label>
          ))}
          <div className="run-actions">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const next = [...blocks];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                update(next);
              }}
            >
              上移
            </button>
            <button
              type="button"
              disabled={i === blocks.length - 1}
              onClick={() => {
                const next = [...blocks];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                update(next);
              }}
            >
              下移
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("删除此步骤？引用该步骤的输入也需要调整。"))
                  update(blocks.filter((_, n) => n !== i));
              }}
            >
              删除步骤
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={readonly}
        onClick={() =>
          update([
            ...blocks,
            "\n## 步骤：step_" +
              crypto.randomUUID().slice(0, 8) +
              "\n\n- 技能：requirement_understand\n- 输入：requirement\n- 执行授权：人工\n\n",
          ])
        }
      >
        增加步骤
      </button>
    </details>
  );
}
