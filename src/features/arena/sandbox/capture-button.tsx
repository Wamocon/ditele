"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/shared/ui";
import {
  SANDBOX_REGION_ATTRIBUTE,
  captureFileName,
  captureRegion,
  type CaptureFailure,
} from "./capture";
import type { ArenaSandboxStrings } from "./i18n";

/**
 * The capture-region control.
 *
 * ⭐ **WS-10: this is the seam.** Mount this component in the top-level
 * document beside the defect form, pass `onCapture`, and you receive a PNG
 * `Blob` plus a file name ready for `evidence_uploads`. It finds the sandbox by
 * its `data-arena-sandbox-region` attribute, so it works whether the sandbox is
 * on this page or in a same-origin frame on it — nothing needs threading
 * through.
 *
 * Without `onCapture` it stands alone: it shows the shot and offers a download,
 * which is what the sandbox route does today, before the upload path exists.
 * That way the capture is testable now rather than only after WS-10 lands.
 */

export interface SandboxCaptureButtonProps {
  strings: ArenaSandboxStrings;
  scenarioCode: string;
  /** WS-10 hands the blob to the upload flow. Omit for download-only. */
  onCapture?: (capture: { blob: Blob; fileName: string }) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ready"; url: string; fileName: string }
  | { kind: "error"; reason: CaptureFailure };

export function SandboxCaptureButton({
  strings,
  scenarioCode,
  onCapture,
}: SandboxCaptureButtonProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // An object URL that outlives its preview is a leak that only shows up on a
  // long session — exactly the session a hunt is.
  useEffect(() => {
    if (status.kind !== "ready") return;
    const url = status.url;
    return () => URL.revokeObjectURL(url);
  }, [status]);

  const run = useCallback(async () => {
    setStatus({ kind: "running" });
    const region = document.querySelector(`[${SANDBOX_REGION_ATTRIBUTE}]`);
    const result = await captureRegion(region);
    if (!result.ok) {
      setStatus({ kind: "error", reason: result.reason });
      return;
    }
    const fileName = captureFileName(scenarioCode, new Date().toISOString());
    onCapture?.({ blob: result.blob, fileName });
    setStatus({ kind: "ready", url: URL.createObjectURL(result.blob), fileName });
  }, [onCapture, scenarioCode]);

  const errorLabel: Record<CaptureFailure, string> = {
    unsupported: strings.captureUnsupportedLabel,
    denied: strings.captureDeniedLabel,
    failed: strings.captureFailedLabel,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={status.kind === "running"}
          iconLeft={<Camera className="size-4" aria-hidden />}
          onClick={() => void run()}
        >
          {status.kind === "running" ? strings.captureRunningLabel : strings.captureLabel}
        </Button>
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{strings.captureHint}</p>
      </div>

      {status.kind === "error" && (
        <p role="alert" className="text-[13px] leading-5 text-(--color-danger)">
          {errorLabel[status.reason]}
        </p>
      )}

      {status.kind === "ready" && (
        <div className="flex flex-wrap items-center gap-3 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- an object
              URL for a blob the browser just made; next/image would need a
              loader and a remote pattern for something that never leaves the
              tab. */}
          <img
            src={status.url}
            alt={strings.capturePreviewAlt}
            className="h-20 w-auto max-w-40 rounded-(--radius-sm) border border-(--color-border)"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-[13px] leading-5 text-(--color-success)">
              {strings.captureReadyLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={status.url}
                download={status.fileName}
                className="inline-flex h-11 min-h-11 items-center rounded-(--radius-sm) border border-(--color-border-strong) px-3 text-[13px] font-semibold lg:h-9 lg:min-h-9"
              >
                {strings.captureDownloadLabel}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStatus({ kind: "idle" })}
              >
                {strings.captureDiscardLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
