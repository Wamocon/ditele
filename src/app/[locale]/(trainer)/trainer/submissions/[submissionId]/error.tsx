"use client";

import { useEffect } from "react";
import { ErrorState } from "@/shared/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest is the correlation id you quote in a bug report.
    console.error(error);
  }, [error]);

  return <ErrorState message={error.message} onRetry={reset} />;
}
