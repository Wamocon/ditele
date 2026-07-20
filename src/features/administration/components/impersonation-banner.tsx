import { Button } from "@/shared/ui/button";

import type { ImpersonationSession } from "../model";

export interface ImpersonationBannerLabels {
  readonly active: (targetName: string, targetRole: string) => string;
  readonly reason: string;
  readonly expiresAt: string;
  readonly end: string;
  readonly roles: Readonly<Record<ImpersonationSession["target"]["role"], string>>;
}

export interface ImpersonationBannerProps {
  readonly session: ImpersonationSession;
  readonly labels: ImpersonationBannerLabels;
  readonly formatDateTime: (isoDate: string) => string;
  readonly endAction: (formData: FormData) => void | Promise<void>;
}

export function ImpersonationBanner({
  session,
  labels,
  formatDateTime,
  endAction,
}: ImpersonationBannerProps) {
  if (session.state !== "active") {
    return null;
  }

  return (
    <aside className="impersonation-banner" role="status" aria-live="polite">
      <strong>{labels.active(session.target.displayName, labels.roles[session.target.role])}</strong>
      <span>{labels.reason}: {session.reason}</span>
      <span>{labels.expiresAt}: {formatDateTime(session.expiresAt)}</span>
      <form action={endAction}>
        <input name="impersonationSessionId" type="hidden" value={session.id} />
        <Button type="submit" variant="secondary">{labels.end}</Button>
      </form>
    </aside>
  );
}
