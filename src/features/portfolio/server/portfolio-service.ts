import {
  PortfolioPublicationSchema,
  PortfolioSchema,
  PublishPortfolioInputSchema,
  RevokePortfolioInputSchema,
  UpdatePortfolioInputSchema,
  type Portfolio,
  type PortfolioPublication,
  type PublishPortfolioInput,
  type RevokePortfolioInput,
  type UpdatePortfolioInput,
} from "../model/portfolio";

export interface PortfolioPrincipal {
  id: string;
  role: "guest" | "learner" | "trainer" | "admin" | "organization_admin";
}

export interface PortfolioAccessPolicy {
  canAccess(input: {
    actorId: string;
    portfolioId?: string;
    publicationId?: string;
    action: "read" | "curate" | "publish" | "revoke";
  }): Promise<boolean>;
}

export interface PortfolioRepository {
  getForLearner(input: { learnerId: string; portfolioId: string }): Promise<unknown>;
  update(input: UpdatePortfolioInput & { learnerId: string }): Promise<unknown>;
  publish(input: PublishPortfolioInput & { learnerId: string }): Promise<unknown>;
  revoke(input: RevokePortfolioInput & { learnerId: string }): Promise<unknown>;
  getPublishedByToken(publicToken: string): Promise<unknown>;
}

export class PortfolioError extends Error {
  constructor(
    readonly code:
      | "portfolio.authentication_required"
      | "portfolio.forbidden"
      | "portfolio.stale_version"
      | "portfolio.publication_not_found",
  ) {
    super(code);
    this.name = "PortfolioError";
  }
}

function assertLearner(
  principal: PortfolioPrincipal | null,
): asserts principal is PortfolioPrincipal {
  if (!principal) throw new PortfolioError("portfolio.authentication_required");
  if (principal.role !== "learner") throw new PortfolioError("portfolio.forbidden");
}

async function assertAccess(
  policy: PortfolioAccessPolicy,
  input: Parameters<PortfolioAccessPolicy["canAccess"]>[0],
): Promise<void> {
  if (!(await policy.canAccess(input))) throw new PortfolioError("portfolio.forbidden");
}

export async function getLearnerPortfolio(
  dependencies: { policy: PortfolioAccessPolicy; repository: PortfolioRepository },
  principal: PortfolioPrincipal | null,
  portfolioId: string,
): Promise<Portfolio> {
  assertLearner(principal);
  await assertAccess(dependencies.policy, {
    actorId: principal.id,
    portfolioId,
    action: "read",
  });
  return PortfolioSchema.parse(
    await dependencies.repository.getForLearner({ learnerId: principal.id, portfolioId }),
  );
}

export async function updatePortfolio(
  dependencies: { policy: PortfolioAccessPolicy; repository: PortfolioRepository },
  principal: PortfolioPrincipal | null,
  input: unknown,
): Promise<Portfolio> {
  assertLearner(principal);
  const command = UpdatePortfolioInputSchema.parse(input);
  await assertAccess(dependencies.policy, {
    actorId: principal.id,
    portfolioId: command.portfolioId,
    action: "curate",
  });
  return PortfolioSchema.parse(
    await dependencies.repository.update({ ...command, learnerId: principal.id }),
  );
}

export async function publishPortfolio(
  dependencies: { policy: PortfolioAccessPolicy; repository: PortfolioRepository },
  principal: PortfolioPrincipal | null,
  input: unknown,
): Promise<PortfolioPublication> {
  assertLearner(principal);
  const command = PublishPortfolioInputSchema.parse(input);
  await assertAccess(dependencies.policy, {
    actorId: principal.id,
    portfolioId: command.portfolioId,
    action: "publish",
  });
  return PortfolioPublicationSchema.parse(
    await dependencies.repository.publish({ ...command, learnerId: principal.id }),
  );
}

export async function revokePortfolioPublication(
  dependencies: { policy: PortfolioAccessPolicy; repository: PortfolioRepository },
  principal: PortfolioPrincipal | null,
  input: unknown,
): Promise<PortfolioPublication> {
  assertLearner(principal);
  const command = RevokePortfolioInputSchema.parse(input);
  await assertAccess(dependencies.policy, {
    actorId: principal.id,
    publicationId: command.publicationId,
    action: "revoke",
  });
  return PortfolioPublicationSchema.parse(
    await dependencies.repository.revoke({ ...command, learnerId: principal.id }),
  );
}

export async function getPublishedPortfolio(
  repository: PortfolioRepository,
  publicToken: string,
): Promise<PortfolioPublication> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(publicToken)) {
    throw new PortfolioError("portfolio.publication_not_found");
  }
  const publication = PortfolioPublicationSchema.parse(
    await repository.getPublishedByToken(publicToken),
  );
  if (publication.status !== "published") {
    throw new PortfolioError("portfolio.publication_not_found");
  }
  return publication;
}
