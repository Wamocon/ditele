import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { MasterySnapshot, NextLearningAction, Skill } from "../model";

export interface SkillPathOverviewLabels {
  title: string;
  unavailableTitle: string;
  unavailableDescription: string;
  nextAction: string;
  blocked: string;
  mastery: Record<MasterySnapshot["level"], string>;
  score(value: number): string;
  duration(minutes: number): string;
}

export function SkillPathOverview({
  skills,
  mastery,
  nextAction,
  available,
  labels,
}: {
  skills: readonly Skill[];
  mastery: readonly MasterySnapshot[];
  nextAction?: NextLearningAction;
  available: boolean;
  labels: SkillPathOverviewLabels;
}) {
  if (!available) {
    return (
      <StatePanel
        description={labels.unavailableDescription}
        title={labels.unavailableTitle}
      />
    );
  }
  const masteryBySkill = new Map(mastery.map((item) => [item.skillId, item]));
  return (
    <section aria-labelledby="skill-path-title" className="stack">
      <h2 id="skill-path-title">{labels.title}</h2>
      {nextAction ? (
        <article className="panel stack">
          <p className="muted">{labels.nextAction}</p>
          <h3>{skills.find((skill) => skill.id === nextAction.skillId)?.title ?? nextAction.skillId}</h3>
          <p>{labels.duration(nextAction.estimatedMinutes)}</p>
          {nextAction.blockedBy.length > 0 ? <Badge tone="warning">{labels.blocked}</Badge> : null}
        </article>
      ) : null}
      <ul className="stack">
        {skills.map((skill) => {
          const snapshot = masteryBySkill.get(skill.id);
          return (
            <li className="panel cluster" key={skill.id}>
              <span>{skill.title}</span>
              <Badge tone={snapshot?.level === "mastered" ? "success" : "neutral"}>
                {snapshot ? labels.mastery[snapshot.level] : labels.mastery.not_started}
              </Badge>
              <span>{labels.score(snapshot?.score ?? 0)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
