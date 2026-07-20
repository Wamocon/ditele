"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

import { isLocale, type Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

const errorCopy: Record<Locale, {
  readonly description: string;
  readonly reference: string;
  readonly referenceHelp: string;
  readonly retry: string;
  readonly title: string;
}> = {
  en: {
    title: "Something went wrong",
    description: "The application could not complete this request. Check your connection and retry.",
    reference: "Error reference",
    referenceHelp: "If the problem continues, share this reference with support.",
    retry: "Retry",
  },
  de: {
    title: "Etwas ist schiefgelaufen",
    description: "Die Anwendung konnte diese Anfrage nicht abschließen. Prüfe die Verbindung und versuche es erneut.",
    reference: "Fehlerreferenz",
    referenceHelp: "Wenn das Problem weiterhin auftritt, teile diese Referenz dem Support mit.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "Что-то пошло не так",
    description: "Приложение не смогло выполнить запрос. Проверьте подключение и повторите попытку.",
    reference: "Код ошибки",
    referenceHelp: "Если проблема повторится, сообщите этот код службе поддержки.",
    retry: "Повторить",
  },
};

function safeReference(value: string | undefined): string | null {
  return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const copy = errorCopy[locale];
  const reference = safeReference(error.digest);

  useEffect(() => {
    console.error("Unhandled application error", { digest: reference });
  }, [reference]);

  return (
    <main className="container content-section">
      <StatePanel
        tone="danger"
        title={copy.title}
        description={copy.description}
        action={(
          <div className="stack">
            {reference ? (
              <p>
                {copy.referenceHelp}{" "}
                <strong>{copy.reference}:</strong>{" "}
                <code>{reference}</code>
              </p>
            ) : null}
            <div><Button onClick={reset}>{copy.retry}</Button></div>
          </div>
        )}
      />
    </main>
  );
}
