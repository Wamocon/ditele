import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { PublicHeader } from "@/shared/ui/public-header";

import { faqCopy, type FaqItem } from "./copy";
import styles from "./faq.module.css";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: isLocale(locale) ? faqCopy[locale].metadataTitle : "FAQ | DiTeLe",
  };
}

function FaqActionLink({
  action,
  locale,
}: {
  readonly action: NonNullable<FaqItem["action"]>;
  readonly locale: Parameters<typeof localizedRoute>[0];
}) {
  if (action.kind === "external") {
    return <a href={action.href}>{action.label}</a>;
  }

  return <Link href={localizedRoute(locale, action.path)}>{action.label}</Link>;
}

export default async function FaqPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = await getMessages(locale);
  const copy = faqCopy[locale];

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="container content-section" id="main-content">
        <article className={`stack reading-column ${styles.page}`}>
          <header className={`stack ${styles.introduction}`}>
            <h1>{copy.title}</h1>
            <p className="muted">{copy.introduction}</p>
          </header>

          <section aria-labelledby="faq-section-title" className="stack">
            <h2 id="faq-section-title">{copy.sectionTitle}</h2>
            <div className={styles.list}>
              {copy.items.map((item, index) => (
                <details className={`panel ${styles.item}`} key={item.topic}>
                  <summary>
                    <span aria-hidden="true" className={styles.number}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.question}>{item.question}</span>
                  </summary>
                  <div className={`stack ${styles.answer}`}>
                    <p>{item.answer}</p>
                    {item.action ? (
                      <p>
                        <FaqActionLink action={item.action} locale={locale} />
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <aside aria-labelledby="faq-current-information" className="panel stack">
            <h2 id="faq-current-information">{copy.furtherHelpTitle}</h2>
            <p>{copy.furtherHelpBody}</p>
            <p>
              <Link href={localizedRoute(locale, "/catalog")}>
                {copy.furtherHelpAction}
              </Link>
            </p>
          </aside>
        </article>
      </main>
    </>
  );
}
