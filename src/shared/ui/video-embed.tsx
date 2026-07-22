import { ExternalLink, Play } from "lucide-react";

import { uiStrings } from "@/shared/i18n/ui-strings";
import { cn } from "./cn";

/**
 * One video field, any provider.
 *
 * Measured against the real eloomi tenant on 2026-07-21, because the right
 * behaviour depends on facts, not on preference:
 *
 *   GET https://360-tm.eloomi.io/app/courses/11/revisit/chapter/10/page/343
 *     * no X-Frame-Options header
 *     * CSP has no frame-ancestors directive
 *       -> embedding is NOT technically blocked, and
 *     * an unauthenticated request returns a ~10KB SPA shell containing "Login"
 *       -> it IS blocked in practice
 *
 * So an <iframe> would show the learner an eloomi login screen inside the task,
 * with no way to sign in usefully: the session cookie is third-party in that
 * frame, and Safari blocks those outright while Chrome is phasing them out.
 * A frame that works on the author's machine and shows a login wall to
 * students is worse than an honest link.
 *
 * Hence: eloomi renders as a deliberate "open the video" card in a new tab.
 * The learner signs into eloomi once in their own browser and every later deep
 * link resolves. Providers that CAN be embedded anonymously (YouTube, Vimeo,
 * a direct file) are embedded properly.
 *
 * Upgrade paths, in order of preference, when someone owns the eloomi account:
 *   1. Use the underlying video directly. eloomi's own CSP allows youtube.com,
 *      player.vimeo.com and fast.wistia.net as child-src, so the media already
 *      lives on one of those. A source id turns this into a real inline player.
 *   2. eloomi SSO (OIDC/SAML) so the frame carries a session — BLK-006/BLK-013,
 *      needs vendor configuration.
 *   3. eloomi API to pull content server-side — needs an API key.
 */

export type VideoProvider = "eloomi" | "youtube" | "vimeo" | "file" | "unknown";

export function detectProvider(url: string): VideoProvider {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (host.endsWith("eloomi.io") || host.endsWith("eloomi.com")) return "eloomi";
  if (host.endsWith("youtube.com") || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
  if (host.endsWith("vimeo.com")) return "vimeo";
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return "file";
  return "unknown";
}

/** youtube.com/watch?v=ID, youtu.be/ID and /embed/ID all normalise to one id. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(embed|v|shorts)\/([^/?]+)/);
    return m?.[2] ?? null;
  } catch {
    return null;
  }
}

function vimeoId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface VideoEmbedProps {
  url: string;
  title: string;
  /** Rendered smaller and labelled as the lead-in for a practical scenario. */
  intro?: boolean;
  className?: string;
  /**
   * Active locale, for the link label and its description.
   *
   * The eloomi/unknown-provider branch is a plain link with its own copy, and
   * that copy was hardcoded German — a learner on /en opening a task with a
   * video read "Video ansehen" under an otherwise English page.
   */
  locale?: string;
}

export function VideoEmbed({ url, title, intro = false, className, locale }: VideoEmbedProps) {
  const provider = detectProvider(url);
  const s = uiStrings(locale).common;
  const frameClass = cn(
    "aspect-video w-full overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-black",
    className,
  );

  if (provider === "youtube") {
    const id = youtubeId(url);
    if (id) {
      return (
        <iframe
          className={frameClass}
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      );
    }
  }

  if (provider === "vimeo") {
    const id = vimeoId(url);
    if (id) {
      return (
        <iframe
          className={frameClass}
          src={`https://player.vimeo.com/video/${id}`}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      );
    }
  }

  if (provider === "file") {
    // eslint-disable-next-line jsx-a11y/media-has-caption -- captions are authored per task and not yet modelled
    return <video className={frameClass} src={url} controls preload="metadata" title={title} />;
  }

  // eloomi and anything unrecognised: an honest link, not a login wall.
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center gap-4 rounded-(--radius-lg) border border-(--color-border)",
        "bg-(--color-surface) p-4 transition-colors duration-(--duration-base)",
        "hover:border-(--color-brand) hover:bg-(--color-surface-2)",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          "bg-(--color-brand) text-(--color-brand-fg)",
          "transition-transform duration-(--duration-base) group-hover:scale-105",
        )}
      >
        <Play className="size-5 translate-x-px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-6">
          {intro ? s.videoWatchIntro : s.videoWatch}
        </span>
        <span className="block text-[13px] leading-5 text-(--color-fg-muted)">
          {provider === "eloomi" ? s.videoOpensEloomi : s.videoOpensNewTab}
        </span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-(--color-fg-muted)" aria-hidden />
    </a>
  );
}
