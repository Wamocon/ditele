"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Button, Card, Field, Input, Textarea } from "@/shared/ui";
import type { Course, CourseInput } from "@/shared/data/admin";
import { createCourseAction, updateCourseAction } from "@/shared/data/admin-actions";

import { FormMessage } from "./form-message";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Create + edit form for a course. On create it redirects to the new course's
 * edit page (where its tasks are managed); on edit it saves in place.
 */
export function CourseForm({ locale, course }: { locale: string; course?: Course }) {
  const editing = Boolean(course);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [title, setTitle] = useState(course?.title ?? "");
  const [slug, setSlug] = useState(course?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  const [description, setDescription] = useState(course?.description ?? "");
  const [cover, setCover] = useState(course?.cover_image_url ?? "");
  const [intro, setIntro] = useState(course?.intro_video_url ?? "");
  const [completion, setCompletion] = useState(course?.completion_video_url ?? "");

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const input: CourseInput = {
      slug,
      title,
      description,
      cover_image_url: cover,
      intro_video_url: intro,
      completion_video_url: completion,
    };
    startTransition(async () => {
      const result = editing
        ? await updateCourseAction(course!.id, input, locale)
        : await createCourseAction(input, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing) {
        setSaved(true);
        router.refresh();
      } else if (result.id) {
        router.push(`/${locale}/admin/courses/${result.id}` as Route);
      }
    });
  }

  return (
    <Card as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Titel" required>
        <Input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="Praxiskurs Softwaretester" />
      </Field>

      <Field label="Slug (URL-Name)" required hint="Nur Kleinbuchstaben, Zahlen und Bindestriche.">
        <Input
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="praxiskurs-softwaretester"
        />
      </Field>

      <Field label="Beschreibung">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </Field>

      <Field label="Titelbild-URL">
        <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
      </Field>

      <Field label="Intro-Video-URL" hint="Wird beim Kursstart abgespielt.">
        <Input value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="https://…" />
      </Field>

      <Field label="Abschluss-Video-URL" hint="Wird nach Abschluss des Kurses abgespielt.">
        <Input value={completion} onChange={(e) => setCompletion(e.target.value)} placeholder="https://…" />
      </Field>

      {error && <FormMessage tone="error">{error}</FormMessage>}
      {saved && <FormMessage tone="success">Änderungen gespeichert.</FormMessage>}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {editing ? "Speichern" : "Kurs erstellen"}
        </Button>
        {editing && (
          <span className="text-[13px] text-(--color-fg-muted)">
            Neue Kurse sind sofort aktiv.
          </span>
        )}
      </div>
    </Card>
  );
}
