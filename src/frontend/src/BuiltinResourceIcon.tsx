import { useRef } from "react";
import {
  GitBranch,
  ListOrdered,
  GitFork,
  Repeat,
  Route,
  CheckCheck,
  Layers,
  Waypoints,
  Workflow,
  Network,
  Brain,
  Search,
  FileText,
  ClipboardCheck,
  Code2,
  ShieldCheck,
  BookOpen,
  Wrench,
  Sparkles,
  Lightbulb,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import "./builtin-resource-icon.css";
const bank: Record<string, { label: string; icon: LucideIcon }> = {
  "wf:branch": { label: "流程分支", icon: GitBranch },
  "wf:sequence": { label: "顺序流程", icon: ListOrdered },
  "wf:parallel": { label: "并行协作", icon: GitFork },
  "wf:cycle": { label: "周期流程", icon: Repeat },
  "wf:route": { label: "流程路径", icon: Route },
  "wf:check": { label: "审核流程", icon: CheckCheck },
  "wf:layers": { label: "分层步骤", icon: Layers },
  "wf:connect": { label: "节点连接", icon: Waypoints },
  "wf:stages": { label: "阶段编排", icon: Workflow },
  "wf:network": { label: "协作网络", icon: Network },
  "sk:analysis": { label: "分析理解", icon: Brain },
  "sk:search": { label: "检索研究", icon: Search },
  "sk:writing": { label: "文档编写", icon: FileText },
  "sk:testing": { label: "测试设计", icon: ClipboardCheck },
  "sk:coding": { label: "代码开发", icon: Code2 },
  "sk:review": { label: "质量评审", icon: ShieldCheck },
  "sk:knowledge": { label: "知识整理", icon: BookOpen },
  "sk:tools": { label: "工具处理", icon: Wrench },
  "sk:creation": { label: "内容生成", icon: Sparkles },
  "sk:ideas": { label: "方案规划", icon: Lightbulb },
};
export function BuiltinResourceIcon({
  value,
  size = 24,
}: {
  value: string;
  size?: number;
}) {
  const entry = bank[value];
  const palette = ["#33734f", "#3e719e", "#a57532", "#825a9d", "#298583"];
  const index = Object.keys(bank)
    .filter((k) => k.startsWith(value.split(":")[0] + ":"))
    .indexOf(value);
  return entry ? (
    <entry.icon
      className="resource-line-icon"
      size={size}
      strokeWidth={1.7}
      style={{ color: palette[Math.max(0, index) % palette.length] }}
      aria-hidden="true"
    />
  ) : (
    <span className="resource-legacy-icon" aria-hidden="true">
      {value}
    </span>
  );
}
export function ResourceIconPicker({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      className="resource-icon-picker"
      ref={ref}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          e.currentTarget.open = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) {
          e.preventDefault();
          e.stopPropagation();
          ref.current.open = false;
        }
      }}
    >
      <summary
        aria-label="选择图标"
        aria-disabled={disabled}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        <BuiltinResourceIcon value={value} />
        <ChevronDown size={14} />
      </summary>
      <div className="resource-icon-grid" role="group" aria-label="内置图标">
        {[...new Set([value, ...options])].filter(Boolean).map((v, i) => (
          <button
            type="button"
            key={v}
            aria-label={`图标 ${i + 1}`}
            aria-pressed={v === value}
            disabled={disabled}
            onClick={() => {
              onChange(v);
              if (ref.current) ref.current.open = false;
            }}
          >
            <BuiltinResourceIcon value={v} />
          </button>
        ))}
      </div>
    </details>
  );
}
