import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { LearnerSkillCollection } from "../learner-skill-records";
import styles from "./learner-skills-overview.module.css";

export interface LearnerSkillsOverviewLabels {
  title: string;
  description: string;
  activeSkills: string;
  masteryRecords: string;
  emptyTitle: string;
  emptyDescription: string;
  descriptionUnavailable: string;
  masteryRecorded: string;
  masteryNotRecorded: string;
  masteryScore: string;
  updated: string;
  taxonomyVersion: string;
  prerequisites: string;
  prerequisitesUnavailable: string;
  noVisiblePrerequisites: string;
}

export function LearnerSkillsOverview({
  collection,
  labels,
  formatPercent,
  formatDateTime,
}: {
  collection: LearnerSkillCollection;
  labels: LearnerSkillsOverviewLabels;
  formatPercent(basisPoints: number): string;
  formatDateTime(value: string): string;
}) {
  const recordedMastery = collection.skills.filter(
    (skill) => skill.mastery !== null,
  ).length;

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{labels.title}</h1>
          <p className="muted reading-column">{labels.description}</p>
        </div>
      </header>

      <dl className={styles.summary}>
        <div>
          <dt>{labels.activeSkills}</dt>
          <dd>{collection.skills.length}</dd>
        </div>
        <div>
          <dt>{labels.masteryRecords}</dt>
          <dd>{recordedMastery}</dd>
        </div>
      </dl>

      {collection.skills.length === 0 ? (
        <StatePanel
          description={labels.emptyDescription}
          title={labels.emptyTitle}
        />
      ) : (
        <ul className={styles.skillList}>
          {collection.skills.map((skill) => (
            <li key={skill.id}>
              <article className={`panel stack ${styles.skillCard}`}>
                <header className={styles.cardHeader}>
                  <div className="stack">
                    <p className={styles.code}>{skill.code}</p>
                    <h2>{skill.title}</h2>
                  </div>
                  <Badge tone={skill.mastery ? "success" : "neutral"}>
                    {skill.mastery
                      ? labels.masteryRecorded
                      : labels.masteryNotRecorded}
                  </Badge>
                </header>

                <p className={skill.description ? undefined : "muted"}>
                  {skill.description || labels.descriptionUnavailable}
                </p>

                {skill.mastery ? (
                  <section
                    aria-label={`${skill.title}: ${labels.masteryScore}`}
                    className={styles.mastery}
                  >
                    <div className={styles.masteryHeading}>
                      <span>{labels.masteryScore}</span>
                      <strong>{formatPercent(skill.mastery.basisPoints)}</strong>
                    </div>
                    <progress
                      aria-label={`${labels.masteryScore}: ${formatPercent(skill.mastery.basisPoints)}`}
                      max={10_000}
                      value={skill.mastery.basisPoints}
                    />
                    <p className="muted">
                      {labels.updated}: {" "}
                      <time dateTime={skill.mastery.updatedAt}>
                        {formatDateTime(skill.mastery.updatedAt)}
                      </time>
                    </p>
                  </section>
                ) : (
                  <p className={`muted ${styles.noMastery}`}>
                    {labels.masteryNotRecorded}
                  </p>
                )}

                <div className={styles.metadata}>
                  <p>
                    <span>{labels.taxonomyVersion}</span>
                    <strong>{skill.taxonomyVersion}</strong>
                  </p>
                  <div>
                    <span>{labels.prerequisites}</span>
                    {!collection.prerequisiteRelationshipsVisible ? (
                      <p className="muted">{labels.prerequisitesUnavailable}</p>
                    ) : skill.prerequisites.length === 0 ? (
                      <p className="muted">{labels.noVisiblePrerequisites}</p>
                    ) : (
                      <ul className={styles.prerequisiteList}>
                        {skill.prerequisites.map((prerequisite) => (
                          <li key={prerequisite.id}>{prerequisite.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
