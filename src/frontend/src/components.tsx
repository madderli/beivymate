import { useEffect, useRef, type ReactNode } from "react";
import {
  LoaderCircle,
  CircleHelp,
  TriangleAlert,
  Clock3,
  CheckCircle2,
  Pause,
  X,
} from "lucide-react";
import { BrandWordmark } from "./BrandWordmark";
import { statusLabels, type Status } from "./model";
const icons = {
  running: LoaderCircle,
  review: CircleHelp,
  blocked: TriangleAlert,
  pending: Clock3,
  completed: CheckCircle2,
  paused: Pause,
  failed: TriangleAlert,
  queued: Clock3,
  authorization: CircleHelp,
  uncertain: CircleHelp,
  stopped: Pause,
};
export function Badge({ status }: { status: Status }) {
  const Icon = icons[status];
  return (
    <span className={`badge ${status}`}>
      <Icon size={13} />
      {statusLabels[status]}
    </span>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" role="img" aria-label="BeIvyMate">
      <span className="brand-icon">
        <img src="/ivy-icon.svg" alt="" width="34" height="34" />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          <BrandWordmark />
        </span>
      )}
    </div>
  );
}
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={close}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageHead({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div className="head-actions">{action}</div>
    </div>
  );
}
