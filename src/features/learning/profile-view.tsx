"use client";

import { Award, Sparkles, UserRound } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Card, EmptyState } from "@/shared/ui";
import type { StudentProfile } from "@/shared/data/learning";
import { BadgeGrid } from "./badge-grid";

export function ProfileView({ locale, profile }: { locale: string; profile: StudentProfile }) {
  return (
    <>
      <PageHeader title="Profil" description="Deine XP, Badges und dein Feedback." locale={locale} />

      <div className="flex flex-col gap-8">
        <Card className="flex flex-wrap items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-supplied avatar
            <img src={profile.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand)">
              <UserRound className="size-8" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[20px] font-semibold">{profile.displayName || "Lernende:r"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-[14px] text-(--color-fg-muted)">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-4 text-(--color-brand)" aria-hidden />
                <strong className="font-semibold text-(--color-fg) tabular-nums">{profile.totalXp}</strong> XP
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Award className="size-4 text-(--color-brand)" aria-hidden />
                <strong className="font-semibold text-(--color-fg) tabular-nums">{profile.badges.length}</strong> Badges
              </span>
            </div>
          </div>
        </Card>

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Badges</h2>
          {profile.badges.length > 0 ? (
            <BadgeGrid badges={profile.badges} />
          ) : (
            <EmptyState
              title="Noch keine Badges"
              description="Löse Arena-Aufgaben, um XP zu sammeln und Badges zu verdienen."
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Mein Feedback</h2>
          {profile.feedback.length > 0 ? (
            <ul className="flex list-none flex-col gap-2 p-0">
              {profile.feedback.map((item, index) => (
                <li key={`${item.taskTitle}-${index}`}>
                  <Card className="flex items-center gap-3">
                    <span className="text-[28px]" aria-hidden>
                      {item.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{item.taskTitle}</p>
                      {item.courseTitle && (
                        <p className="text-[13px] text-(--color-fg-muted)">{item.courseTitle}</p>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Noch kein Feedback"
              description="Nach dem Einreichen einer Kursaufgabe kannst du ein Emoji als Feedback geben."
            />
          )}
        </section>
      </div>
    </>
  );
}
