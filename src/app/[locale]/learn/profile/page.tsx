import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { learnerProfileCopy } from "@/features/identity/profile-copy";
import { LearnerProfileForm } from "@/features/identity/profile-form";
import { readLearnerProfile } from "@/features/identity/profile-server";
import { hasPermission } from "@/shared/auth/authorization";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { updateLearnerProfileAction } from "./actions";

export default async function LearnerProfilePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(locale, `/${locale}/learn/profile`, [
      "learner",
    ]))
  ) {
    return null;
  }

  const labels = learnerProfileCopy[locale];
  const principal = await getPrincipal();
  if (!hasPermission(principal, "profile.read_self")) {
    return (
      <StatePanel
        description={labels.forbidden}
        title={labels.errorTitle}
        tone="danger"
      />
    );
  }
  const profile = await readLearnerProfile(principal);
  const action = updateLearnerProfileAction.bind(null, locale);
  const savedNotice = query.notice === "saved";

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
      </header>
      {savedNotice ? (
        <section aria-live="polite" className="panel stack" role="status">
          <h2>{labels.saved}</h2>
          <p>{labels.savedDescription}</p>
        </section>
      ) : null}
      <LearnerProfileForm
        action={action}
        idempotencyKey={`profile-update:${randomUUID()}`}
        labels={labels}
        profile={profile}
      />
    </div>
  );
}
