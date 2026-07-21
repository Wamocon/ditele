import type { ReactNode } from "react";
import { Badge, DataTable, EmptyState, type Column } from "@/shared/ui";
import type { ProgressRow, RiskSignal } from "@/shared/data/progress";
import type { AdminDict } from "./i18n";
import { fill } from "./i18n";

/**
 * WS-12 — the oversight board. `05_…` §G10.
 *
 * The row the design asks for, in one line:
 *
 *   Student · Kurs · Tag 23 · 8/24 Aufgaben · Level 5 · 🔥12 · 2 offene Jagden
 *   · zuletzt aktiv vor 6 Tagen · [Trainer benachrichtigen]
 *
 * ⭐ **Sorted by risk, not alphabetically.** The order arrives already correct
 * from `list_progress_board` and this component does not re-sort. That is
 * deliberate: the sort is part of the meaning, and a second sort implemented in
 * TypeScript is a second definition of "risk" waiting to drift from the one in
 * SQL. An admin reads this top-down and should be able to stop reading when the
 * badges run out.
 *
 * **Nothing here ranks learners against each other.** Decision D4 defers the
 * leaderboard, and §6 of the design explains why absolute XP is the wrong axis
 * when start dates differ by months: the person who enrolled in January would
 * win forever. Risk is a property of one learner against their own plan.
 */

/* ── Risk presentation ──────────────────────────────────────────────────── */

/**
 * Tone per signal — and the label always carries the meaning too. Status is
 * never communicated by colour alone, so each badge renders its German name and
 * the legend below the table explains the threshold.
 */
const RISK_TONE: Record<RiskSignal, "danger" | "warning" | "info"> = {
  stalled: "danger",
  stuck: "warning",
  behind: "info",
};

function riskLabel(dict: AdminDict, signal: RiskSignal): string {
  const p = dict.progress;
  if (signal === "stalled") return p.riskStalled;
  if (signal === "stuck") return p.riskStuck;
  return p.riskBehind;
}

/* ── Relative time ──────────────────────────────────────────────────────── */

/**
 * "vor 6 Tagen" in whole days.
 *
 * ⚠️ Computed from calendar-day difference, not from `Math.floor(ms / 86400000)`.
 * The elapsed-milliseconds version says "vor 0 Tagen" for something that
 * happened last night, which reads as "just now" for activity that is nearly a
 * day old — and this column is the evidence behind the `stalled` badge, so it
 * has to agree with a human's idea of a day.
 */
function daysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function lastActiveLabel(dict: AdminDict, iso: string | null, now: Date): string {
  const p = dict.progress;
  if (!iso) return p.lastActiveNever;
  const days = daysAgo(iso, now);
  if (days === 0) return p.lastActiveToday;
  if (days === 1) return p.lastActiveYesterday;
  return fill(p.lastActiveDays, { days });
}

/* ── Cells ──────────────────────────────────────────────────────────────── */

function Stacked({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{main}</span>
      {sub && <span className="text-[13px] leading-4 text-(--color-fg-muted)">{sub}</span>}
    </div>
  );
}

export interface ProgressTableProps {
  rows: ProgressRow[];
  dict: AdminDict;
  /** Injected so the table stays a pure render — and so a test can pin "now". */
  now: Date;
  /** The flag-to-trainer control, per row. Rendered by the route. */
  renderAction?: (row: ProgressRow) => ReactNode;
  /** Shown when `rows` is empty because a filter excluded everyone. */
  filtered?: boolean;
}

export function ProgressTable({ rows, dict, now, renderAction, filtered }: ProgressTableProps) {
  const p = dict.progress;

  const columns: Column<ProgressRow>[] = [
    {
      key: "learner",
      header: p.colLearner,
      cell: (row) => (
        <Stacked
          main={row.learnerName || dict.common.unknownUser}
          sub={row.courseTitle || dict.common.none}
        />
      ),
    },
    {
      key: "day",
      header: p.colDay,
      numeric: true,
      // Plan-relative, always. Two learners three weeks apart each see their
      // own day N here, which is the entire point of `06_…` §8 item 5.
      cell: (row) => fill(p.dayValue, { day: row.dayIndex }),
    },
    {
      key: "tasks",
      header: p.colTasks,
      numeric: true,
      cell: (row) => (
        <Stacked
          main={fill(p.tasksValue, { done: row.tasksDone, total: row.tasksTotal })}
          sub={fill(p.tasksExpected, { expected: row.tasksExpected })}
        />
      ),
    },
    {
      key: "level",
      header: p.colLevel,
      numeric: true,
      cell: (row) => (
        <Stacked
          main={fill(p.levelValue, { level: row.level })}
          sub={fill(p.xpValue, { xp: row.totalXp })}
        />
      ),
    },
    {
      key: "streak",
      header: p.colStreak,
      numeric: true,
      cell: (row) =>
        row.streakCurrent > 0 ? fill(p.streakValue, { days: row.streakCurrent }) : p.streakNone,
    },
    {
      key: "hunts",
      header: p.colHunts,
      numeric: true,
      cell: (row) => (
        <Stacked
          main={row.openHunts > 0 ? fill(p.huntsValue, { open: row.openHunts }) : p.huntsNone}
          sub={
            row.pendingFindings > 0
              ? fill(p.findingsPending, { count: row.pendingFindings })
              : undefined
          }
        />
      ),
    },
    {
      key: "lastActive",
      header: p.colLastActive,
      cell: (row) => lastActiveLabel(dict, row.lastActivityAt, now),
    },
    {
      key: "risk",
      header: p.colRisk,
      cell: (row) =>
        row.risks.length === 0 ? (
          <span className="text-[13px] text-(--color-fg-muted)">{p.riskNone}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.risks.map((signal) => (
              <Badge key={signal} tone={RISK_TONE[signal]} dot>
                {riskLabel(dict, signal)}
              </Badge>
            ))}
          </div>
        ),
    },
  ];

  if (renderAction) {
    columns.push({
      key: "actions",
      header: p.colActions,
      cell: (row) => renderAction(row),
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.enrollmentId}
      caption={p.title}
      stickyHeader
      emptyState={
        <EmptyState
          title={filtered ? p.emptyFilteredTitle : p.emptyTitle}
          description={filtered ? p.emptyFilteredText : p.emptyText}
        />
      }
    />
  );
}

/* ── Legend ─────────────────────────────────────────────────────────────── */

/**
 * A badge nobody can define is a badge nobody acts on. Each threshold is
 * spelled out, including the one that matters most: `stuck` is described as a
 * problem with the *task*, because `05_…` §G10 is explicit that the same hunt
 * failing three times is a teaching problem, not a student problem — and an
 * admin who reads it the other way will go and chase the wrong person.
 */
export function ProgressLegend({ dict }: { dict: AdminDict }) {
  const p = dict.progress;
  return (
    <section className="mt-6 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4">
      <h2 className="text-[13px] font-semibold leading-4 text-(--color-fg-muted)">
        {p.legendTitle}
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-5 text-(--color-fg-muted)">
        <li className="flex flex-wrap items-center gap-2">
          <Badge tone={RISK_TONE.stalled} dot>
            {p.riskStalled}
          </Badge>
          <span>{p.legendStalled}</span>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <Badge tone={RISK_TONE.behind} dot>
            {p.riskBehind}
          </Badge>
          <span>{p.legendBehind}</span>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <Badge tone={RISK_TONE.stuck} dot>
            {p.riskStuck}
          </Badge>
          <span>{p.legendStuck}</span>
        </li>
      </ul>
      <p className="mt-3 border-t border-(--color-border) pt-3 text-[13px] leading-5 text-(--color-fg-muted)">
        {p.planNote}
      </p>
    </section>
  );
}
