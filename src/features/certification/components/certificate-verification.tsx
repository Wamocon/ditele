import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { CertificateVerification } from "../model";

export function CertificateVerificationPanel({
  result,
  labels,
}: {
  result: CertificateVerification;
  labels: Record<CertificateVerification["status"], string> & { title: string };
}) {
  if (result.status === "not_found") return <StatePanel title={labels.title} description={labels.not_found} tone="danger" />;
  return (
    <section aria-labelledby="certificate-verification-title" className="panel stack">
      <h1 id="certificate-verification-title">{labels.title}</h1>
      <Badge tone={result.status === "valid" ? "success" : "danger"}>{labels[result.status]}</Badge>
      {result.status === "valid" ? <p>{result.courseTitle}</p> : null}
    </section>
  );
}
