import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { PortfolioViewModel } from "../model/portfolio";

interface PortfolioViewProps {
  model: PortfolioViewModel;
  labels: PortfolioViewLabels;
}

export interface PortfolioViewLabels {
  previewTitle: string;
  previewDescription: string;
  evidenceHeading: string;
  emptyTitle: string;
  emptyDescription: string;
  verified: string;
  skills: string;
  visibility: Record<PortfolioViewModel["portfolio"]["visibility"], string>;
}

export function PortfolioView({ model, labels }: PortfolioViewProps) {
  return (
    <article aria-labelledby="portfolio-title" className="stack" data-source={model.source}>
      {model.source === "preview" ? (
        <StatePanel description={labels.previewDescription} title={labels.previewTitle} />
      ) : null}

      <header className="panel stack">
        <div className="cluster">
          <h1 id="portfolio-title">{model.portfolio.title}</h1>
          <Badge>{labels.visibility[model.portfolio.visibility]}</Badge>
        </div>
        <p>{model.portfolio.summary}</p>
      </header>

      <section aria-labelledby="portfolio-evidence" className="stack">
        <h2 id="portfolio-evidence">{labels.evidenceHeading}</h2>
        {model.portfolio.items.length === 0 ? (
          <StatePanel description={labels.emptyDescription} title={labels.emptyTitle} />
        ) : (
          <ol className="stack">
            {[...model.portfolio.items]
              .sort((left, right) => left.position - right.position)
              .map((item) => (
                <li key={item.id}>
                  <article className="panel stack">
                    <div className="cluster">
                      <h3>{item.evidence.title}</h3>
                      <Badge tone="success">{labels.verified}</Badge>
                    </div>
                    <p>{item.caption}</p>
                    <p className="muted">
                      {labels.skills}: {item.evidence.skillIds.join(", ")}
                    </p>
                    <time dateTime={item.evidence.verifiedAt}>{item.evidence.verifiedAt}</time>
                  </article>
                </li>
              ))}
          </ol>
        )}
      </section>
    </article>
  );
}
