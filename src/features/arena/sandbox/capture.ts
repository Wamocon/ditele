/**
 * Capture-region — the screenshot half of the sandbox (06_… §8 WS-9 item 5).
 *
 * ⭐ **Why this can exist at all:** decision D1 put the sandbox in our own app,
 * same-origin. A cross-origin frame — the OpenCart shop that was briefly the
 * plan — cannot be read from JavaScript at any price, so auto-capture would
 * have been impossible. Nothing in the sandbox tree may ever load its content
 * from another origin; that is not a preference, it is the precondition for
 * this file.
 *
 * ⚠️ **No new npm dependencies, ever.** That rules out the html2canvas family,
 * which is the usual answer. So the capture is the browser's own
 * `getDisplayMedia`: one user gesture, one frame, cropped to the sandbox's
 * rectangle with a canvas. It costs a permission prompt, which is a real cost —
 * but a hand-rolled DOM-to-image serialiser would render the sandbox *slightly*
 * wrong, and a screenshot that does not match what the learner saw is worse
 * than no screenshot in a workstream whose whole premise is visual fidelity.
 *
 * ⚠️ **Where this runs matters.** `getDisplayMedia` inside an `<iframe>` needs
 * `allow="display-capture"` on that frame. `features/learning/iframe-panel.tsx`
 * does not set it and is not WS-9's file to edit (ISSUES.md I-044) — so the
 * capture is initiated by the **top-level document**. In the standalone
 * sandbox tab that is the sandbox itself; when the sandbox is framed by the
 * task workspace it is WS-10's page, which is also the page holding the defect
 * form the image is going to. Same-origin means WS-10 can measure the region
 * itself, and `publishRegion` posts it anyway so it does not have to.
 */

/** Marks the element a capture is cropped to. */
export const SANDBOX_REGION_ATTRIBUTE = "data-arena-sandbox-region";

/** The `postMessage` type WS-10 listens for. Versioned by name, not a field. */
export const SANDBOX_REGION_MESSAGE = "ditele.arena.sandbox.region";

export interface SandboxRegion {
  /** Viewport coordinates, CSS pixels — what `getBoundingClientRect` returns. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SandboxRegionMessage {
  type: typeof SANDBOX_REGION_MESSAGE;
  region: SandboxRegion;
}

function regionOf(element: Element): SandboxRegion {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/**
 * Publish the sandbox's rectangle to the parent document, and keep it current.
 *
 * Returns a cleanup function, so the call site is `useEffect(() =>
 * publishRegion(ref.current), [])`.
 *
 * `targetOrigin` is the current origin rather than `"*"`: the sandbox is
 * same-origin by construction, and a wildcard would broadcast our geometry to
 * any page that managed to frame us.
 */
export function publishRegion(element: Element | null): () => void {
  if (!element || typeof window === "undefined") return () => {};
  if (window.parent === window) return () => {};

  const send = () => {
    const message: SandboxRegionMessage = { type: SANDBOX_REGION_MESSAGE, region: regionOf(element) };
    window.parent.postMessage(message, window.location.origin);
  };

  send();
  const observer = new ResizeObserver(send);
  observer.observe(element);
  window.addEventListener("scroll", send, { passive: true });
  window.addEventListener("resize", send);

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", send);
    window.removeEventListener("resize", send);
  };
}

/* ── The capture itself ───────────────────────────────────────────────────── */

export type CaptureFailure = "unsupported" | "denied" | "failed";

export type CaptureResult =
  | { ok: true; blob: Blob; width: number; height: number; cropped: boolean }
  | { ok: false; reason: CaptureFailure };

/**
 * `preferCurrentTab` is Chromium-only and not in the DOM lib types. Declaring
 * the widening here rather than casting at the call site keeps the one `any`
 * that would otherwise be needed out of the code entirely.
 */
interface CurrentTabDisplayMediaOptions extends DisplayMediaStreamOptions {
  preferCurrentTab?: boolean;
}

function isDeniedError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}

/**
 * Grab one frame of the current tab and crop it to `element`.
 *
 * Must be called from a user gesture — the browser refuses otherwise, and the
 * refusal is indistinguishable from the user declining.
 */
export async function captureRegion(element: Element | null): Promise<CaptureResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, reason: "unsupported" };
  }

  let stream: MediaStream | undefined;
  try {
    const options: CurrentTabDisplayMediaOptions = {
      video: { frameRate: 1 },
      audio: false,
      preferCurrentTab: true,
    };
    stream = await navigator.mediaDevices.getDisplayMedia(options);

    const track = stream.getVideoTracks()[0];
    if (!track) return { ok: false, reason: "failed" };

    const frame = await firstFrame(stream);
    if (!frame) return { ok: false, reason: "failed" };

    // Cropping is only meaningful when the captured surface is this tab: the
    // frame then maps 1:1 onto the viewport. If the user picked a window or a
    // whole screen, the mapping is unknown and an arbitrary crop would hand
    // the trainer a picture of the wrong thing — so we hand over the whole
    // frame and say so via `cropped`.
    const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
    const isTab = settings.displaySurface === "browser";
    const rect = element && isTab ? regionOf(element) : null;

    const scale = frame.width / Math.max(window.innerWidth, 1);
    const source =
      rect && rect.width > 0 && rect.height > 0
        ? {
            x: Math.max(0, Math.round(rect.x * scale)),
            y: Math.max(0, Math.round(rect.y * scale)),
            width: Math.min(frame.width, Math.round(rect.width * scale)),
            height: Math.min(frame.height, Math.round(rect.height * scale)),
          }
        : { x: 0, y: 0, width: frame.width, height: frame.height };

    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, reason: "failed" };
    context.drawImage(
      frame.video,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      source.width,
      source.height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return { ok: false, reason: "failed" };

    return { ok: true, blob, width: source.width, height: source.height, cropped: rect !== null };
  } catch (error) {
    return { ok: false, reason: isDeniedError(error) ? "denied" : "failed" };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

/**
 * The first painted frame of a stream.
 *
 * `ImageCapture.grabFrame` would be shorter and is not in Firefox or Safari.
 * A detached `<video>` plus `requestVideoFrameCallback`, falling back to
 * `onloadeddata`, works everywhere `getDisplayMedia` does.
 */
async function firstFrame(
  stream: MediaStream,
): Promise<{ video: HTMLVideoElement; width: number; height: number } | null> {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  try {
    await video.play();
  } catch {
    return null;
  }

  await new Promise<void>((resolve) => {
    const withCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    };
    if (withCallback.requestVideoFrameCallback) {
      withCallback.requestVideoFrameCallback(() => resolve());
      return;
    }
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    video.addEventListener("loadeddata", () => resolve(), { once: true });
  });

  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  return { video, width: video.videoWidth, height: video.videoHeight };
}

/** A stable, descriptive file name for the captured image. */
export function captureFileName(scenarioCode: string, isoTimestamp: string): string {
  const stamp = isoTimestamp.replace(/[:.]/g, "-");
  return `${scenarioCode}-${stamp}.png`;
}
