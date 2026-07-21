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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `${userId}/avatar-${Date.now()}.${extension}`;

    const uploaded = await supabase.storage
      .from("avatars")
      .upload(key, file, { cacheControl: "3600", upsert: true, contentType: file.type });

    if (uploaded.error) {
      setError(strings.failed);
      return;
    }

    // `update_own_avatar` ships in migration 20260721170000; database.types.ts
    // has not been regenerated since, so the name is not in the RPC union yet.
    const saved = await (supabase.rpc as unknown as UntypedRpc)("update_own_avatar", {
      p_avatar_object_key: key,
    });
    if (saved.error) {
      setError(strings.failed);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(key);
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
      setError(strings.failed);
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
        {preview ? (
          <Image
            src={preview}
            alt=""
            width={80}
            height={80}
            className="size-20 object-cover"
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
