import "server-only";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import {
  buildLearnerSkillCollection,
  type LearnerSkillCollection,
} from "@/features/skills/learner-skill-records";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;
type SkillPrerequisiteRpcClient = {
  rpc(
    name: "list_visible_skill_prerequisites",
  ): Promise<{ data: unknown; error: unknown }>;
};

function skillPrerequisiteRpcClient(client: ServerClient): SkillPrerequisiteRpcClient {
  // Generated DB types are refreshed only after the coordinated migration wave.
  return client as unknown as SkillPrerequisiteRpcClient;
}

export async function readLearnerSkillCollection(
  locale: Locale,
): Promise<LearnerSkillCollection> {
  const [principal, client] = await Promise.all([
    getPrincipal(),
    createServerClient(),
  ]);
  if (!principal.roles.includes("learner") || !principal.organizationId) {
    throw new Error("skills.forbidden");
  }
  const organizationId = principal.organizationId;
  const [skillsResult, masteryResult, prerequisiteResult] = await Promise.all([
    client
      .from("skills")
      .select("id, code, labels, descriptions, taxonomy_version")
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .eq("state", "active")
      .order("code", { ascending: true }),
    client
      .from("mastery_snapshots")
      .select(
        "organization_id, learner_id, skill_id, mastery_basis_points, rule_version, updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("learner_id", principal.userId),
    skillPrerequisiteRpcClient(client).rpc("list_visible_skill_prerequisites"),
  ]);

  const error = skillsResult.error ?? masteryResult.error ?? prerequisiteResult.error;
  if (error) {
    throw new Error("skills.learner_records_read_failed", { cause: error });
  }

  return buildLearnerSkillCollection(
    skillsResult.data ?? [],
    masteryResult.data ?? [],
    prerequisiteResult.data ?? [],
    true,
    locale,
  );
}
