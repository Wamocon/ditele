import { Badge } from "@/shared/ui/badge";
import { StatePanel } from "@/shared/ui/state-panel";

import type { OrganizationMembership } from "../model";

export function OrganizationMembers({ memberships, authorized, labels }: { memberships: readonly OrganizationMembership[]; authorized: boolean; labels: { title: string; forbiddenTitle: string; forbiddenDescription: string; states: Record<OrganizationMembership["state"], string> } }) {
  if (!authorized) return <StatePanel title={labels.forbiddenTitle} description={labels.forbiddenDescription} tone="danger" />;
  return <section aria-labelledby="organization-members-title" className="stack"><h2 id="organization-members-title">{labels.title}</h2><ul className="stack">{memberships.map((membership) => <li className="panel cluster" key={membership.id}><span>{membership.userId}</span><Badge tone={membership.state === "active" ? "success" : membership.state === "suspended" ? "warning" : "neutral"}>{labels.states[membership.state]}</Badge></li>)}</ul></section>;
}
