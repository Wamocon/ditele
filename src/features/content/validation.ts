import type {
  ContentLocale,
  ContentValidationIssue,
  CourseContentVersion,
  LocalizedText,
} from "./model";

function translationIssues(
  value: LocalizedText,
  path: string,
  requiredLocales: readonly ContentLocale[],
): readonly ContentValidationIssue[] {
  return requiredLocales.flatMap((locale) => value[locale].trim().length === 0
    ? [{
        code: "missing_translation" as const,
        path: `${path}.${locale}`,
        locale,
        message: `A ${locale.toUpperCase()} translation is required.`,
      }]
    : []);
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validateContentVersion(
  content: CourseContentVersion,
  requiredLocales: readonly ContentLocale[],
): readonly ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [
    ...translationIssues(content.metadata.name, "metadata.name", requiredLocales),
    ...translationIssues(content.metadata.description, "metadata.description", requiredLocales),
  ];

  if (content.stages.length === 0) {
    issues.push({ code: "missing_stage", path: "stages", message: "At least one stage is required." });
  }

  const readyMediaIds = new Set(
    content.media.filter((media) => media.status === "ready").map((media) => media.id),
  );
  content.media.forEach((media, index) => {
    if (media.status !== "ready") {
      issues.push({
        code: "media_not_ready",
        path: `media.${index}`,
        message: `Media ${media.fileName} is not ready for publishing.`,
      });
    }
  });

  content.stages.forEach((stage, stageIndex) => {
    issues.push(...translationIssues(stage.title, `stages.${stageIndex}.title`, requiredLocales));
    if (stage.position !== stageIndex + 1) {
      issues.push({
        code: "invalid_position",
        path: `stages.${stageIndex}.position`,
        message: "Stage positions must be continuous and one-based.",
      });
    }
    if (stage.tasks.length === 0) {
      issues.push({
        code: "missing_task",
        path: `stages.${stageIndex}.tasks`,
        message: "Every stage must contain at least one task.",
      });
    }

    stage.tasks.forEach((task, taskIndex) => {
      const taskPath = `stages.${stageIndex}.tasks.${taskIndex}`;
      issues.push(
        ...translationIssues(task.title, `${taskPath}.title`, requiredLocales),
        ...translationIssues(task.description, `${taskPath}.description`, requiredLocales),
        ...translationIssues(task.expectedAnswer, `${taskPath}.expectedAnswer`, requiredLocales),
      );
      if (task.position !== taskIndex + 1) {
        issues.push({
          code: "invalid_position",
          path: `${taskPath}.position`,
          message: "Task positions must be continuous and one-based.",
        });
      }
      const mediaIds = [...task.beforeMediaIds, ...task.afterMediaIds];
      if (mediaIds.some((mediaId) => !readyMediaIds.has(mediaId))) {
        issues.push({
          code: "media_not_ready",
          path: `${taskPath}.media`,
          message: "Every referenced task media item must exist and be ready.",
        });
      }
      if (hasDuplicate(task.skillIds) || hasDuplicate(task.prerequisiteTaskIds)) {
        issues.push({
          code: "duplicate_reference",
          path: taskPath,
          message: "Skill and prerequisite mappings cannot contain duplicates.",
        });
      }
      if (task.test) {
        issues.push(...translationIssues(task.test.question, `${taskPath}.test.question`, requiredLocales));
        const correctAnswers = task.test.answers.filter((answer) => answer.isCorrect);
        if (task.test.answers.length < 2 || correctAnswers.length === 0) {
          issues.push({
            code: "invalid_test",
            path: `${taskPath}.test.answers`,
            message: "A test needs at least two answers and one correct answer.",
          });
        }
        task.test.answers.forEach((answer, answerIndex) => {
          issues.push(...translationIssues(
            answer.label,
            `${taskPath}.test.answers.${answerIndex}.label`,
            requiredLocales,
          ));
        });
      }
    });
  });

  return issues;
}
