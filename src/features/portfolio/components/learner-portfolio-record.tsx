import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type {
  LearnerPortfolioEvidenceRecord,
  LearnerPortfolioRecord,
  LearnerPortfolioVisibility,
} from "../model/learner-portfolio-record";
import styles from "./learner-portfolio-record.module.css";

export interface LearnerPortfolioRecordLabels {
  title: string;
  description: string;
  portfolioMissingTitle: string;
  portfolioMissingDescription: string;
  evidenceHeading: string;
  evidenceCount: string;
  verifiedCount: string;
  emptyEvidenceTitle: string;
  emptyEvidenceDescription: string;
  visibility: Record<LearnerPortfolioVisibility, string>;
  verification: Record<
    LearnerPortfolioEvidenceRecord["verification"],
    string
  >;
  evidenceKinds: Record<
    Exclude<LearnerPortfolioEvidenceRecord["kind"], null>,
    string
  >;
  evidenceDetailsUnavailable: string;
  reflection: string;
  captured: string;
  updated: string;
}

function verificationTone(
  verification: LearnerPortfolioEvidenceRecord["verification"],
): "success" | "neutral" | "warning" {
  if (verification === "verified") return "success";
  if (verification === "unavailable") return "warning";
  return "neutral";
}

export function LearnerPortfolioRecordView({
  portfolio,
  labels,
  formatDateTime,
}: {
  portfolio: LearnerPortfolioRecord | null;
  labels: LearnerPortfolioRecordLabels;
  formatDateTime(value: string): string;
}) {
  if (!portfolio) {
    return (
      <div className="stack">
        <header className="page-heading">
          <div>
            <h1>{labels.title}</h1>
            <p className="muted reading-column">{labels.description}</p>
          </div>
        </header>
        <StatePanel
          description={labels.portfolioMissingDescription}
          title={labels.portfolioMissingTitle}
        />
      </div>
    );
  }

  const verifiedCount = portfolio.items.filter(
    (item) => item.verification === "verified",
  ).length;

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
      </header>

      <section
        aria-labelledby="learner-portfolio-title"
        className={`panel stack ${styles.portfolioHeader}`}
      >
        <div className={styles.headerTopline}>
          <div>
            <h2 id="learner-portfolio-title">{portfolio.title}</h2>
          </div>
          <Badge>{labels.visibility[portfolio.visibility]}</Badge>
        </div>
        {portfolio.summary ? (
          <p className="reading-column">{portfolio.summary}</p>
        ) : null}
        <p className={`muted ${styles.updated}`}>
          {labels.updated}: {" "}
          <time dateTime={portfolio.updatedAt}>
            {formatDateTime(portfolio.updatedAt)}
          </time>
        </p>
      </section>

      <section aria-labelledby="portfolio-evidence-heading" className="stack">
        <header className={styles.evidenceHeader}>
          <h2 id="portfolio-evidence-heading">{labels.evidenceHeading}</h2>
          <dl className={styles.summary}>
            <div>
              <dt>{labels.evidenceCount}</dt>
              <dd>{portfolio.items.length}</dd>
            </div>
            <div>
              <dt>{labels.verifiedCount}</dt>
              <dd>{verifiedCount}</dd>
            </div>
          </dl>
        </header>

        {portfolio.items.length === 0 ? (
          <StatePanel
            description={labels.emptyEvidenceDescription}
            title={labels.emptyEvidenceTitle}
          />
        ) : (
          <ol className={styles.evidenceList}>
            {portfolio.items.map((item) => (
              <li key={item.id}>
                <article className={`panel stack ${styles.evidenceCard}`}>
                  <header className={styles.itemHeader}>
                    <div className="stack">
                      <p className={styles.kind}>
                        {item.kind
                          ? labels.evidenceKinds[item.kind]
                          : labels.evidenceDetailsUnavailable}
                      </p>
                      <h3>
                        {item.title ?? labels.evidenceDetailsUnavailable}
                      </h3>
                    </div>
                    <Badge tone={verificationTone(item.verification)}>
                      {labels.verification[item.verification]}
                    </Badge>
                  </header>

                  <dl className={styles.itemDetails}>
                    <div>
                      <dt>{labels.captured}</dt>
                      <dd>
                        <time dateTime={item.capturedAt}>
                          {formatDateTime(item.capturedAt)}
                        </time>
                      </dd>
                    </div>
                    {item.reflection ? (
                      <div>
                        <dt>{labels.reflection}</dt>
                        <dd>{item.reflection}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
