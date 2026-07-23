"use client";

import Link from "next/link";
import type { Route } from "next";
import { Award, Bug, ChevronRight, Lock, Sparkles } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Badge, Card, EmptyState } from "@/shared/ui";
import type { ArenaListItem, ArenaOverview } from "@/shared/data/learning";
import { TaskStatusBadge } from "./labels";
import { BadgeGrid } from "./badge-grid";

export function ArenaView({ locale, data }: { locale: string; data: ArenaOverview }) {
  const { tasks, totalXp, badges } = data;

  return (
    <>
      <PageHeader
        title="Arena"
        description="Finde die Fehler in den HTML-Fenstern und schreibe Fehlerberichte. Jede angenommene Aufgabe bringt XP."
        locale={locale}
      />

      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-4">
          <Card className="flex flex-col gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand)">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <span className="text-[28px] font-semibold leading-none tabular-nums">{totalXp}</span>
            <span className="text-[13px] text-(--color-fg-muted)">Gesammelte XP</span>
          </Card>
          <Card className="flex flex-col gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand)">
              <Award className="size-5" aria-hidden />
            </span>
            <span className="text-[28px] font-semibold leading-none tabular-nums">{badges.length}</span>
            <span className="text-[13px] text-(--color-fg-muted)">Badges</span>
          </Card>
        </div>

        {badges.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[18px] font-semibold">Meine Badges</h2>
            <BadgeGrid badges={badges} />
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-[18px] font-semibold">
            <Bug className="size-5 text-(--color-brand)" aria-hidden />
            Jagden
          </h2>
          {tasks.length === 0 ? (
            <EmptyState title="Keine Arena-Aufgaben" description="Derzeit sind keine Arena-Aufgaben verfügbar." />
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {tasks.map((task) => (
                <li key={task.id}>
                  <ArenaRow locale={locale} task={task} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ArenaRow({ locale, task }: { locale: string; task: ArenaListItem }) {
  const inner = (
    <Card interactive={task.unlocked} className="flex items-center gap-3" aria-disabled={!task.unlocked}>
      <span
        className={
          task.unlocked
            ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-[14px] font-semibold text-(--color-brand) tabular-nums"
            : "flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-surface-2) text-(--color-fg-subtle)"
        }
      >
        {task.unlocked ? task.orderIndex : <Lock className="size-4" aria-hidden />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={task.unlocked ? "text-[15px] font-semibold" : "text-[15px] font-semibold text-(--color-fg-muted)"}>
          {task.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-(--color-brand)">+{task.xpReward} XP</span>
          {task.rewardBadge && (
            <Badge tone="brand">
              <Award className="size-3" aria-hidden />
              {task.rewardBadge.name}
            </Badge>
          )}
          {!task.unlocked && (
            <span className="text-[13px] text-(--color-fg-muted)">
              Zuerst die vorherige Arena-Aufgabe abschließen.
            </span>
          )}
        </div>
      </div>

      <TaskStatusBadge state={task.submissionState} />
      {task.unlocked && <ChevronRight className="size-5 shrink-0 text-(--color-fg-subtle)" aria-hidden />}
    </Card>
  );

  if (!task.unlocked) return inner;
  return (
    <Link href={`/${locale}/learn/arena/${task.id}` as Route} className="block">
      {inner}
    </Link>
  );
}
