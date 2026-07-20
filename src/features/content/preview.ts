import type {
  ContentLocale,
  CourseContentVersion,
  LocalizedText,
} from "./model";

export interface ContentPreview {
  readonly locale: ContentLocale;
  readonly role: "learner" | "trainer" | "admin";
  readonly courseName: string;
  readonly courseDescription: string;
  readonly stages: readonly {
    readonly id: string;
    readonly title: string;
    readonly tasks: readonly { readonly id: string; readonly title: string }[];
  }[];
  readonly fallbackFields: readonly string[];
}

function resolveText(
  value: LocalizedText,
  locale: ContentLocale,
  path: string,
  fallbackFields: string[],
): string {
  if (value[locale].trim()) {
    return value[locale];
  }
  fallbackFields.push(path);
  return value.en || value.de || value.ru;
}

export function buildContentPreview(
  content: CourseContentVersion,
  locale: ContentLocale,
  role: ContentPreview["role"],
): ContentPreview {
  const fallbackFields: string[] = [];
  return {
    locale,
    role,
    courseName: resolveText(content.metadata.name, locale, "metadata.name", fallbackFields),
    courseDescription: resolveText(
      content.metadata.description,
      locale,
      "metadata.description",
      fallbackFields,
    ),
    stages: content.stages.map((stage, stageIndex) => ({
      id: stage.id,
      title: resolveText(stage.title, locale, `stages.${stageIndex}.title`, fallbackFields),
      tasks: stage.tasks.map((task, taskIndex) => ({
        id: task.id,
        title: resolveText(
          task.title,
          locale,
          `stages.${stageIndex}.tasks.${taskIndex}.title`,
          fallbackFields,
        ),
      })),
    })),
    fallbackFields,
  };
}
