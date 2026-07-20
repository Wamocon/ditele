import { useId, type ReactNode } from "react";

type StatePanelProps = {
  action?: ReactNode;
  description: string;
  title: string;
  tone?: "neutral" | "danger";
};

export function StatePanel({ action, description, title, tone = "neutral" }: StatePanelProps) {
  const titleId = useId();
  return (
    <section className={`state-panel ${tone === "danger" ? "state-panel--danger" : ""}`.trim()} aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p className="muted">{description}</p>
      {action}
    </section>
  );
}
