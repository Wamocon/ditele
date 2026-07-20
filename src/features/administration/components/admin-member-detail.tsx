import Link from "next/link";

import type { Locale } from "@/shared/i18n/config";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";
import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { AdminMemberDetailCopy } from "../admin-member-detail-copy";
import type { AdminMemberDetail } from "../admin-member-detail-model";
import styles from "./admin-member-detail.module.css";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

function lifecycleTone(state: string): BadgeTone {
  if (["active", "accepted", "available", "completed"].includes(state)) {
    return "success";
  }
  if (["approved", "eligible", "invited", "issued", "requested", "waiting"].includes(state)) {
    return "warning";
  }
  if (["archived", "cancelled", "expired", "rejected", "removed", "revoked"].includes(state)) {
    return "danger";
  }
  return "neutral";
}

function DateValue({
  formatter,
  value,
}: {
  readonly formatter: Intl.DateTimeFormat;
  readonly value: string;
}) {
  return <time dateTime={value}>{formatter.format(new Date(value))}</time>;
}

function AttemptSummary({
  accepted,
  active,
  labels,
  total,
}: {
  readonly accepted: number;
  readonly active: number;
  readonly labels: AdminMemberDetailCopy;
  readonly total: number;
}) {
  return (
    <dl className={styles.compactFacts}>
      <div><dt>{labels.attempts}</dt><dd>{total}</dd></div>
      <div><dt>{labels.activeAttempts}</dt><dd>{active}</dd></div>
      <div><dt>{labels.acceptedAttempts}</dt><dd>{accepted}</dd></div>
    </dl>
  );
}

export function AdminMemberDetailView({
  detail,
  labels,
  locale,
}: {
  readonly detail: AdminMemberDetail;
  readonly labels: AdminMemberDetailCopy;
  readonly locale: Locale;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const memberName = detail.profile.displayName ?? labels.displayNameUnavailable;

  return (
    <section aria-labelledby="admin-member-title" className="stack">
      <Link
        className={styles.backLink}
        href={localizedRoute(locale, "/admin/users")}
      >
        ← {labels.back}
      </Link>

      <header className={`page-heading ${styles.heading}`}>
        <div>
          <p className="muted">{labels.title}</p>
          <h1 id="admin-member-title">{memberName}</h1>
          <p className="reading-column">{labels.description}</p>
        </div>
        <div className={styles.badges}>
          <Badge tone={lifecycleTone(detail.membership.state)}>
            {labels.membershipStates[detail.membership.state]}
          </Badge>
          {detail.profile.state ? (
            <Badge tone={lifecycleTone(detail.profile.state)}>
              {labels.profileStates[detail.profile.state]}
            </Badge>
          ) : null}
        </div>
      </header>

      <aside aria-labelledby="admin-member-minimized-title" className={styles.notice}>
        <h2 id="admin-member-minimized-title">{labels.minimizedTitle}</h2>
        <p>{labels.minimizedDescription}</p>
      </aside>

      <section aria-labelledby="admin-member-profile-title" className={`panel stack ${styles.section}`}>
        <h2 id="admin-member-profile-title">{labels.profile}</h2>
        {detail.profile.visible ? (
          <dl className={styles.facts}>
            <div><dt>{labels.displayName}</dt><dd>{memberName}</dd></div>
            <div><dt>{labels.preferredLocale}</dt><dd>{detail.profile.locale?.toUpperCase()}</dd></div>
            <div><dt>{labels.timezone}</dt><dd>{detail.profile.timezone}</dd></div>
            <div>
              <dt>{detail.membership.joinedAt ? labels.joined : labels.invited}</dt>
              <dd>
                <DateValue
                  formatter={dateFormatter}
                  value={detail.membership.joinedAt ?? detail.membership.createdAt}
                />
              </dd>
            </div>
            <div>
              <dt>{labels.validUntil}</dt>
              <dd>
                {detail.membership.validUntil ? (
                  <DateValue formatter={dateFormatter} value={detail.membership.validUntil} />
                ) : labels.noExpiry}
              </dd>
            </div>
          </dl>
        ) : (
          <StatePanel
            description={labels.profileUnavailableDescription}
            title={labels.profileUnavailable}
          />
        )}

        <div className="stack">
          <h3>{labels.roles}</h3>
          {detail.roles.length === 0 ? (
            <p className="muted">{labels.noRoles}</p>
          ) : (
            <ul className={styles.inlineList}>
              {detail.roles.map((role) => (
                <li key={`${role.code}:${role.scope}`}>
                  <Badge>
                    {labels.roleLabel(role.code)} · {role.scope === "cohort" ? labels.cohortScope : labels.organizationScope}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="admin-member-assignments-title" className="stack">
        <header>
          <h2 id="admin-member-assignments-title">{labels.assignments}</h2>
          <p className="muted reading-column">{labels.assignmentsDescription}</p>
        </header>
        {detail.assignments.length === 0 ? (
          <StatePanel description={labels.noAssignments} title={labels.assignments} />
        ) : (
          <ul className={styles.cardGrid}>
            {detail.assignments.map((assignment) => (
              <li key={`${assignment.cohortId}:${assignment.role}:${assignment.assignedAt}`}>
                <article className={`panel stack ${styles.assignmentCard}`}>
                  <header className={styles.cardHeader}>
                    <div>
                      <h3>{assignment.cohortName}</h3>
                      <p className="muted">{labels.assignmentRoles[assignment.role]}</p>
                    </div>
                    <div className={styles.badges}>
                      <Badge tone={lifecycleTone(assignment.cohortState)}>
                        {labels.cohortStates[assignment.cohortState]}
                      </Badge>
                      <Badge tone={lifecycleTone(assignment.membershipState)}>
                        {labels.membershipStates[assignment.membershipState]}
                      </Badge>
                    </div>
                  </header>
                  <dl className={styles.facts}>
                    <div>
                      <dt>{labels.course}</dt>
                      <dd>{assignment.courseTitle}</dd>
                    </div>
                    <div>
                      <dt>{labels.assigned}</dt>
                      <dd><DateValue formatter={dateFormatter} value={assignment.assignedAt} /></dd>
                    </div>
                  </dl>
                  {assignment.courseTitleUsesFallback ? (
                    <p className="muted" role="status">
                      {labels.courseLocaleFallback(assignment.courseTitleLocale)}
                    </p>
                  ) : null}
                  {assignment.role === "learner" ? (
                    <div className="stack">
                      <h4>{labels.progress}</h4>
                      <AttemptSummary
                        accepted={assignment.acceptedAttemptTotal}
                        active={assignment.activeAttemptTotal}
                        labels={labels}
                        total={assignment.attemptTotal}
                      />
                      <p className="muted">
                        {labels.lastActivity}: {assignment.lastActivityAt ? (
                          <DateValue formatter={dateFormatter} value={assignment.lastActivityAt} />
                        ) : labels.noActivity}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <Link
                      className="button button--secondary"
                      href={localizedDynamicRoute(
                        locale,
                        `/admin/groups/${assignment.cohortId}`,
                      )}
                    >
                      {labels.openGroup}
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.hasLearnerContext ? (
        <section aria-labelledby="admin-member-learning-title" className="stack">
          <header>
            <h2 id="admin-member-learning-title">{labels.learnerContext}</h2>
            <p className="muted reading-column">{labels.learnerContextDescription}</p>
          </header>

          <section aria-labelledby="admin-member-progress-title" className={`panel stack ${styles.section}`}>
            <h3 id="admin-member-progress-title">{labels.progress}</h3>
            <AttemptSummary
              accepted={detail.learnerProgress.acceptedAttemptTotal}
              active={detail.learnerProgress.activeAttemptTotal}
              labels={labels}
              total={detail.learnerProgress.attemptTotal}
            />
            <p className="muted">
              {labels.lastActivity}: {detail.learnerProgress.lastActivityAt ? (
                <DateValue formatter={dateFormatter} value={detail.learnerProgress.lastActivityAt} />
              ) : labels.noActivity}
            </p>
          </section>

          <section aria-labelledby="admin-member-enrollments-title" className="stack">
            <h3 id="admin-member-enrollments-title">{labels.enrollments}</h3>
            {detail.enrollments.length === 0 ? (
              <StatePanel description={labels.noEnrollments} title={labels.enrollments} />
            ) : (
              <ul className={styles.cardGrid}>
                {detail.enrollments.map((enrollment) => (
                  <li key={enrollment.id}>
                    <article className={`panel stack ${styles.recordCard}`}>
                      <header className={styles.cardHeader}>
                        <h4>{enrollment.courseTitle}</h4>
                        <Badge tone={lifecycleTone(enrollment.state)}>
                          {labels.enrollmentStates[enrollment.state]}
                        </Badge>
                      </header>
                      {enrollment.courseTitleUsesFallback ? (
                        <p className="muted" role="status">
                          {labels.courseLocaleFallback(enrollment.courseTitleLocale)}
                        </p>
                      ) : null}
                      <dl className={styles.facts}>
                        <div>
                          <dt>{labels.enrollmentUpdated}</dt>
                          <dd><DateValue formatter={dateFormatter} value={enrollment.updatedAt} /></dd>
                        </div>
                        {enrollment.completedAt ? (
                          <div>
                            <dt>{labels.enrollmentCompleted}</dt>
                            <dd><DateValue formatter={dateFormatter} value={enrollment.completedAt} /></dd>
                          </div>
                        ) : null}
                      </dl>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="admin-member-certificates-title" className="stack">
            <h3 id="admin-member-certificates-title">{labels.certificates}</h3>
            {detail.certificates.length === 0 ? (
              <StatePanel description={labels.noCertificates} title={labels.certificates} />
            ) : (
              <ul className={styles.cardGrid}>
                {detail.certificates.map((certificate) => (
                  <li key={certificate.id}>
                    <article className={`panel stack ${styles.recordCard}`}>
                      <header className={styles.cardHeader}>
                        <div>
                          <h4>{certificate.courseTitle ?? labels.certificateCourseUnavailable}</h4>
                          <p className="muted">{labels.certificateTypes[certificate.type]}</p>
                        </div>
                        <Badge tone={lifecycleTone(certificate.state)}>
                          {labels.certificateStates[certificate.state]}
                        </Badge>
                      </header>
                      {certificate.courseTitleUsesFallback && certificate.courseTitleLocale ? (
                        <p className="muted" role="status">
                          {labels.courseLocaleFallback(certificate.courseTitleLocale)}
                        </p>
                      ) : null}
                      <dl className={styles.facts}>
                        <div><dt>{labels.recorded}</dt><dd><DateValue formatter={dateFormatter} value={certificate.recordedAt} /></dd></div>
                        {certificate.issuedAt ? <div><dt>{labels.issued}</dt><dd><DateValue formatter={dateFormatter} value={certificate.issuedAt} /></dd></div> : null}
                        {certificate.availableAt ? <div><dt>{labels.available}</dt><dd><DateValue formatter={dateFormatter} value={certificate.availableAt} /></dd></div> : null}
                        {certificate.expiresAt ? <div><dt>{labels.expires}</dt><dd><DateValue formatter={dateFormatter} value={certificate.expiresAt} /></dd></div> : null}
                        {certificate.revokedAt ? <div><dt>{labels.revoked}</dt><dd><DateValue formatter={dateFormatter} value={certificate.revokedAt} /></dd></div> : null}
                      </dl>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      ) : null}

      <aside aria-labelledby="admin-member-read-only-title" className={styles.readOnlyNotice}>
        <h2 id="admin-member-read-only-title">{labels.readOnlyTitle}</h2>
        <p>{labels.readOnlyDescription}</p>
      </aside>
    </section>
  );
}
