"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DefectReport, SavedDraft } from "./model";
import type { Result } from "@/shared/data/result";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosavePayload {
  answerText: string;
  selectedOptionIds: string[];
  usedHintIds: string[];
  defect: DefectReport | null;
  elapsedSeconds: number;
}

export interface UseAutosaveArgs {
  attemptId: string | null;
  /** `attempt_drafts.row_version` as the server rendered it. */
  initialVersion: number;
  initialSavedAt: string | null;
  /** True once the attempt is submitted — nothing may be written any more. */
  readOnly: boolean;
  intervalMs?: number;
  getPayload: () => AutosavePayload;
  save: (input: AutosavePayload & { attemptId: string; expectedDraftVersion: number }) => Promise<
    Result<SavedDraft>
  >;
}

/**
 * Autosave for the task workspace, and the reason a draft survives a reload.
 *
 * 🚨 The one rule this hook exists to enforce: **never send a stale
 * `expectedDraftVersion`.** On this deployment a stale version does not return a
 * conflict — the request hangs, Kong 504s, and the PostgREST connection pool is
 * unusable for about thirty seconds afterwards (ISSUES.md I-009). So every save
 * is chained onto the previous one and the version the server just returned is
 * carried straight into the next call. Two saves are never in flight together.
 */
export function useAutosave({
  attemptId,
  initialVersion,
  initialSavedAt,
  readOnly,
  intervalMs = 20_000,
  getPayload,
  save,
}: UseAutosaveArgs) {
  const [state, setState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialSavedAt);

  const versionRef = useRef(initialVersion);
  const dirtyRef = useRef(false);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  /**
   * `override` exists for the hint cascade: the hint must be recorded before it
   * is revealed, so the save has to carry a value that is deliberately not in
   * component state yet.
   */
  const flush = useCallback(
    (override?: Partial<AutosavePayload>): Promise<Result<SavedDraft> | null> => {
    const next = chainRef.current.then(async (): Promise<Result<SavedDraft> | null> => {
      if (!attemptId || readOnly) return null;

      dirtyRef.current = false;
      setState("saving");

      const payload = { ...getPayload(), ...override };
      const result = await save({
        ...payload,
        attemptId,
        expectedDraftVersion: versionRef.current,
      });

      if (result.ok) {
        versionRef.current = result.data.draftVersion;
        setLastSavedAt(result.data.updatedAt ?? new Date().toISOString());
        setState("saved");
      } else {
        // Keep it dirty so the next tick retries rather than losing the edit.
        dirtyRef.current = true;
        setState("error");
      }
      return result;
    });

    chainRef.current = next.catch(() => undefined);
    return next;
    },
    // getPayload and save are stable useCallbacks in the workspace, so flush is
    // stable too and the interval effect below is not torn down on every render.
    [attemptId, readOnly, getPayload, save]
  );

  const markDirty = useCallback(() => {
    if (readOnly || !attemptId) return;
    dirtyRef.current = true;
    setState("dirty");
  }, [readOnly, attemptId]);

  /** Save only if there is something to save — for blur handlers. */
  const flushIfDirty = useCallback(() => {
    if (dirtyRef.current) void flush();
  }, [flush]);

  useEffect(() => {
    if (readOnly || !attemptId) return;
    const timer = window.setInterval(() => {
      if (dirtyRef.current) void flush();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [readOnly, attemptId, intervalMs, flush]);

  // A closing tab is the most common way a draft is lost. This is best-effort:
  // the browser may cut the request short, which is exactly why the 20s interval
  // exists as well.
  useEffect(() => {
    if (readOnly || !attemptId) return;
    const onHide = () => {
      if (dirtyRef.current) void flush();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [readOnly, attemptId, flush]);

  return { state, lastSavedAt, markDirty, flush, flushIfDirty, hasUnsavedChanges: dirtyRef };
}

/** Seconds the learner has spent on the task, continuing the server's count. */
export function useElapsedSeconds(initialSeconds: number, running: boolean) {
  const ref = useRef(initialSeconds);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      ref.current += 1;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return ref;
}
