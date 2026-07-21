"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, ErrorState, Select, cn } from "@/shared/ui";
import type { HuntVerdict } from "@/features/arena/model";
import { decideHuntFindingAction } from "@/features/arena/ticket/actions";

/**
 * The trainer's one-click verdict on a reported defect — the half of decision
 * D2 where a human actually decides.
 *
 * **The suggestion is pre-selected, never pre-applied.** The ranked match
 * arrives as the default value of the code picker, so confirming the engine's
 * best guess is a single click; disagreeing is one change to a `<select>`.
 * `06_…` §8: *the matching must never auto-accept — it ranks and annotates*,
 * and *a trainer who disagrees with the match overrides it in one click, and
 * that override is what `hunt_findings.verdict` records.*
 *
 * Every word arrives as a prop. This file is a Client Component, and the review
 * translator is `server-only`.
 */

export interface HuntVerdictLabels {
  legend: string;
  confirm: string;
  bonus: string;
  duplicate: string;
  invalid: string;
  reopen: string;
  matchedCode: string;
  chooseCode: string;
  noCodes: string;
  decided: string;
  verdictConfirmed: string;
  verdictBonus: string;
  verdictDuplicate: string;
  verdictInvalid: string;
  verdictPending: string;
  decoyWarning: string;
}

export interface HuntVerdictsProps {
  locale: string;
  submissionId: string;
  findingId: string;
  expectedVersion: number;
  verdict: HuntVerdict;
  plantedCode: string | null;
  /** Every planted code a trainer may confirm against, best-ranked first. */
  codeOptions: { code: string; decoy: boolean }[];
  /** The engine's top suggestion, pre-selected. Empty when it had none. */
  suggestedCode: string;
  labels: HuntVerdictLabels;
  /** False once the submission is decided — a closed review is read-only. */
  editable: boolean;
}

const VERDICT_TONE = {
  confirmed: "success",
  bonus: "brand",
  duplicate: "neutral",
  invalid: "danger",
  pending: "warning",
} as const;

export function HuntVerdicts({
  locale,
  submissionId,
  findingId,
  expectedVersion,
  verdict,
  plantedCode,
  codeOptions,
  suggestedCode,
  labels,
  editable,
}: HuntVerdictsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState(
    plantedCode ?? suggestedCode ?? codeOptions[0]?.code ?? ""
  );

  const verdictLabel = {
    confirmed: labels.verdictConfirmed,
    bonus: labels.verdictBonus,
    duplicate: labels.verdictDuplicate,
    invalid: labels.verdictInvalid,
    pending: labels.verdictPending,
  }[verdict];

  const selectedIsDecoy = codeOptions.find((o) => o.code === selectedCode)?.decoy ?? false;

  function decide(next: HuntVerdict) {
    setError(null);
    startTransition(async () => {
      const result = await decideHuntFindingAction({
        locale,
        submissionId,
        findingId,
        verdict: next,
        // Only 'confirmed' carries a code. The database enforces this too --
        // sending one with 'bonus' would violate hunt_findings_bonus_has_no_code.
        plantedCode: next === "confirmed" ? selectedCode : null,
        expectedVersion,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // Re-render from the server so the next click carries the NEW row_version.
      // Reusing a stale one does not conflict on this deployment, it hangs
      // (ISSUES.md I-007/I-009), so this refresh is load-bearing.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-md) border border-(--color-border) p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
          {labels.legend}
        </span>
        <Badge tone={VERDICT_TONE[verdict]} dot>
          {verdictLabel}
        </Badge>
        {verdict !== "pending" && plantedCode && (
          <span className="font-mono text-[13px] text-(--color-fg-muted)">{plantedCode}</span>
        )}
      </div>

      {!editable ? (
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{labels.decided}</p>
      ) : (
        <>
          {codeOptions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`code-${findingId}`}
                className="text-[13px] font-semibold leading-5"
              >
                {labels.matchedCode}
              </label>
              <Select
                id={`code-${findingId}`}
                value={selectedCode}
                disabled={isPending}
                onChange={(event) => setSelectedCode(event.target.value)}
              >
                <option value="">{labels.chooseCode}</option>
                {codeOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code}
                  </option>
                ))}
              </Select>
              {/* Confirming a decoy is almost always a mistake -- a decoy is
                  correct behaviour by construction. Warn, do not block: the
                  trainer may genuinely have found the decoy is a real bug, and
                  that is worth knowing. */}
              {selectedIsDecoy && (
                <p className="text-[13px] leading-5 text-(--color-warning)">
                  {labels.decoyWarning}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] leading-5 text-(--color-fg-muted)">{labels.noCodes}</p>
          )}

          {error && <ErrorState message={error} className="text-left" />}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={isPending || selectedCode.length === 0}
              onClick={() => decide("confirmed")}
            >
              {labels.confirm}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => decide("bonus")}
            >
              {labels.bonus}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => decide("duplicate")}
            >
              {labels.duplicate}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => decide("invalid")}
            >
              {labels.invalid}
            </Button>
            {verdict !== "pending" && (
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => decide("pending")}
                className={cn("text-(--color-fg-muted)")}
              >
                {labels.reopen}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
