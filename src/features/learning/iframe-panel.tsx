"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { Button, Card, cn } from "@/shared/ui";
import type { LearnStrings } from "./i18n";

/**
 * ⭐ The practice target — the component the whole product exists for
 * (MASTER_PLAN §8.3).
 *
 * Built here rather than in `src/shared/ui/` because WS-0 had not delivered it
 * from Wave 0b when WS-2 needed it; 02_WORKSTREAMS §7 says to build it locally
 * and let WS-7 promote it. **Do not add a second copy** — check here first.
 *
 * Deliberate choices:
 *  - Below `md` it does **not** embed. A 375px-wide iframe of a desktop web app
 *    is unusable, and pretending otherwise teaches students to distrust the
 *    tool. They get a real "open in a tab" affordance instead.
 *  - `referrerPolicy="no-referrer"` and a restrictive sandbox: the target is
 *    third-party and must never see a DiTeLe URL or reach our session.
 *  - A 10s timeout counts as an error. `<iframe>` fires no error event when a
 *    site refuses to be framed, so a timer is the only honest signal available.
 */

const MIN_HEIGHT = 400;
const DEFAULT_HEIGHT = 560;
const LOAD_TIMEOUT_MS = 10_000;
const STORAGE_KEY = "ditele.learning.iframe-height";

/** `md` (768px) — the breakpoint at which embedding starts being useful. */
function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia("(min-width: 768px)").matches,
    // The server cannot know the viewport. Rendering the mobile fallback first
    // is the safe default: it never loads a frame the user did not ask for.
    () => false
  );
}

export interface IframePanelProps {
  src: string;
  strings: LearnStrings["task"];
}

export function IframePanel({ src, strings }: IframePanelProps) {
  const isDesktop = useIsDesktop();
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(DEFAULT_HEIGHT);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * The height is deliberately **not** React state. It changes on every pointer
   * move while dragging, and re-rendering an iframe's ancestor sixty times a
   * second reloads nothing but does waste a frame each time. Writing the style
   * directly is what the "effects synchronise with external systems" rule is
   * for, and it also keeps the server render free of a value only the browser
   * knows — no hydration mismatch.
   */
  const applyHeight = useCallback((next: number) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(next, Math.round(window.innerHeight * 0.9)));
    heightRef.current = clamped;
    if (frameRef.current) frameRef.current.style.height = `${clamped}px`;
    return clamped;
  }, []);

  // Restore the height the learner last dragged to.
  useEffect(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    applyHeight(Number.isFinite(stored) && stored >= MIN_HEIGHT ? stored : DEFAULT_HEIGHT);
  }, [applyHeight, isDesktop]);

  // A frame that refuses embedding never fires `onerror`. Time it out instead.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("error"), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status, reloadKey]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Apply and remember — used when the drag ends and by the keyboard handler. */
  const commitHeight = useCallback(
    (next: number) => {
      window.localStorage.setItem(STORAGE_KEY, String(applyHeight(next)));
    },
    [applyHeight]
  );

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = heightRef.current;
      const onMove = (move: PointerEvent) => applyHeight(startHeight + (move.clientY - startY));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        // Persist once, at the end of the gesture, not on every pixel.
        window.localStorage.setItem(STORAGE_KEY, String(heightRef.current));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyHeight]
  );

  const toggleFullscreen = useCallback(async () => {
    const element = containerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by policy. The fixed-inset fallback below
      // keeps the control meaningful either way.
      setIsFullscreen((current) => !current);
    }
  }, []);

  const reload = useCallback(() => {
    setStatus("loading");
    setReloadKey((key) => key + 1);
  }, []);

  const openInTab = (
    <Button
      variant="outline"
      size="sm"
      iconLeft={<ExternalLink className="size-4" aria-hidden />}
      onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
    >
      {strings.targetNewTab}
    </Button>
  );

  // ── Mobile: an honest card, not a 375px-wide desktop app ────────────────
  if (!isDesktop) {
    return (
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-[18px] font-semibold leading-6">{strings.targetMobileTitle}</h3>
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">
            {strings.targetMobileDescription}
          </p>
        </div>
        <Button
          fullWidth
          iconLeft={<ExternalLink className="size-4" aria-hidden />}
          onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
        >
          {strings.targetOpen}
        </Button>
      </Card>
    );
  }

  // ── Desktop: the real thing ─────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-0"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) bg-(--color-bg) px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
          {strings.targetTitle}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<RotateCw className="size-4" aria-hidden />}
            onClick={reload}
          >
            {strings.targetReload}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={
              isFullscreen ? (
                <Minimize2 className="size-4" aria-hidden />
              ) : (
                <Maximize2 className="size-4" aria-hidden />
              )
            }
            onClick={toggleFullscreen}
          >
            {isFullscreen ? strings.targetExitFullscreen : strings.targetFullscreen}
          </Button>
          {openInTab}
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<RotateCcw className="size-4" aria-hidden />}
            onClick={() => commitHeight(DEFAULT_HEIGHT)}
          >
            {strings.targetReset}
          </Button>
        </div>
      </div>

      <div
        ref={frameRef}
        className={cn("relative bg-(--color-bg)", isFullscreen && "flex-1")}
        style={{ height: DEFAULT_HEIGHT }}
      >
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-[18px] font-semibold leading-6">{strings.targetErrorTitle}</p>
            <p className="max-w-prose text-[13px] leading-5 text-(--color-fg-muted)">
              {strings.targetErrorDescription}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={reload}>
                {strings.targetReload}
              </Button>
              {openInTab}
            </div>
          </div>
        ) : (
          <>
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-(--color-surface)">
                <span
                  className="size-4 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
                  aria-hidden
                />
                <p className="text-[13px] text-(--color-fg-muted)">{strings.targetLoading}</p>
              </div>
            )}
            <iframe
              key={reloadKey}
              src={src}
              title={strings.targetTitle}
              className="size-full border-0"
              referrerPolicy="no-referrer"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
              onLoad={() => setStatus("ready")}
              onError={() => setStatus("error")}
            />
          </>
        )}
      </div>

      {!isFullscreen && (
        <div
          role="separator"
          aria-label={strings.targetResize}
          aria-orientation="horizontal"
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") commitHeight(heightRef.current + 40);
            if (event.key === "ArrowUp") commitHeight(heightRef.current - 40);
          }}
          className="group flex h-4 shrink-0 cursor-ns-resize items-center justify-center border-t border-(--color-border) bg-(--color-bg)"
        >
          <span className="h-1 w-10 rounded-full bg-(--color-border-strong) transition-colors group-hover:bg-(--color-brand)" />
        </div>
      )}
    </div>
  );
}
