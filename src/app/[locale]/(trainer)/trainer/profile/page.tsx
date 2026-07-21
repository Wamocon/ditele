import type { Metadata } from "next";
import { PageHeader } from "@/shared/layout";
import { Card, ErrorState } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getTrainerProfile } from "@/shared/data/review";
import { getPrincipal } from "@/shared/data/session";
import { locales } from "@/shared/i18n/config";
import { getTranslator } from "@/features/review/i18n";
import { ProfileForm } from "@/features/review/profile-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.profile.title") };
}

/** Functional tier — correct and plain, no polish budget spent here. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { principal } = await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const [profile, session] = await Promise.all([
    getTrainerProfile(principal.userId),
    getPrincipal(),
  ]);

  if (!profile.ok) {
    return (
      <>
        <PageHeader title={t("trainer.profile.title")} description={t("trainer.profile.description")} />
        <ErrorState message={profile.error.message} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("trainer.profile.title")} description={t("trainer.profile.description")} />

      <div className="flex flex-col gap-6">
        <ProfileForm
          locale={locale}
          initial={{
            displayName: profile.data.displayName,
            locale: profile.data.locale,
            timezone: profile.data.timezone,
            rowVersion: profile.data.rowVersion,
          }}
          localeOptions={locales.map((value) => ({
            value,
            label: t(`common.locale.${value}`) === `common.locale.${value}` ? value.toUpperCase() : t(`common.locale.${value}`),
          }))}
          labels={{
            displayName: t("trainer.profile.displayName"),
            displayNameHint: t("trainer.profile.displayNameHint"),
            locale: t("trainer.profile.locale"),
            timezone: t("trainer.profile.timezone"),
            timezoneHint: t("trainer.profile.timezoneHint"),
            save: t("trainer.profile.save"),
            saved: t("trainer.profile.saved"),
            nameRequired: t("trainer.profile.nameRequired"),
          }}
        />

        <Card className="flex max-w-xl flex-col gap-3">
          <h2 className="text-[18px] font-semibold leading-6">{t("trainer.profile.account")}</h2>
          <dl className="flex flex-col gap-2 text-[15px]">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-[--color-fg-muted]">{t("trainer.profile.email")}</dt>
              <dd className="font-semibold">{session?.email ?? "—"}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-[--color-fg-muted]">{t("trainer.profile.role")}</dt>
              <dd className="font-semibold">{t("roles.trainer")}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
