import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import type { Locale } from "@/shared/i18n/config";
import type { Messages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { PublicHeader } from "@/shared/ui/public-header";

export function AuthPage({
  children,
  description,
  locale,
  messages,
  status,
  title,
}: {
  children: ReactNode;
  description: string;
  locale: Locale;
  messages: Messages;
  status?: { message: string; tone: "danger" | "success" } | undefined;
  title: string;
}) {
  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="content-section" id="main-content">
        <div className="container auth-layout">
          <section className="auth-panel stack" aria-labelledby="auth-title">
            <header className="stack">
              <h1 id="auth-title">{title}</h1>
              <p className="muted">{description}</p>
            </header>
            {status ? (
              <p className={`state-message state-message--${status.tone}`} role="status">
                {status.message}
              </p>
            ) : null}
            {children}
          </section>
          <aside className="panel stack">
            <h2>{messages.home.workflowTitle}</h2>
            <p>{messages.home.description}</p>
            <Link className="button button--secondary" href={localizedRoute(locale, "/catalog") as Route}>
              {messages.nav.catalog}
            </Link>
          </aside>
        </div>
      </main>
    </>
  );
}
