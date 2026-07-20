import { z } from "zod";

import { AdministrationError } from "./errors";
import type {
  AdministrationAuditRequest,
  AdministrationPrincipal,
  ImpersonationPort,
  ImpersonationSession,
} from "./model";

const startSchema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().trim().min(10).max(1_000),
  durationMinutes: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});
const endSchema = z.object({
  impersonationSessionId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.string().min(8).max(200),
});

function assertAdmin(
  principal: AdministrationPrincipal,
  permission: "impersonation:start" | "impersonation:end",
): void {
  if (!principal.roles.includes("admin") || !principal.permissions.includes(permission)) {
    throw new AdministrationError(
      "ADMIN_FORBIDDEN",
      "Only an authorized administrator may use role-view mode.",
    );
  }
}

function audit(input: {
  readonly principal: AdministrationPrincipal;
  readonly sessionId: string;
  readonly eventName: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}): AdministrationAuditRequest {
  return {
    eventName: input.eventName,
    actorId: input.principal.userId,
    organizationId: input.principal.organizationId,
    resourceType: "impersonation_session",
    resourceId: input.sessionId,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

export class ImpersonationService {
  constructor(
    private readonly port: ImpersonationPort,
    private readonly maximumDurationMinutes: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(principal: AdministrationPrincipal, rawInput: unknown): Promise<ImpersonationSession> {
    assertAdmin(principal, "impersonation:start");
    const input = startSchema.safeParse(rawInput);
    if (!input.success || input.data.durationMinutes > this.maximumDurationMinutes) {
      throw new AdministrationError(
        "ADMIN_INVALID_INPUT",
        "The role-view request or duration is invalid.",
      );
    }
    if (input.data.targetUserId === principal.userId) {
      throw new AdministrationError("ADMIN_INVALID_INPUT", "Administrators cannot impersonate themselves.");
    }
    const target = await this.port.getTarget(input.data.targetUserId);
    if (!target) {
      throw new AdministrationError("ADMIN_NOT_FOUND", "The role-view target does not exist.");
    }
    if (target.organizationId !== principal.organizationId || !target.active) {
      throw new AdministrationError(
        "ADMIN_FORBIDDEN",
        "The role-view target is outside the administrator scope or inactive.",
      );
    }
    const expiresAt = new Date(
      this.now().getTime() + input.data.durationMinutes * 60 * 1_000,
    ).toISOString();
    const pendingSessionId = `pending:${principal.sessionId}:${target.userId}`;
    return this.port.start(
      {
        administratorId: principal.userId,
        administratorSessionId: principal.sessionId,
        targetUserId: target.userId,
        reason: input.data.reason,
        expiresAt,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        sessionId: pendingSessionId,
        eventName: "impersonation.started",
        correlationId: input.data.correlationId,
        metadata: {
          targetUserId: target.userId,
          targetRole: target.role,
          durationMinutes: input.data.durationMinutes,
          reason: input.data.reason,
        },
      }),
    );
  }

  async end(principal: AdministrationPrincipal, rawInput: unknown): Promise<ImpersonationSession> {
    assertAdmin(principal, "impersonation:end");
    const input = endSchema.safeParse(rawInput);
    if (!input.success) {
      throw new AdministrationError("ADMIN_INVALID_INPUT", "The role-view end request is invalid.");
    }
    const session = await this.port.getSession(input.data.impersonationSessionId);
    if (!session) {
      throw new AdministrationError("ADMIN_NOT_FOUND", "The role-view session does not exist.");
    }
    if (
      session.administratorId !== principal.userId
      || session.administratorSessionId !== principal.sessionId
      || session.organizationId !== principal.organizationId
    ) {
      throw new AdministrationError("ADMIN_FORBIDDEN", "The role-view session is outside scope.");
    }
    if (session.state !== "active") {
      throw new AdministrationError("ADMIN_INVALID_STATE", "The role-view session has already ended.");
    }
    return this.port.end(
      {
        impersonationSessionId: session.id,
        administratorId: principal.userId,
        administratorSessionId: principal.sessionId,
        idempotencyKey: input.data.idempotencyKey,
      },
      audit({
        principal,
        sessionId: session.id,
        eventName: "impersonation.ended",
        correlationId: input.data.correlationId,
        metadata: { targetUserId: session.target.userId },
      }),
    );
  }
}
