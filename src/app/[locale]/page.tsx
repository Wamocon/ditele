import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { PublicHeader } from "@/shared/ui/public-header";

export const metadata: Metadata = { title: "Practical software testing learning" };

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale);
  const workflow = Object.values(messages.home.workflow);

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main id="main-content">
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__copy">
              <h1>{messages.home.title}</h1>
              <p>{messages.home.description}</p>
              <div className="cluster">
                <Link className="button" href={localizedRoute(locale, "/catalog")}>
                  {messages.home.primaryAction}<ArrowRight aria-hidden="true" />
                </Link>
                <Link className="button button--secondary" href={localizedRoute(locale, "/auth/login")}>{messages.home.secondaryAction}</Link>
              </div>
            </div>
            <div>
              <h2 id="workflow">{messages.home.workflowTitle}</h2>
              <div className="workflow-map">
                {workflow.map((step, index) => (
                  <div className="workflow-map__step" key={step}>
                    <span className="workflow-map__number">{String(index + 1).padStart(2, "0")}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <h2>{messages.home.featuredTitle}</h2>
            <article className="course-row">
              <div>
                <div className="cluster muted"><span>{messages.catalog.level}</span><span aria-hidden="true">·</span><span>{messages.catalog.duration}</span></div>
                <h3>{messages.catalog.courseTitle}</h3>
                <p>{messages.catalog.courseDescription}</p>
              </div>
              <Link className="button button--secondary" href={localizedRoute(locale, "/catalog")}>{messages.catalog.viewCourse}</Link>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
