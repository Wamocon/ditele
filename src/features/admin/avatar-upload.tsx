"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";

import { Button, cn } from "@/shared/ui";
import { createBrowserClient } from "@/shared/database/browser";

/** Narrow escape hatch for an RPC newer than the generated types. */
type UntypedRpc = (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/**
 * Profile photo.
 *
 * Uploads straight from the browser to the public `avatars` bucket, then hands
 * only the resulting object key to `update_own_avatar`. The file never passes
 * through a Server Action, so a 2 MB image does not become a 2 MB form post.
 *
 * The key is always `<user_id>/avatar-<timestamp>.<ext>`. The storage policy
 * pins writes to a folder named after the caller, and the RPC re-checks the
 * same rule, so a forged key fails twice.
 */
export function AvatarUpload({
  userId,
  displayName,
  publicUrl,
  strings,
}: {
  userId: string;
  displayName: string;
  publicUrl: string | null;
  strings: {
    change: string;
    remove: string;
    hint: string;
    tooLarge: string;
    wrongType: string;
    failed: string;
  };
}) {
  const [preview, setPreview] = useState<string | null>(publicUrl);
  /** Set when the stored key's object cannot be fetched — see the render. */
  const [broken, setBroken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /**
   * Both failure paths used to `setError(strings.failed)` and drop the real
   * reason on the floor. "The photo could not be saved" is the same sentence
   * whether the bucket is missing, the storage policy refused the key, the
   * session had expired or the RPC is not deployed — so the one screen that
   * could tell you which told you nothing, on all three roles at once.
   *
   * The friendly sentence stays first; the cause is appended after it.
   */
  function fail(cause: unknown) {
    const detail =
      cause instanceof Error
        ? cause.message
        : typeof cause === "object" && cause !== null && "message" in cause
          ? String((cause as { message: unknown }).message)
          : "";
    setError(detail ? `${strings.failed} (${detail})` : strings.failed);
  }

  async function upload(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError(strings.wrongType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(strings.tooLarge);
      return;
    }

    const supabase = createBrowserClient();

    // Storage writes are `to authenticated` and the RPC raises 28000 without a
    // caller, so a browser client with no session fails with a storage error
    // that reads like a bucket problem. Checked first, and named for what it is.
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      fail(new Error("no browser session"));
      return;
    }

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `${userId}/avatar-${Date.now()}.${extension}`;

    const uploaded = await supabase.storage
      .from("avatars")
      .upload(key, file, { cacheControl: "3600", upsert: true, contentType: file.type });

    if (uploaded.error) {
      fail(uploaded.error);
      return;
    }

    // `update_own_avatar` ships in migration 20260721170000; database.types.ts
    // has not been regenerated since, so the name is not in the RPC union yet.
    const saved = await (supabase.rpc as unknown as UntypedRpc)("update_own_avatar", {
      p_avatar_object_key: key,
    });
    if (saved.error) {
      fail(saved.error);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(key);
    setBroken(false); // a fresh upload replaces whatever was unfetchable before
    setPreview(data.publicUrl);
    // The header avatar is server-rendered, so it needs a refresh to catch up.
    startTransition(() => router.refresh());
  }

  async function clear() {
    setError(null);
    const supabase = createBrowserClient();
    const cleared = await (supabase.rpc as unknown as UntypedRpc)("update_own_avatar", {
      p_avatar_object_key: null,
    });
    if (cleared.error) {
      fail(cleared.error);
      return;
    }
    setPreview(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span
        className={cn(
          "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full",
          "bg-(--color-brand) text-[24px] font-semibold text-(--color-brand-fg)"
        )}
      >
        {/* `broken` is why this is not just `preview ? <Image/> : initials`.
            `profiles.avatar_object_key` can outlive the object it points at —
            a bucket recreated, an object pruned — and then the derived public
            URL 404s. The <img> rendered as an empty box inside the brand-red
            circle, which looked like a styling bug rather than a missing file,
            and the initials that would have been correct never appeared. */}
        {preview && !broken ? (
          <Image
            src={preview}
            alt=""
            width={80}
            height={80}
            className="size-20 object-cover"
            onError={() => setBroken(true)}
            unoptimized
          />
        ) : (
          initials(displayName)
        )}
      </span>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={pending}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-4" aria-hidden />
            {strings.change}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" onClick={clear} loading={pending}>
              <Trash2 className="size-4" aria-hidden />
              {strings.remove}
            </Button>
          )}
        </div>
        <p className="text-[12px] leading-4 text-(--color-fg-muted)">{strings.hint}</p>
        {error && <p className="text-[13px] leading-5 text-(--color-danger)">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
