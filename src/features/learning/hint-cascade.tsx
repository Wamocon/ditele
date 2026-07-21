"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/shared/ui";
import type { TaskHint } from "./model";
import { format, type LearnStrings } from "./i18n";

/**
 * Progressive hints, revealed one at a time.
 *
 * ⭐ **Usage is recorded before the hint is shown** (WF-2's acceptance
 * criterion). There is no "reveal hint" RPC — `save_attempt_draft` writes the
 * `attempt_hint_usage` row when the hint id appears in `p_used_hint_ids`, so
 * `onReveal` performs that save and the text only appears if it succeeded. A
 * learner who loses their connection mid-reveal does not get a free hint.
 */
export interface HintCascadeProps {
  hints: TaskHint[];
  revealedIds: string[];
  /** Records the hint, then resolves true if it may be shown. */
  onReveal: (hintId: string) => Promise<boolean>;
  disabled: boolean;
  strings: LearnStrings["task"];
}

export function HintCascade({
  hints,
  revealedIds,
  onReveal,
  disabled,
  strings,
}: HintCascadeProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const revealed = new Set(revealedIds);

  if (hints.length === 0) {
    return <p className="text-[13px] leading-5 text-[--color-fg-muted]">{strings.hintNone}</p>;
  }

  // Only the next unrevealed hint is offered — that is what makes it a cascade
  // rather than a list of spoilers.
  const nextIndex = hints.findIndex((hint) => !revealed.has(hint.id));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-5 text-[--color-fg-muted]">{strings.hintsDescription}</p>

      <ol className="flex flex-col gap-2">
        {hints.map((hint, index) => {
          const isRevealed = revealed.has(hint.id);
          const isNext = index === nextIndex;

          if (isRevealed) {
            return (
              <li
                key={hint.id}
                className="animate-fade-in-up rounded-[--radius-md] border border-[--color-warning] bg-[--color-warning-soft] px-4 py-3"
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[--color-warning]">
                  {format(strings.hintRevealed, { number: index + 1 })}
                </p>
                <p className="text-[15px] leading-6">{hint.content}</p>
              </li>
            );
          }

          if (!isNext) return null;

          return (
            <li key={hint.id}>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                loading={pendingId === hint.id}
                disabled={disabled || pendingId !== null}
                iconLeft={<Lightbulb className="size-4" aria-hidden />}
                onClick={async () => {
                  setPendingId(hint.id);
                  await onReveal(hint.id);
                  setPendingId(null);
                }}
              >
                {format(strings.hintReveal, { number: index + 1 })}
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
