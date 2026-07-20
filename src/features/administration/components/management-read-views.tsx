import Link from "next/link";

import type { Locale } from "@/shared/i18n/config";
import { localizedDynamicRoute } from "@/shared/i18n/routes";
import { Badge } from "@/shared/ui/badge";

import type {
  AdminGroupsCopy,
  AdminSettingsCopy,
  AdminUsersCopy,
} from "../management-read-copy";
import type {
  AdminGroupListItem,
  AdminOrganizationSettings,
  AdminUserDirectoryItem,
} from "../management-read-model";
import styles from "./management-read.module.css";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

function lifecycleTone(state: string): BadgeTone {
  if (state === "active" || state === "completed") return "success";
  if (state === "cancelled" || state === "removed" || state === "archived") return "danger";
  if (state === "suspended" || state === "inactive") return "warning";
  return "neutral";
}

function ManagementNotice({
  description,
  id,
  title,
  warning = false,
}: {
  readonly description: string;
  readonly id: string;
  readonly title: string;
  readonly warning?: boolean;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`${styles.notice} ${warning ? styles.noticeWarning : ""}`.trim()}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="muted">{description}</p>
    </section>
  );
}

function Pagination({
  basePath,
  labels,
  locale,
  page,
  totalPages,
}: {
  readonly basePath: "/admin/groups" | "/admin/users";
  readonly labels: Pick<AdminGroupsCopy, "nextPage" | "page" | "previousPage">;
  readonly locale: Locale;
  readonly page: number;
  readonly totalPages: number;
}) {
  return (
    <nav aria-label={labels.page(page, totalPages)} className={styles.pagination}>
      {page > 1 ? (
        <Link
          className="button button--secondary"
          href={localizedDynamicRoute(locale, `${basePath}?page=${page - 1}`)}
        >
          {labels.previousPage}
        </Link>
      ) : (
        <span aria-disabled="true" className="button button--secondary">{labels.previousPage}</span>
      )}
      <span aria-current="page">{labels.page(page, totalPages)}</span>
      {page < totalPages ? (
        <Link
          className="button button--secondary"
          href={localizedDynamicRoute(locale, `${basePath}?page=${page + 1}`)}
        >
          {labels.nextPage}
        </Link>
      ) : (
        <span aria-disabled="true" className="button button--secondary">{labels.nextPage}</span>
      )}
    </nav>
  );
}

function groupSchedule(
  group: AdminGroupListItem,
  formatter: Intl.DateTimeFormat,
  labels: AdminGroupsCopy,
): string {
  const start = group.startsAt ? formatter.format(new Date(group.startsAt)) : null;
  const end = group.endsAt ? formatter.format(new Date(group.endsAt)) : null;
  if (start && end) return labels.scheduleRange(start, end);
  if (start) return labels.starts(start);
  if (end) return labels.ends(end);
  return labels.notScheduled;
}

export function AdminGroupsView({
  items,
  labels,
  locale,
  page,
  total,
  totalPages,
}: {
  readonly items: readonly AdminGroupListItem[];
  readonly labels: AdminGroupsCopy;
  readonly locale: Locale;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <section aria-labelledby="admin-groups-title" className="stack">
      <header className={`page-heading ${styles.pageHeader}`}>
        <div>
          <h1 id="admin-groups-title">{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <strong className={styles.count}>{labels.count(total)}</strong>
      </header>

      {items.length === 0 ? (
        <ManagementNotice
          description={labels.emptyDescription}
          id="admin-groups-empty"
          title={labels.emptyTitle}
        />
      ) : (
        <ol className={styles.list}>
          {items.map((group) => (
            <li key={group.id}>
              <article className={`panel ${styles.card}`}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className="muted">{group.courseTitle}</p>
                    <h2>{group.name}</h2>
                  </div>
                  <div className={styles.badges}>
                    {group.courseUsedFallback ? (
                      <Badge tone="warning">{labels.localeFallback(group.courseResolvedLocale)}</Badge>
                    ) : null}
                    <Badge>{labels.progressionModes[group.progressionMode]}</Badge>
                    <Badge tone={lifecycleTone(group.state)}>{labels.states[group.state]}</Badge>
                  </div>
                </header>
                <dl className={styles.facts}>
                  <div>
                    <dt>{labels.schedule}</dt>
                    <dd>{groupSchedule(group, dateFormatter, labels)}</dd>
                  </div>
                  <div>
                    <dt>{labels.capacity}</dt>
                    <dd>{group.capacity === null ? labels.unlimitedCapacity : labels.capacityValue(group.learnerCount, group.capacity)}</dd>
                  </div>
                  <div>
                    <dt>{labels.updated}</dt>
                    <dd><time dateTime={group.updatedAt}>{dateTimeFormatter.format(new Date(group.updatedAt))}</time></dd>
                  </div>
                </dl>
                <div className={styles.membershipSummary}>
                  <span>{labels.learners(group.learnerCount)}</span>
                  <span>{labels.trainers(group.trainerCount)}</span>
                </div>
                <div>
                  <Link
                    className="button button--secondary"
                    href={localizedDynamicRoute(
                      locale,
                      `/admin/groups/${group.id}`,
                    )}
                  >
                    {labels.openGroup}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      <Pagination
        basePath="/admin/groups"
        labels={labels}
        locale={locale}
        page={page}
        totalPages={totalPages}
      />
      <ManagementNotice
        description={labels.readOnlyDescription}
        id="admin-groups-read-only"
        title={labels.readOnlyTitle}
      />
    </section>
  );
}

export function AdminUsersView({
  items,
  labels,
  locale,
  page,
  total,
  totalPages,
}: {
  readonly items: readonly AdminUserDirectoryItem[];
  readonly labels: AdminUsersCopy;
  readonly locale: Locale;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <section aria-labelledby="admin-users-title" className="stack">
      <header className={`page-heading ${styles.pageHeader}`}>
        <div>
          <h1 id="admin-users-title">{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <strong className={styles.count}>{labels.count(total)}</strong>
      </header>

      {items.length === 0 ? (
        <ManagementNotice
          description={labels.emptyDescription}
          id="admin-users-empty"
          title={labels.emptyTitle}
        />
      ) : (
        <ol className={styles.list}>
          {items.map((item) => (
            <li key={item.membershipId}>
              <article className={`panel ${styles.card}`}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className="muted">{labels.membership}</p>
                    <h2>{item.profileVisible ? item.displayName ?? labels.displayNameMissing : labels.profileRestricted}</h2>
                    {!item.profileVisible ? <p className={styles.policyGap}>{labels.profileRestrictedDescription}</p> : null}
                  </div>
                  <div className={styles.badges}>
                    {item.profileState ? <Badge tone={lifecycleTone(item.profileState)}>{labels.profileStates[item.profileState]}</Badge> : null}
                    <Badge tone={lifecycleTone(item.membershipState)}>{labels.membershipStates[item.membershipState]}</Badge>
                  </div>
                </header>
                <dl className={styles.facts}>
                  <div>
                    <dt>{item.joinedAt ? labels.joined : labels.invited}</dt>
                    <dd><time dateTime={item.joinedAt ?? item.createdAt}>{dateFormatter.format(new Date(item.joinedAt ?? item.createdAt))}</time></dd>
                  </div>
                  <div>
                    <dt>{labels.validUntil}</dt>
                    <dd>{item.validUntil ? <time dateTime={item.validUntil}>{dateFormatter.format(new Date(item.validUntil))}</time> : labels.noExpiry}</dd>
                  </div>
                  <div>
                    <dt>{labels.profileLocale}</dt>
                    <dd>{item.profileLocale?.toUpperCase() ?? "—"}</dd>
                  </div>
                </dl>
                <div>
                  <p className="muted">{labels.roles}</p>
                  {item.roles.length === 0 ? (
                    <p>{labels.noRoles}</p>
                  ) : (
                    <div className={styles.roles}>
                      {item.roles.map((role) => (
                        <Badge key={`${role.code}-${role.cohortScoped ? "cohort" : "organization"}`}>
                          {labels.roleLabel(role.code)} · {role.cohortScoped ? labels.cohortScoped : labels.organizationScoped}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Link
                    className="button button--secondary"
                    href={localizedDynamicRoute(
                      locale,
                      `/admin/users/${item.userId}`,
                    )}
                  >
                    {labels.openMemberDetails}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      <Pagination
        basePath="/admin/users"
        labels={labels}
        locale={locale}
        page={page}
        totalPages={totalPages}
      />
      <ManagementNotice
        description={labels.readOnlyDescription}
        id="admin-users-read-only"
        title={labels.readOnlyTitle}
      />
    </section>
  );
}

function settingsLimitNotice(
  visible: number,
  total: number,
  labels: AdminSettingsCopy,
) {
  return total > visible ? <p className="muted" role="status">{labels.limitNotice(visible, total)}</p> : null;
}

export function AdminSettingsView({
  canReadIntegrations,
  entitlementTotal,
  integrationTotal,
  itemLimit,
  labels,
  locale,
  settings,
}: {
  readonly canReadIntegrations: boolean;
  readonly entitlementTotal: number;
  readonly integrationTotal: number;
  readonly itemLimit: number;
  readonly labels: AdminSettingsCopy;
  readonly locale: Locale;
  readonly settings: AdminOrganizationSettings;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section aria-labelledby="admin-settings-title" className="stack">
      <header className="page-heading">
        <div>
          <h1 id="admin-settings-title">{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
      </header>

      <section aria-labelledby="organization-settings-heading" className={`panel ${styles.organizationPanel}`}>
        <header className={styles.cardHeader}>
          <div>
            <p className="muted">{labels.organization}</p>
            <h2 id="organization-settings-heading">{settings.organization.name}</h2>
          </div>
          <Badge tone={lifecycleTone(settings.organization.state)}>{labels.organizationStates[settings.organization.state]}</Badge>
        </header>
        <dl className={`${styles.facts} ${styles.organizationFacts}`}>
          <div><dt>{labels.slug}</dt><dd>{settings.organization.slug}</dd></div>
          <div><dt>{labels.status}</dt><dd>{labels.organizationStates[settings.organization.state]}</dd></div>
          <div><dt>{labels.region}</dt><dd>{settings.organization.dataResidencyRegion ?? labels.regionNotSet}</dd></div>
          <div><dt>{labels.updated}</dt><dd><time dateTime={settings.organization.updatedAt}>{dateTimeFormatter.format(new Date(settings.organization.updatedAt))}</time></dd></div>
        </dl>
      </section>

      <section aria-labelledby="organization-entitlements-heading" className={`panel ${styles.organizationPanel} ${styles.section}`}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="organization-entitlements-heading">{labels.entitlements}</h2>
            <p className="muted">{labels.entitlementsDescription}</p>
          </div>
        </header>
        {settings.entitlements.length === 0 ? (
          <p>{labels.noEntitlements}</p>
        ) : (
          <ol className={styles.settingsList}>
            {settings.entitlements.map((entitlement) => (
              <li className={styles.settingsRow} key={entitlement.id}>
                <div>
                  <p className="muted">{labels.capability}</p>
                  <h3>{entitlement.capability}</h3>
                  {entitlement.packageState ? <Badge tone={lifecycleTone(entitlement.packageState)}>{labels.packageStates[entitlement.packageState]}</Badge> : null}
                </div>
                <dl className={styles.settingsDetails}>
                  <div><dt>{labels.package}</dt><dd>{entitlement.packageLabel ?? entitlement.packageCode ?? labels.packageUnavailable}</dd></div>
                  <div><dt>{labels.scope}</dt><dd>{labels.scopes[entitlement.scope]}</dd></div>
                  <div><dt>{labels.source}</dt><dd>{labels.sources[entitlement.source]}</dd></div>
                  <div><dt>{labels.validFrom}</dt><dd><time dateTime={entitlement.validFrom}>{dateFormatter.format(new Date(entitlement.validFrom))}</time></dd></div>
                  <div><dt>{labels.validUntil}</dt><dd>{entitlement.validUntil ? <time dateTime={entitlement.validUntil}>{dateFormatter.format(new Date(entitlement.validUntil))}</time> : labels.noExpiry}</dd></div>
                </dl>
              </li>
            ))}
          </ol>
        )}
        {settingsLimitNotice(Math.min(itemLimit, settings.entitlements.length), entitlementTotal, labels)}
      </section>

      <section aria-labelledby="organization-integrations-heading" className={`panel ${styles.organizationPanel} ${styles.section}`}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="organization-integrations-heading">{labels.integrations}</h2>
            <p className="muted">{labels.integrationsDescription}</p>
          </div>
        </header>
        {!canReadIntegrations ? (
          <ManagementNotice
            description={labels.integrationPermissionDescription}
            id="admin-settings-integrations-forbidden"
            title={labels.integrationPermissionTitle}
            warning
          />
        ) : settings.integrations.length === 0 ? (
          <p>{labels.noIntegrations}</p>
        ) : (
          <ol className={styles.settingsList}>
            {settings.integrations.map((integration) => (
              <li className={styles.settingsRow} key={integration.id}>
                <div>
                  <p className="muted">{labels.provider}</p>
                  <h3>{integration.name}</h3>
                </div>
                <dl className={styles.settingsDetails}>
                  <div><dt>{labels.provider}</dt><dd>{labels.providerLabel(integration.provider)}</dd></div>
                  <div><dt>{labels.status}</dt><dd><Badge tone={lifecycleTone(integration.state)}>{labels.integrationStates[integration.state]}</Badge></dd></div>
                  <div><dt>{labels.updated}</dt><dd><time dateTime={integration.updatedAt}>{dateTimeFormatter.format(new Date(integration.updatedAt))}</time></dd></div>
                </dl>
              </li>
            ))}
          </ol>
        )}
        {canReadIntegrations ? settingsLimitNotice(Math.min(itemLimit, settings.integrations.length), integrationTotal, labels) : null}
      </section>

      <ManagementNotice
        description={labels.readOnlyDescription}
        id="admin-settings-read-only"
        title={labels.readOnlyTitle}
      />
    </section>
  );
}

export function AdminManagementLoading({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <section aria-busy="true" aria-live="polite" className="stack">
      <header className="page-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
      </header>
      <div aria-hidden="true" className={styles.skeletonGrid}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    </section>
  );
}
