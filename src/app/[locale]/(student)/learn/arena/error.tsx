"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ErrorState } from "@/shared/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The boundary is a Client Component, so the locale comes off the route
  // rather than from page props — without it the error title and the retry
  // button render in German on /en and /ru.
  const { locale } = useParams<{ locale: string }>();

  useEffect(() => {
    // digest is the correlation id you quote in a bug report.
    console.error(error);
  }, [error]);

  return <ErrorState message={error.message} onRetry={reset} locale={locale} />;
}
