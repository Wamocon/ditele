import type { Principal } from "@/shared/auth/types";

import {
  AnalyticsConsentSchema,
  AnalyticsEventSchema,
  AnalyticsSubjectReferenceSchema,
  type AnalyticsConsent,
  type AnalyticsEvent,
  type PseudonymizedAnalyticsEvent,
} from "./model";

export class AnalyticsError extends Error {
  constructor(readonly code: "analytics.consent_required" | "analytics.sensitive_property" | "analytics.forbidden") {
    super(code);
    this.name = "AnalyticsError";
  }
}

export interface AnalyticsSink {
  append(event: PseudonymizedAnalyticsEvent): Promise<void>;
}

export interface AnalyticsSubjectPseudonymizer {
  pseudonymize(subjectId: string): Promise<string>;
}

export interface AnalyticsDeletionSink {
  deleteForSubject(subjectReference: string): Promise<void>;
}

const sensitivePropertyPattern = /(email|name|answer|content|token|secret|password|submission|prompt|message|feedback)/i;
const sensitiveValuePattern = /(?:bearer\s+[a-z0-9._-]+|api[_-]?key\s*[:=]|password\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b|\b(?:sk|pk)_(?:live|test)_[a-z0-9]{12,}\b)/i;

function hasSensitiveProperty(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const properties = Reflect.get(input, "properties");
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return false;
  return Object.entries(properties).some(
    ([key, value]) => sensitivePropertyPattern.test(key)
      || (typeof value === "string" && sensitiveValuePattern.test(value)),
  );
}

function hasConsent(event: AnalyticsEvent, consent: AnalyticsConsent | null): boolean {
  if (!consent || event.subjectId !== consent.subjectId) return false;
  if (consent.withdrawnAt) return false;
  if (Date.parse(consent.recordedAt) > Date.parse(event.occurredAt)) return false;
  return event.category === "product" ? consent.product : consent.learning;
}

export async function captureAnalyticsEvent(
  sink: AnalyticsSink,
  eventInput: unknown,
  consentInput: unknown | null,
  pseudonymizer: AnalyticsSubjectPseudonymizer,
): Promise<PseudonymizedAnalyticsEvent> {
  if (hasSensitiveProperty(eventInput)) {
    throw new AnalyticsError("analytics.sensitive_property");
  }
  const event = AnalyticsEventSchema.parse(eventInput);
  const consent = consentInput ? AnalyticsConsentSchema.parse(consentInput) : null;
  if (!hasConsent(event, consent)) throw new AnalyticsError("analytics.consent_required");
  const subjectId = event.subjectId === null
    ? null
    : AnalyticsSubjectReferenceSchema.parse(await pseudonymizer.pseudonymize(event.subjectId));
  const minimizedEvent = { ...event, subjectId } as PseudonymizedAnalyticsEvent;
  await sink.append(minimizedEvent);
  return minimizedEvent;
}

export async function deleteAnalyticsSubjectData(
  sink: AnalyticsDeletionSink,
  pseudonymizer: AnalyticsSubjectPseudonymizer,
  subjectId: string,
): Promise<void> {
  const subjectReference = AnalyticsSubjectReferenceSchema.parse(
    await pseudonymizer.pseudonymize(subjectId),
  );
  await sink.deleteForSubject(subjectReference);
}

export function authorizeAnalyticsScope(principal: Principal, organizationId: string | null): void {
  const allowed = principal.permissions.includes("analytics.read")
    && principal.organizationId === organizationId;
  if (!allowed) throw new AnalyticsError("analytics.forbidden");
}

export function conversionRate(started: number, completed: number): number {
  if (!Number.isInteger(started) || !Number.isInteger(completed) || started < 0 || completed < 0 || completed > started) {
    throw new RangeError("analytics.invalid_counts");
  }
  return started === 0 ? 0 : completed / started;
}
