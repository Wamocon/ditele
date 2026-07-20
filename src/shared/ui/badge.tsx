import type { ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const toneClass = tone === "neutral" ? "" : `badge--${tone}`;
  return <span className={`badge ${toneClass}`.trim()}>{children}</span>;
}
