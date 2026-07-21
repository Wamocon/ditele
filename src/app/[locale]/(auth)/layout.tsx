import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

/** WS-0 owns this file. Centred card, no nav — auth pages stand alone. */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-(--color-surface) px-4 py-10">
      {/* The wordmark is 17px tall but it is the only way back out of the auth
          screens, so the hit area is padded to the mandatory 44px on mobile
          (MASTER_PLAN §6.5). Matches app-header.tsx. */}
      <Link
        href={`/${locale}`}
        className="mb-8 flex min-h-11 items-center lg:min-h-0"
        aria-label="DiTeLe — zur Startseite"
      >
        <Image src="/logo.svg" alt="DiTeLe" width={167} height={17} priority className="h-[17px] w-auto" />
      </Link>
      <div className="w-full max-w-[420px] animate-scale-in rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-6 shadow-(--shadow-md)">
        {children}
      </div>
    </div>
  );
}
