import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { LearnerCertificateRecord } from "../learner-certificate-records";
import styles from "./learner-certificate-list.module.css";

export interface LearnerCertificateListLabels {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  states: Record<LearnerCertificateRecord["state"], string>;
  stateDescriptions: Record<LearnerCertificateRecord["state"], string>;
  types: Record<LearnerCertificateRecord["type"], string>;
  issued: string;
  recorded: string;
  available: string;
  expires: string;
  revoked: string;
  downloadUnavailable: string;
}

function certificateTone(
  state: LearnerCertificateRecord["state"],
): "success" | "neutral" | "warning" | "danger" {
  if (state === "available") return "success";
  if (state === "revoked" || state === "expired") return "danger";
  if (state === "issued") return "warning";
  return "neutral";
}

export function LearnerCertificateList({
  certificates,
  labels,
  formatDate,
}: {
  certificates: readonly LearnerCertificateRecord[];
  labels: LearnerCertificateListLabels;
  formatDate(value: string): string;
}) {
  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
      </header>

      {certificates.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        <ul className={styles.certificateList}>
          {certificates.map((certificate) => (
            <li key={certificate.id}>
              <article className={`panel stack ${styles.certificateCard}`}>
                <header className={styles.cardHeader}>
                  <div className="stack">
                    <p className={styles.type}>
                      {labels.types[certificate.type]}
                    </p>
                    <h2>
                      {certificate.courseTitle ?? labels.types[certificate.type]}
                    </h2>
                  </div>
                  <Badge tone={certificateTone(certificate.state)}>
                    {labels.states[certificate.state]}
                  </Badge>
                </header>

                <p className="muted">
                  {labels.stateDescriptions[certificate.state]}
                </p>

                <dl className={styles.dates}>
                  <div>
                    <dt>{certificate.issuedAt ? labels.issued : labels.recorded}</dt>
                    <dd>
                      <time dateTime={certificate.issuedAt ?? certificate.createdAt}>
                        {formatDate(certificate.issuedAt ?? certificate.createdAt)}
                      </time>
                    </dd>
                  </div>
                  {certificate.availableAt ? (
                    <div>
                      <dt>{labels.available}</dt>
                      <dd>
                        <time dateTime={certificate.availableAt}>
                          {formatDate(certificate.availableAt)}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                  {certificate.expiresAt ? (
                    <div>
                      <dt>{labels.expires}</dt>
                      <dd>
                        <time dateTime={certificate.expiresAt}>
                          {formatDate(certificate.expiresAt)}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                  {certificate.revokedAt ? (
                    <div>
                      <dt>{labels.revoked}</dt>
                      <dd>
                        <time dateTime={certificate.revokedAt}>
                          {formatDate(certificate.revokedAt)}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {certificate.state === "available" ? (
                  <p className={styles.downloadNotice}>
                    {labels.downloadUnavailable}
                  </p>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
