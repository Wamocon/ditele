-- ═══════════════════════════════════════════════════════════════════════════
-- Praxiskurs Softwaretester Foundation Level
--
-- Generated from `docs/DiTeLeApp_UseCases.xlsx`, sheet `Deutsch`, rows 3–45
-- (Tage 1–43). Do not hand-edit: change the sheet, re-run the generator.
--
-- What the sheet says and where it lands:
--
--   Vorgeschichte                                 → task_localizations.instructions_html
--   Testfrage                                     → task_assessments.question_translations
--   Antwortmöglichkeiten für den Test             → task_options.labels
--   Richtige Antwort                              → task_option_answers.is_correct
--   Praktische Frage                              → the Arena task's instructions
--   Die richtige Antwort für den praktischen Teil → hunt_scenario_defects (answer
--                                                   key) + task_model_answers
--   Task hash                                     → hunt_scenarios.code, the shop
--                                                   link in hunt_scenarios.html and
--                                                   tasks.target_url
--
-- 47 tasks in one stage: 37 Arena tasks and
-- 10 knowledge tasks, in the sheet's own order. 37 Arena screens
-- (23 carry a planted defect; the other 14 are retests whose
-- correct outcome is "nothing to report").
--
-- ⚠️ Where a row has BOTH a question and a hash, the knowledge task carries
-- `required_hunt_scenario_id` — it stays locked until a trainer approves that
-- row's Arena submission. That is the "same row" link from the sheet.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The three accounts ─────────────────────────────────────────────────
-- Inserted plainly, WITHOUT the `seed_fixture` flag, so
-- `app_private.provision_registered_learner` fires and gives each of them a
-- profile, an organization membership and the learner role in the default
-- organisation. The elevated roles are added below; that trigger deliberately
-- never grants them.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  account.id, 'authenticated', 'authenticated', account.email,
  extensions.crypt('123123123', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', account.display_name, 'locale', 'de'),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  ('01991007-0000-7000-8000-000000000001'::uuid,   'admin1@gmail.com',   'Admin Eins'),
  ('01991007-0000-7000-8000-000000000002'::uuid, 'trainer1@gmail.com', 'Trainer Eins'),
  ('01991007-0000-7000-8000-000000000003'::uuid, 'student1@gmail.com', 'Student Eins')
) as account(id, email, display_name)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  updated_at = excluded.updated_at;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  account.id, account.id, account.email,
  jsonb_build_object('sub', account.id::text, 'email', account.email,
                     'email_verified', true),
  'email', statement_timestamp(), statement_timestamp(), statement_timestamp()
from auth.users account
where account.id in ('01991007-0000-7000-8000-000000000001', '01991007-0000-7000-8000-000000000002', '01991007-0000-7000-8000-000000000003')
on conflict (provider_id, provider) do update
set identity_data = excluded.identity_data, updated_at = excluded.updated_at;

-- `admin` is global (organization_id null) and opens the admin studio;
-- `content_admin` is the one that carries content.manage + content.publish,
-- which is what publishes this course at the end of the file.
insert into public.user_roles (id, user_id, role_id, organization_id, reason)
select grant_row.id, grant_row.user_id, role_record.id,
       case when grant_row.scoped then organization.id else null end,
       'Praxiskurs import'
from (values
  ('01991008-0000-7000-8000-000000000001'::uuid, '01991007-0000-7000-8000-000000000001'::uuid,   'admin'::text,   false),
  ('01991008-0000-7000-8000-000000000002'::uuid, '01991007-0000-7000-8000-000000000001'::uuid,   'content_admin', true),
  ('01991008-0000-7000-8000-000000000003'::uuid, '01991007-0000-7000-8000-000000000002'::uuid, 'trainer',       true)
) as grant_row(id, user_id, role_code, scoped)
join public.roles role_record on role_record.code = grant_row.role_code
cross join (
  select id from public.organizations
  where is_default and state = 'active' and archived_at is null
) organization
on conflict do nothing;


-- ─── 2. Milestone badges ───────────────────────────────────────────────────
-- Six, not one per task: a badge every day makes the wall of badges
-- meaningless. `rule` carries no `threshold`, so `evaluate_badge_rules` skips
-- them (it `continue`s when the threshold is null) and they can only ever be
-- awarded by `award_scenario_badge` when the named hunt is accepted.

insert into public.badges (id, organization_id, code, labels, descriptions, rule, state)
select badge.id,
       (select id from public.organizations
        where is_default and state = 'active' and archived_at is null),
       badge.code,
       jsonb_build_object('de', badge.label),
       jsonb_build_object('de', badge.description),
       '{"kind": "scenario"}'::jsonb,
       'active'
from (values
  ('01991006-0000-7000-8000-000000000001'::uuid, 'praxis-erster-fund', 'Erste Jagd', 'Deine erste Arena-Aufgabe im Praxiskurs wurde freigegeben.'),
  ('01991006-0000-7000-8000-000000000002'::uuid, 'praxis-benutzerkonto', 'Konto im Griff', 'Registrierung, Login und Passwort-Wiederherstellung geprüft.'),
  ('01991006-0000-7000-8000-000000000003'::uuid, 'praxis-katalog', 'Katalog geprüft', 'Sortierung, Suche, Filter und Bewertungen im Katalog geprüft.'),
  ('01991006-0000-7000-8000-000000000004'::uuid, 'praxis-warenkorb', 'Warenkorb-Wächter', 'Den Warenkorb bis zur fehlerfreien Fassung begleitet.'),
  ('01991006-0000-7000-8000-000000000005'::uuid, 'praxis-bestellung', 'Bestellung abgesichert', 'Bestellvorgang und Rückgabe vollständig nachgetestet.'),
  ('01991006-0000-7000-8000-000000000006'::uuid, 'praxis-abschluss', 'Praxiskurs abgeschlossen', 'Alle Arena-Aufgaben des Praxiskurses bestanden.')

) as badge(id, code, label, description)
on conflict (id) do update set
  labels = excluded.labels,
  descriptions = excluded.descriptions,
  state = excluded.state;


-- ─── 3–6. The content graph ────────────────────────────────────────────────
-- Wrapped in one block that returns early once this version is published.
-- After publication `guard_immutable_content_graph` refuses every write below,
-- so without this guard a second run of the file would abort halfway through
-- and leave the accounts created but nothing else touched.

do $content$
begin
if (select state from public.content_versions where id = '01991000-0000-7000-8000-000000000002')
   = 'published' then
  raise notice 'content version is already published — leaving the graph alone';
  return;
end if;


-- ─── 3. The course ─────────────────────────────────────────────────────────
-- `default_locale` must be `de`: `is_valid_public_catalog_snapshot` accepts
-- only `de` since the German-only pass, and a snapshot it rejects makes the
-- course vanish from the catalogue with no error anywhere.
--
-- Created as `draft`; §7 at the bottom publishes it and switches it to
-- `active`. `summary` and `description_html` are NOT NULL and are checked for
-- non-blankness by `assert_content_version_render_ready`, so they carry one
-- line each rather than being left empty as asked — everything genuinely
-- optional (cover image, duration, videos) is null.

insert into public.courses (
  id, organization_id, slug, state, default_locale, created_by
)
select '01991000-0000-7000-8000-000000000001', organization.id, 'praxiskurs-softwaretester-foundation-level', 'draft', 'de', '01991007-0000-7000-8000-000000000001'
from (
  select id from public.organizations
  where is_default and state = 'active' and archived_at is null
) organization
on conflict (id) do update set
  slug = excluded.slug, default_locale = excluded.default_locale;

-- `learning_outcomes` must be a NON-EMPTY array of non-blank strings:
-- `is_valid_public_catalog_snapshot` rejects an empty list, and a rejected
-- catalogue snapshot hides the course rather than raising anything. Measured
-- against the deployed function, not assumed — the studio stopped authoring
-- these, so it is easy to believe an empty list is fine. It is not.
insert into public.course_localizations (
  id, course_id, locale, title, summary, description_html, learning_outcomes
)
values (
  '01991000-0000-7000-8000-000000000004', '01991000-0000-7000-8000-000000000001', 'de', 'Praxiskurs Softwaretester Foundation Level',
  'Praktisches Testen eines Online-Shops in 43 Tagen.',
  '<p>Praktisches Testen eines Online-Shops in 43 Tagen — Theoriefragen und Arena-Aufgaben im Wechsel.</p>',
  jsonb_build_array(
    'Einen Online-Shop systematisch auf Fehler prüfen',
    'Gefundene Fehler als nachvollziehbares Ticket dokumentieren',
    'Fehlernachtests und Regressionstests durchführen',
    'Die Grundlagen des Softwaretestens nach ISTQB Foundation Level anwenden'
  )
)
on conflict (course_id, locale) do update set
  title = excluded.title,
  summary = excluded.summary,
  description_html = excluded.description_html,
  learning_outcomes = excluded.learning_outcomes;

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, created_by
)
values (
  '01991000-0000-7000-8000-000000000002', '01991000-0000-7000-8000-000000000001', 1, 'draft',
  'Import aus DiTeLeApp_UseCases.xlsx (Deutsch, Tage 1–43)', '01991007-0000-7000-8000-000000000001'
)
on conflict (course_id, version_number) do nothing;

insert into public.stages (id, course_id, content_version_id, position, state)
values ('01991000-0000-7000-8000-000000000003', '01991000-0000-7000-8000-000000000001', '01991000-0000-7000-8000-000000000002', 0, 'draft')
on conflict (id) do nothing;

insert into public.stage_localizations (id, stage_id, locale, title, description_html)
values (
  '01991000-0000-7000-8000-000000000005', '01991000-0000-7000-8000-000000000003', 'de', 'Praxiskurs Softwaretester Foundation Level',
  '<p>Alle 43 Tage des Praxiskurses in der Reihenfolge des Kursplans.</p>'
)
on conflict (stage_id, locale) do update set
  title = excluded.title, description_html = excluded.description_html;


-- ─── 4. The Arena screens ──────────────────────────────────────────────────
-- One per Task hash. `html` holds the link to the shop, as asked. It is a
-- SMALL screen on purpose: the shop needs its own session, and the Arena
-- sandbox runs `sandbox="allow-scripts"` with no `allow-same-origin`, so a
-- shop loaded inside it would have no cookies and no login. The learner
-- therefore reaches the shop through `tasks.target_url` (§5), which renders in
-- the workspace's practice panel with a real "open in a new tab" button.

insert into public.hunt_scenarios (
  id, organization_id, code, scenario_version, title, description,
  html, expected_findings, reward_badge_id, state
)
select scenario.id,
       (select id from public.organizations
        where is_default and state = 'active' and archived_at is null),
       scenario.code, 1, scenario.title, scenario.description,
       scenario.html, scenario.expected_findings,
       (select id from public.badges
        where code = scenario.badge_code
          and organization_id is not distinct from (
            select id from public.organizations
            where is_default and state = 'active' and archived_at is null)),
       'active'
from (values
  ('01991003-0000-7000-8000-000000000001'::uuid, '11ed', 'Lieferadressen anlegen und ändern', 'Teste die Funktion zum Erstellen und Ändern von Lieferadressen auf der Website. Melde dich mit den Daten an, die du zuvor verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass du eine neue Lieferadresse erstellen und bereits vorhandene Adressen bearbeiten kannst.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Lieferadressen anlegen und ändern</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Lieferadressen anlegen und ändern</h1>
  <p>Teste die Funktion zum Erstellen und Ändern von Lieferadressen auf der Website. Melde dich mit den Daten an, die du zuvor verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass du eine neue Lieferadresse erstellen und bereits vorhandene Adressen bearbeiten kannst.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=11ed">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=11ed</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000002'::uuid, '1e0p', 'Kontaktdaten im Benutzerkonto ändern', 'Teste die Funktion zur Änderung der Kontaktdaten des Nutzers im Benutzerbereich auf der Website. Melde dich dazu mit den Daten an, die du vorher verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass alle Kontaktdaten bearbeitet und korrekt gespeichert werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Kontaktdaten im Benutzerkonto ändern</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Kontaktdaten im Benutzerkonto ändern</h1>
  <p>Teste die Funktion zur Änderung der Kontaktdaten des Nutzers im Benutzerbereich auf der Website. Melde dich dazu mit den Daten an, die du vorher verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass alle Kontaktdaten bearbeitet und korrekt gespeichert werden.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=1e0p">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=1e0p</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000003'::uuid, '34mc', 'Favoritenliste — Fehlernachtest', 'Auf der Website teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste, indem du szenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen eines Produkts, das Entfernen eines Produkts aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Testbericht bei.

Testschritte
Testszenarien
Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt wird erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Angeben, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.
Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wird erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Angeben, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.
Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Angeben, wenn nicht alle hinzugefügten Produkte angezeigt werden.',
   '<!doctype html>
<meta charset="utf-8">
<title>Favoritenliste — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Favoritenliste — Fehlernachtest</h1>
  <p>Auf der Website teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste, indem du szenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen eines Produkts, das Entfernen eines Produkts aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Testbericht bei.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=34mc">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=34mc</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000004'::uuid, '367y', 'Navigation im Footer', 'Teste die Navigation im Footer der Website. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Navigation im Footer</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Navigation im Footer</h1>
  <p>Teste die Navigation im Footer der Website. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=367y">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=367y</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000005'::uuid, '3h59', 'Warenrückgabe', 'Tätige eine Bestellung auf der Website und teste daraufhin die Funktion zur Rückgabe von Waren. 

Erstelle nach Abschluss des Tests eine Karte in Jira und füge den Bericht über die durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Warenrückgabe</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Warenrückgabe</h1>
  <p>Tätige eine Bestellung auf der Website und teste daraufhin die Funktion zur Rückgabe von Waren.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=3h59">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=3h59</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000006'::uuid, '3r8y', 'Produktsortierung auf der Kategorieseite', 'Teste die Funktion zur Sortierung von Produkten auf der Kategorieseite auf der Website. Die Produkte sollten nach Name, Preis, Bewertung und Modell sortiert werden. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Produktsortierung auf der Kategorieseite</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Produktsortierung auf der Kategorieseite</h1>
  <p>Teste die Funktion zur Sortierung von Produkten auf der Kategorieseite auf der Website. Die Produkte sollten nach Name, Preis, Bewertung und Modell sortiert werden. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=3r8y">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=3r8y</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000007'::uuid, '3v60', 'Warenkorb — Fehlernachtest', 'Hallo! Heute testen wir die Funktionalität des Warenkorbs auf der Website erneut. Unser Ziel ist es, sicherzustellen, dass der Fehler, der zu einer falschen Anzeige der Artikelanzahl im Warenkorb führte, behoben wurde.

Beim letzten Test wurde ein Problem festgestellt, bei dem beim Hinzufügen mehrerer Artikel zum Warenkorb nur ein Artikel angezeigt wurde. Vielen Dank für deinen Einsatz beim Testen, der dazu beigetragen hat, dieses Problem zu identifizieren.',
   '<!doctype html>
<meta charset="utf-8">
<title>Warenkorb — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Warenkorb — Fehlernachtest</h1>
  <p>Hallo! Heute testen wir die Funktionalität des Warenkorbs auf der Website erneut. Unser Ziel ist es, sicherzustellen, dass der Fehler, der zu einer falschen Anzeige der Artikelanzahl im Warenkorb führte, behoben wurde.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=3v60">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=3v60</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000008'::uuid, '3vy6', 'Filterfunktion auf der Kategorieseite', 'Teste die Filterfunktion auf der Kategorieseite der Website. Überprüfe, ob die Filterung korrekt funktioniert und Nutzern ermöglicht, die gewünschten Produkte präzise auszuwählen.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Filterfunktion auf der Kategorieseite</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Filterfunktion auf der Kategorieseite</h1>
  <p>Teste die Filterfunktion auf der Kategorieseite der Website. Überprüfe, ob die Filterung korrekt funktioniert und Nutzern ermöglicht, die gewünschten Produkte präzise auszuwählen.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=3vy6">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=3vy6</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000009'::uuid, '47h5', 'Breadcrumb-Navigation', 'Bitte teste die Funktionalität der Breadcrumb-Navigation auf der gesamten Website. Besuche verschiedene Seiten und stelle sicher, dass die Links korrekt funktionieren und die Breadcrumb-Navigation korrekt angezeigt wird.

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   '<!doctype html>
<meta charset="utf-8">
<title>Breadcrumb-Navigation</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Breadcrumb-Navigation</h1>
  <p>Bitte teste die Funktionalität der Breadcrumb-Navigation auf der gesamten Website. Besuche verschiedene Seiten und stelle sicher, dass die Links korrekt funktionieren und die Breadcrumb-Navigation korrekt angezeigt wird.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=47h5">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=47h5</p>
</main>
',
   0, 'praxis-abschluss'),
  ('01991003-0000-7000-8000-000000000010'::uuid, '4c57', 'Kontaktformular', 'Teste die Funktionalität des Kontaktformulars auf der Website. Stelle sicher, dass die Daten vor dem Absenden auf Vollständigkeit und Inhalt überprüft werden. Bei fehlerhaften Daten sollte das Absenden nicht erfolgen.

Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Kontaktformular</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Kontaktformular</h1>
  <p>Teste die Funktionalität des Kontaktformulars auf der Website. Stelle sicher, dass die Daten vor dem Absenden auf Vollständigkeit und Inhalt überprüft werden. Bei fehlerhaften Daten sollte das Absenden nicht erfolgen.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=4c57">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=4c57</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000011'::uuid, '57wv', 'Navigation im Header', 'Teste die Funktionsweise des Navigationsmenüs im oberen Bereich der Website (Header). Stelle sicher, dass alle Textlinks, Icons und das Logo korrekt funktionieren und auf die richtigen Seiten verweisen. Es dürfen keine defekten Links vorhanden sein.

Klicke auf jeden Textlink im Menü.
Erwartetes Ergebnis: Jeder Textlink führt auf die entsprechende Seite.
Tatsächliches Ergebnis: Dokumentiere, wenn ein Link nicht korrekt funktioniert, und gib an, welcher Link betroffen ist.

Klicke auf jedes Icon im Menü.
Erwartetes Ergebnis: Jedes Icon führt auf die richtige Seite.
Tatsächliches Ergebnis: Beschreibe, wenn ein Icon nicht wie erwartet funktioniert.

Überprüfe das Logo, indem du darauf klickst.
Erwartetes Ergebnis: Das Logo führt zurück zur Startseite.
Tatsächliches Ergebnis: Notiere, falls das Logo nicht wie erwartet funktioniert.

Nach dem Test erstelle ein Jira-Ticket und füge den Testbericht sowie den Link zum Ticket hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Navigation im Header</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Navigation im Header</h1>
  <p>Teste die Funktionsweise des Navigationsmenüs im oberen Bereich der Website (Header). Stelle sicher, dass alle Textlinks, Icons und das Logo korrekt funktionieren und auf die richtigen Seiten verweisen. Es dürfen keine defekten Links vorhanden sein.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=57wv">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=57wv</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000012'::uuid, '5qmu', 'Warenkorb — zweiter Fehlernachtest', 'Teste die Funktionalität des Warenkorbs auf der Website erneut. Wähle einen beliebigen Artikel aus dem Katalog aus und füge ihn dem Warenkorb hinzu. Stelle sicher, dass der Artikel erfolgreich hinzugefügt wird.

Gehe anschließend zur Warenkorbseite und überprüfe, ob alle Daten zu den Artikeln korrekt in der Tabelle angezeigt werden, einschließlich Artikelbezeichnungen, Menge, Preis und Gesamtbetrag.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Warenkorb — zweiter Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Warenkorb — zweiter Fehlernachtest</h1>
  <p>Teste die Funktionalität des Warenkorbs auf der Website erneut. Wähle einen beliebigen Artikel aus dem Katalog aus und füge ihn dem Warenkorb hinzu. Stelle sicher, dass der Artikel erfolgreich hinzugefügt wird.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=5qmu">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=5qmu</p>
</main>
',
   0, 'praxis-warenkorb'),
  ('01991003-0000-7000-8000-000000000013'::uuid, '5v4t', 'Warenrückgabe — Regressionstest', 'Bitte tätige eine Bestellung auf der Website und teste anschließlich die Rückgabefunktion erneut. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Testbericht bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Warenrückgabe — Regressionstest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Warenrückgabe — Regressionstest</h1>
  <p>Bitte tätige eine Bestellung auf der Website und teste anschließlich die Rückgabefunktion erneut.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=5v4t">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=5v4t</p>
</main>
',
   0, 'praxis-bestellung'),
  ('01991003-0000-7000-8000-000000000014'::uuid, '5vv6', 'Bestellvorgang — Fehlernachtest', 'Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast. 

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Bestellvorgang — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Bestellvorgang — Fehlernachtest</h1>
  <p>Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=5vv6">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=5vv6</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000015'::uuid, '6n39', 'Filterfunktion — Fehlernachtest', 'Teste die Filterfunktion auf der Kategorieseite der Website erneut. Überprüfe, ob die Filterung korrekt funktioniert.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Filterfunktion — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Filterfunktion — Fehlernachtest</h1>
  <p>Teste die Filterfunktion auf der Kategorieseite der Website erneut. Überprüfe, ob die Filterung korrekt funktioniert.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=6n39">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=6n39</p>
</main>
',
   0, 'praxis-katalog'),
  ('01991003-0000-7000-8000-000000000016'::uuid, '7ctc', 'Registrierungsformular — Fehlernachtest', 'Teste das Registrierungsformular der Website erneut, um zu prüfen, ob die Behebung erfolgreich ist.

Erstelle wieder ein Konto. Stelle sicher, dass bei der Bestätigung der Registrierung eine Validierung erfolgt und fehlerhafte Eingaben deutlich markiert werden. 

Das Formular muss den folgenden Anforderungen entsprechen:

Der Vorname sollte zwischen 1 und 32 Zeichen lang sein.
Der Nachname sollte zwischen 1 und 32 Zeichen lang sein.
Die E-Mail-Adresse muss ein @-Zeichen enthalten.
Die Telefonnummer sollte zwischen 3 und 32 Zeichen lang sein.
Das Passwort sollte zwischen 4 und 20 Zeichen lang sein.
Das Kontrollkästchen für die Datenschutzrichtlinie muss angekreuzt sein.

Alle Abweichungen vom definierten Szenario sind wieder in einem JIRA-Ticket zu dokumentieren und der entsprechende Link in der Rückmeldung zu hinterlegen.',
   '<!doctype html>
<meta charset="utf-8">
<title>Registrierungsformular — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Registrierungsformular — Fehlernachtest</h1>
  <p>Teste das Registrierungsformular der Website erneut, um zu prüfen, ob die Behebung erfolgreich ist.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=7ctc">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=7ctc</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000017'::uuid, '90s7', 'Produktsuche', 'Teste die Produktsuchfunktion auf der Website. Führe die Suche durch, indem du ein Schlüsselwort oder eine Phrase eingibst, die mit den Produkten im Katalog übereinstimmt, und überprüfe, ob die angezeigten Suchergebnisse deinem Suchbegriff entsprechen.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Link zum Bericht der durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Produktsuche</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Produktsuche</h1>
  <p>Teste die Produktsuchfunktion auf der Website. Führe die Suche durch, indem du ein Schlüsselwort oder eine Phrase eingibst, die mit den Produkten im Katalog übereinstimmt, und überprüfe, ob die angezeigten Suchergebnisse deinem Suchbegriff entsprechen.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=90s7">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=90s7</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000018'::uuid, '945u', 'Bestellvorgang ohne Anmeldung', 'Teste die Funktionalität des Bestellvorgangs auf der Website ohne Anmeldung. Füge mehrere Artikel zum Warenkorb hinzu und navigiere zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich Liefer- und Zahlungsdaten, und schließe den Bestellvorgang ab.

Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und eine Bestätigung angezeigt wird. Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Bestellvorgang ohne Anmeldung</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Bestellvorgang ohne Anmeldung</h1>
  <p>Teste die Funktionalität des Bestellvorgangs auf der Website ohne Anmeldung. Füge mehrere Artikel zum Warenkorb hinzu und navigiere zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich Liefer- und Zahlungsdaten, und schließe den Bestellvorgang ab.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=945u">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=945u</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000019'::uuid, '94fh', 'Produktbewertungen erstellen', 'Teste die Funktion zum Erstellen von Produktbewertungen auf der Website. Stelle sicher, dass es möglich ist, eine Bewertung, einen Namen und einen Kommentar zu hinterlassen. Überprüfe, dass keine Daten gesendet werden, wenn Felder leer bleiben.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Produktbewertungen erstellen</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Produktbewertungen erstellen</h1>
  <p>Teste die Funktion zum Erstellen von Produktbewertungen auf der Website. Stelle sicher, dass es möglich ist, eine Bewertung, einen Namen und einen Kommentar zu hinterlassen. Überprüfe, dass keine Daten gesendet werden, wenn Felder leer bleiben.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=94fh">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=94fh</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000020'::uuid, '9jv8', 'Favoritenliste — zweiter Fehlernachtest', 'Teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste auf der Website, indem du testszenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste und die Überprüfung der Anzeige von Produkten. Stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss des Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.

Testschritte
Testszenarien
Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt wird erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gib an, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.
Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wird erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gib an, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.
Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Gib an, wenn nicht alle hinzugefügten Produkte angezeigt werden.',
   '<!doctype html>
<meta charset="utf-8">
<title>Favoritenliste — zweiter Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Favoritenliste — zweiter Fehlernachtest</h1>
  <p>Teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste auf der Website, indem du testszenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste und die Überprüfung der Anzeige von Produkten. Stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss des Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=9jv8">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=9jv8</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000021'::uuid, '9nft', 'Funktion „Passwort vergessen“', 'Teste die Funktion "Passwort vergessen" auf der Website. Versuche, das Passwort für dein Konto mithilfe der Funktion "Passwort vergessen" zurückzusetzen. Stelle sicher, dass der Passwort-Rücksetzprozess erfolgreich verläuft und dass du dich mit dem neuen Passwort in dein Konto einloggen kannst. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Funktion „Passwort vergessen“</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Funktion „Passwort vergessen“</h1>
  <p>Teste die Funktion "Passwort vergessen" auf der Website. Versuche, das Passwort für dein Konto mithilfe der Funktion "Passwort vergessen" zurückzusetzen. Stelle sicher, dass der Passwort-Rücksetzprozess erfolgreich verläuft und dass du dich mit dem neuen Passwort in dein Konto einloggen kannst. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=9nft">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=9nft</p>
</main>
',
   1, 'praxis-benutzerkonto'),
  ('01991003-0000-7000-8000-000000000022'::uuid, 'c02w', 'Vergleichsliste — Fehlernachtest', 'Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. 

Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Vergleichsliste — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Vergleichsliste — Fehlernachtest</h1>
  <p>Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=c02w">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=c02w</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000023'::uuid, 'c12p', 'Vergleichsliste', 'Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Vergleichsliste</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Vergleichsliste</h1>
  <p>Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=c12p">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=c12p</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000024'::uuid, 'c3yw', 'Bestellhistorie', 'Teste die Funktionalität der Bestellhistorie und stelle sicher, dass die Bestellhistorie im persönlichen Bereich korrekt angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung. 

Erstelle nach Abschluss des Tests einen Testbericht Jira und füge den Link zu diesem bei.',
   '<!doctype html>
<meta charset="utf-8">
<title>Bestellhistorie</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Bestellhistorie</h1>
  <p>Teste die Funktionalität der Bestellhistorie und stelle sicher, dass die Bestellhistorie im persönlichen Bereich korrekt angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=c3yw">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=c3yw</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000025'::uuid, 'c3yw-2', 'Bestellhistorie — Fehlernachtest', 'Teste die Funktionalität der Bestellhistorie erneut und stelle sicher, dass die Bestellhistorie korrekt im Benutzerkonto angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung. 

Nach Abschluss des Tests sollst du einen Testbericht in Jira erstellen und den Link von diesem hier anhängen.',
   '<!doctype html>
<meta charset="utf-8">
<title>Bestellhistorie — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Bestellhistorie — Fehlernachtest</h1>
  <p>Teste die Funktionalität der Bestellhistorie erneut und stelle sicher, dass die Bestellhistorie korrekt im Benutzerkonto angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=c3yw">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=c3yw</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000026'::uuid, 'c9mc', 'Benutzererfahrung auf der Artikelseite', 'Teste die Benutzererfahrung auf der Artikelseite im Blogbereich, um sicherzustellen, dass die Website benutzerfreundlich und einfach zu bedienen ist.

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   '<!doctype html>
<meta charset="utf-8">
<title>Benutzererfahrung auf der Artikelseite</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Benutzererfahrung auf der Artikelseite</h1>
  <p>Teste die Benutzererfahrung auf der Artikelseite im Blogbereich, um sicherzustellen, dass die Website benutzerfreundlich und einfach zu bedienen ist.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=c9mc">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=c9mc</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000027'::uuid, 'cnb2', 'Bildansicht auf der Produktdetailseite', 'Teste den Bildansichtsmodus auf der Produktdetailseite der Website. Stelle sicher, dass alle Bilder korrekt geladen werden und in der erwarteten Qualität angezeigt werden. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Bildansicht auf der Produktdetailseite</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Bildansicht auf der Produktdetailseite</h1>
  <p>Teste den Bildansichtsmodus auf der Produktdetailseite der Website. Stelle sicher, dass alle Bilder korrekt geladen werden und in der erwarteten Qualität angezeigt werden. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests hinzu.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=cnb2">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=cnb2</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000028'::uuid, 'eit8', 'Login-Formular', 'Registriere ein Konto und führe das Testen des Login-Formulars auf der Website durch, indem du die bei der Registrierung angegebenen Daten verwendest. Stelle sicher, dass der Zugriff auf das Konto nur mit korrekten Daten möglich ist, und überprüfe, ob die Benutzeroberfläche der Website komfortabel zu nutzen ist.

Alle Abweichungen vom Szenario oder visuelle Probleme müssen in einem JIRA-Ticket festgehalten werden. Der Link zum Ticket ist in der Antwort beizufügen.',
   '<!doctype html>
<meta charset="utf-8">
<title>Login-Formular</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Login-Formular</h1>
  <p>Registriere ein Konto und führe das Testen des Login-Formulars auf der Website durch, indem du die bei der Registrierung angegebenen Daten verwendest. Stelle sicher, dass der Zugriff auf das Konto nur mit korrekten Daten möglich ist, und überprüfe, ob die Benutzeroberfläche der Website komfortabel zu nutzen ist.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=eit8">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=eit8</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000029'::uuid, 'mc8h', 'Markenseite', 'Überprüfe die Funktionalität der Markenseite. Stelle sicher, dass die alphabetische Sortierung der Marken korrekt funktioniert und dass Ankerlinks zu jedem Buchstaben ordnungsgemäß funktionieren. Überprüfe außerdem, ob die Links zu den Marken auf die entsprechenden Produktseiten führen. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   '<!doctype html>
<meta charset="utf-8">
<title>Markenseite</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Markenseite</h1>
  <p>Überprüfe die Funktionalität der Markenseite. Stelle sicher, dass die alphabetische Sortierung der Marken korrekt funktioniert und dass Ankerlinks zu jedem Buchstaben ordnungsgemäß funktionieren. Überprüfe außerdem, ob die Links zu den Marken auf die entsprechenden Produktseiten führen.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=mc8h">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=mc8h</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000030'::uuid, 'nvy7', 'Blogseite — Fehlernachtest', 'Teste die Funktionalität der Blogseite erneut und stelle sicher, dass die Funktionen zur Anzeige von Artikeln (List und Grid), sowie das Limit für die Anzeige von Artikeln auf einer Seite funktionieren. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   '<!doctype html>
<meta charset="utf-8">
<title>Blogseite — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Blogseite — Fehlernachtest</h1>
  <p>Teste die Funktionalität der Blogseite erneut und stelle sicher, dass die Funktionen zur Anzeige von Artikeln (List und Grid), sowie das Limit für die Anzeige von Artikeln auf einer Seite funktionieren.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=nvy7">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=nvy7</p>
</main>
',
   0, null),
  ('01991003-0000-7000-8000-000000000031'::uuid, 'ny5c', 'Warenkorb', 'Führe einen Funktionstest des Warenkorbs auf der Website durch. Wähle ein beliebiges Produkt aus dem Katalog aus und füge es dem Warenkorb hinzu, um sicherzustellen, dass das Produkt erfolgreich hinzugefügt wird.

Gehe anschließend zur Warenkorbseite und überprüfe, ob alle Daten zu den Produkten korrekt in der Tabelle angezeigt werden, einschließlich Produktname, Menge, Preis und Gesamtsumme.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Bericht der durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Warenkorb</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Warenkorb</h1>
  <p>Führe einen Funktionstest des Warenkorbs auf der Website durch. Wähle ein beliebiges Produkt aus dem Katalog aus und füge es dem Warenkorb hinzu, um sicherzustellen, dass das Produkt erfolgreich hinzugefügt wird.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=ny5c">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=ny5c</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000032'::uuid, 'p3gn', 'Testimonial-Slider auf der Startseite', 'Teste die Funktion des Testimonial-Sliders auf der Startseite der Website.

Stelle sicher, dass er beim Klicken auf die Navigationspfeile korrekt wechselt.

Dokumentiere nach dem Test die Ergebnisse, indem du die durchgeführten Schritte und mögliche entdeckte Fehler präzise festhältst."',
   '<!doctype html>
<meta charset="utf-8">
<title>Testimonial-Slider auf der Startseite</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Testimonial-Slider auf der Startseite</h1>
  <p>Teste die Funktion des Testimonial-Sliders auf der Startseite der Website.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=p3gn">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=p3gn</p>
</main>
',
   1, 'praxis-erster-fund'),
  ('01991003-0000-7000-8000-000000000033'::uuid, 'qy5c', 'Favoritenliste — szenariobasiertes Testen', 'Teste auf der Website die Funktion zum Hinzufügen von Produkten zur Favoritenliste unter Verwendung von szenariobasierten Tests. Liste einige typische Nutzungsszenarien auf, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.

Testschritte
Szenarien

Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "In die Favoritenliste hinzufügen".
Erwartetes Ergebnis: Das Produkt wurde erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gebe an, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.

Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wurde erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gebe an, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.

Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Gebe an, wenn nicht alle hinzugefügten Produkte angezeigt werden.',
   '<!doctype html>
<meta charset="utf-8">
<title>Favoritenliste — szenariobasiertes Testen</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Favoritenliste — szenariobasiertes Testen</h1>
  <p>Teste auf der Website die Funktion zum Hinzufügen von Produkten zur Favoritenliste unter Verwendung von szenariobasierten Tests. Liste einige typische Nutzungsszenarien auf, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=qy5c">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=qy5c</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000034'::uuid, 'rw6e', 'Registrierungsformular', 'Teste das Registrierungsformular der Website, indem du ein Konto erstellst. Stelle sicher, dass bei der Bestätigung der Registrierung eine Validierung erfolgt und fehlerhafte Eingaben deutlich markiert werden. 

Das Formular muss folgende Anforderungen erfüllen:

Der Vorname sollte zwischen 1 und 32 Zeichen lang sein.
Der Nachname sollte zwischen 1 und 32 Zeichen lang sein.
Die E-Mail-Adresse muss ein @-Zeichen enthalten.
Die Telefonnummer sollte zwischen 3 und 32 Zeichen lang sein.
Das Passwort sollte zwischen 4 und 20 Zeichen lang sein.
Das Kontrollkästchen für die Datenschutzrichtlinie muss angekreuzt sein.

Alle Abweichungen vom definierten Szenario sind in einem JIRA-Ticket zu dokumentieren und der entsprechende Link in der Rückmeldung zu hinterlegen.',
   '<!doctype html>
<meta charset="utf-8">
<title>Registrierungsformular</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Registrierungsformular</h1>
  <p>Teste das Registrierungsformular der Website, indem du ein Konto erstellst. Stelle sicher, dass bei der Bestätigung der Registrierung eine Validierung erfolgt und fehlerhafte Eingaben deutlich markiert werden.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=rw6e">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=rw6e</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000035'::uuid, 'v3qy', 'Navigation im Header — Fehlernachtest', 'Teste die Navigation im Header der Website erneut. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Navigation im Header — Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Navigation im Header — Fehlernachtest</h1>
  <p>Teste die Navigation im Header der Website erneut. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=v3qy">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=v3qy</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000036'::uuid, 'w5vw', 'Blogseite — List- und Grid-Ansicht', 'Teste die Funktionalität der Blogseite. Stelle sicher, dass die Anzeige von Artikeln im List- und Grid-Format korrekt funktioniert und dass das Limit für die Anzeige von Artikeln auf einer Seite eingehalten wird. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   '<!doctype html>
<meta charset="utf-8">
<title>Blogseite — List- und Grid-Ansicht</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Blogseite — List- und Grid-Ansicht</h1>
  <p>Teste die Funktionalität der Blogseite. Stelle sicher, dass die Anzeige von Artikeln im List- und Grid-Format korrekt funktioniert und dass das Limit für die Anzeige von Artikeln auf einer Seite eingehalten wird.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=w5vw">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=w5vw</p>
</main>
',
   1, null),
  ('01991003-0000-7000-8000-000000000037'::uuid, 'y5ym', 'Bestellvorgang — zweiter Fehlernachtest', 'Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast. 

Erstelle nach Abschluss des Tests eine Karte in Jira und füge den Link zum Testbericht hinzu.',
   '<!doctype html>
<meta charset="utf-8">
<title>Bestellvorgang — zweiter Fehlernachtest</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .code { font: 13px ui-monospace, monospace; opacity: .7; }
  a.cta { display: inline-block; padding: 12px 20px; border-radius: 10px;
           background: #1f6feb; color: #fff; text-decoration: none;
           font-weight: 600; }
  a.cta:hover { background: #1a5fd0; }
</style>
<main>
  <h1>Bestellvorgang — zweiter Fehlernachtest</h1>
  <p>Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast.</p>
  <p><a class="cta" href="https://shop.ditele-learn.ai/?taskid=y5ym">Testshop öffnen</a></p>
  <p class="code">https://shop.ditele-learn.ai/?taskid=y5ym</p>
</main>
',
   0, null)

) as scenario(id, code, title, description, html, expected_findings, badge_code)
on conflict on constraint hunt_scenarios_code_version_unique do update set
  title = excluded.title,
  description = excluded.description,
  html = excluded.html,
  expected_findings = excluded.expected_findings,
  reward_badge_id = excluded.reward_badge_id,
  state = excluded.state,
  row_version = public.hunt_scenarios.row_version + 1,
  updated_at = statement_timestamp();


-- The answer key. Never sent into the sandbox — the trainer's "2 von 5
-- gefunden" match is made against these rows, which is why the defect is
-- structured data and not prose in the task description.
--
-- `expected_behaviour` is the sheet's own "Die richtige Antwort für den
-- praktischen Teil", verbatim: the title is my summary, and a trainer deciding
-- a finding should be able to read what the author actually wrote.

insert into public.hunt_scenario_defects (
  id, scenario_id, code, position, title, location_hint,
  expected_behaviour, reproduction, severity
)
select defect.id,
       (select id from public.hunt_scenarios
        where code = defect.scenario_code
        order by scenario_version desc limit 1),
       defect.code, 0, defect.title, defect.location_hint,
       defect.expected_behaviour, defect.reproduction, defect.severity
from (values
  ('01991004-0000-7000-8000-000000000001'::uuid, '11ed', '11ed-1', 'Lieferadresse lässt sich nicht bearbeiten',
   'Benutzerkonto — Lieferadressen', 'Der Student fügt in Jira einen Link an das Ticket an.

Eine Adresse kann erstellt werden, aber sie lässt sich nicht bearbeiten.',
   'Teste die Funktion zum Erstellen und Ändern von Lieferadressen auf der Website. Melde dich mit den Daten an, die du zuvor verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass du eine neue Lieferadresse erstellen und bereits vorhandene Adressen bearbeiten kannst.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.', 'medium'),
  ('01991004-0000-7000-8000-000000000002'::uuid, '1e0p', '1e0p-1', 'E-Mail-Feld im Benutzerkonto lässt sich nicht bearbeiten',
   'Benutzerkonto — Kontaktdaten', 'Der Student fügt in Jira einen Link an die Karte an.  
Das E-Mail-Feld kann nicht bearbeitet werden',
   'Teste die Funktion zur Änderung der Kontaktdaten des Nutzers im Benutzerbereich auf der Website. Melde dich dazu mit den Daten an, die du vorher verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass alle Kontaktdaten bearbeitet und korrekt gespeichert werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.', 'medium'),
  ('01991004-0000-7000-8000-000000000003'::uuid, '34mc', '34mc-1', 'Produkte werden nicht zur Favoritenliste hinzugefügt',
   'Produktseite — „Zu Favoriten hinzufügen“', 'Der Student erstellt einen Bug als Ticket in Jira.

Titel: Produkte werden nicht zur Favoritenliste hinzugefügt
Beschreibung: Beim Versuch, Produkte zur Favoritenliste hinzuzufügen, werden diese nicht hinzugefügt.

Schritte zur Reproduktion:

Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt sollte zur Favoritenliste hinzugefügt werden.
Tatsächliches Ergebnis: Das Produkt wird nicht hinzugefügt.

Status: Das Ticket wurde an den Entwickler zur Fehlerbehebung weitergeleitet.

Empfehlungen für das "White-Box"-Testing:
Verfahrenstyp: Befehlsabdeckung (die einfachste Art des "White-Box"-Testings).',
   'Auf der Website teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste, indem du szenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen eines Produkts, das Entfernen eines Produkts aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Testbericht bei.

Testschritte
Testszenarien
Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt wird erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Angeben, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.
Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wird erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Angeben, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.
Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Angeben, wenn nicht alle hinzugefügten Produkte angezeigt werden.', 'high'),
  ('01991004-0000-7000-8000-000000000004'::uuid, '3h59', '3h59-1', 'Die Rückgabeseite leitet auf die Startseite um',
   'Warenrückgabe', 'Der Student fügt den Link zum Ticket, in Jira, hinzu. 

Es ist unmöglich, mit der Rückgabe von Waren auf die entsrechende Seite zuzugreifen; die Weiterleitung erfolgt stattdessen auf die Hauptseite.',
   'Tätige eine Bestellung auf der Website und teste daraufhin die Funktion zur Rückgabe von Waren. 

Erstelle nach Abschluss des Tests eine Karte in Jira und füge den Bericht über die durchgeführten Tests hinzu.', 'high'),
  ('01991004-0000-7000-8000-000000000005'::uuid, '3v60', '3v60-1', 'Artikel lassen sich nicht mehr in den Warenkorb legen',
   'Warenkorb', 'Der Student fügt den Link im Bug-Ticket in Jira hinzu.

Der Fehler hat sich verschlimmert: Artikel können jetzt überhaupt nicht mehr zum Warenkorb hinzugefügt werden.',
   'Hallo! Heute testen wir die Funktionalität des Warenkorbs auf der Website erneut. Unser Ziel ist es, sicherzustellen, dass der Fehler, der zu einer falschen Anzeige der Artikelanzahl im Warenkorb führte, behoben wurde.

Beim letzten Test wurde ein Problem festgestellt, bei dem beim Hinzufügen mehrerer Artikel zum Warenkorb nur ein Artikel angezeigt wurde. Vielen Dank für deinen Einsatz beim Testen, der dazu beigetragen hat, dieses Problem zu identifizieren.', 'critical'),
  ('01991004-0000-7000-8000-000000000006'::uuid, '3vy6', '3vy6-1', 'Filter greift nicht — Produkte werden nicht gefiltert',
   'Kategorieseite — Filter', 'Der Student fügt den Link zum Jira-Ticket hinzu.

Die Filterfunktion arbeitet nicht korrekt; Produkte werden überhaupt nicht gefiltert.',
   'Teste die Filterfunktion auf der Kategorieseite der Website. Überprüfe, ob die Filterung korrekt funktioniert und Nutzern ermöglicht, die gewünschten Produkte präzise auszuwählen.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.', 'high'),
  ('01991004-0000-7000-8000-000000000007'::uuid, '57wv', '57wv-1', 'Die Links „Über uns“ und „Blog“ funktionieren nicht',
   'Header — Navigationsmenü', 'Der Student hat einen Link zum Ticket in Jira hinzugefügt.

Erstelle ein Fehler-Ticket in Jira:

Titel: Die Links „Über uns“ und „Blog“ funktionieren nicht
Beschreibung: Die Links „Über uns“ und „Blog“ im Navigationsmenü sind nicht funktionsfähig.

Schritte zur Reproduktion:

Gehe zur Startseite der Website.
Klicke auf den Link „Über uns“.
Klicke auf den Link „Blog“.

Erwartetes Ergebnis: Die Links sollten auf die entsprechenden Seiten führen.
Tatsächliches Ergebnis: Die Links führen zu einem Fehler oder funktionieren nicht.
Die Links „Über uns“ und „Blog“ funktionieren nicht.',
   'Teste die Funktionsweise des Navigationsmenüs im oberen Bereich der Website (Header). Stelle sicher, dass alle Textlinks, Icons und das Logo korrekt funktionieren und auf die richtigen Seiten verweisen. Es dürfen keine defekten Links vorhanden sein.

Klicke auf jeden Textlink im Menü.
Erwartetes Ergebnis: Jeder Textlink führt auf die entsprechende Seite.
Tatsächliches Ergebnis: Dokumentiere, wenn ein Link nicht korrekt funktioniert, und gib an, welcher Link betroffen ist.

Klicke auf jedes Icon im Menü.
Erwartetes Ergebnis: Jedes Icon führt auf die richtige Seite.
Tatsächliches Ergebnis: Beschreibe, wenn ein Icon nicht wie erwartet funktioniert.

Überprüfe das Logo, indem du darauf klickst.
Erwartetes Ergebnis: Das Logo führt zurück zur Startseite.
Tatsächliches Ergebnis: Notiere, falls das Logo nicht wie erwartet funktioniert.

Nach dem Test erstelle ein Jira-Ticket und füge den Testbericht sowie den Link zum Ticket hinzu.', 'medium'),
  ('01991004-0000-7000-8000-000000000008'::uuid, '5vv6', '5vv6-1', 'Bestellung: Benutzerdaten weiterhin nicht eingebbar',
   'Bestellvorgang — Adressformular', 'Der Student fügt den Link zum Ticket, in Jira, hinzu. 

Die Bestellung funktioniert nicht, da keine Benutzerdaten angegeben werden können.',
   'Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast. 

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.', 'critical'),
  ('01991004-0000-7000-8000-000000000009'::uuid, '945u', '945u-1', 'Bestellung ohne Anmeldung: Benutzerdaten nicht eingebbar',
   'Bestellvorgang — Adressformular', 'Der Student fügt den Link zum Ticket, in Jira, hinzu.   

Die Bestellung funktioniert nicht, da keine Benutzerdaten angegeben werden können.',
   'Teste die Funktionalität des Bestellvorgangs auf der Website ohne Anmeldung. Füge mehrere Artikel zum Warenkorb hinzu und navigiere zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich Liefer- und Zahlungsdaten, und schließe den Bestellvorgang ab.

Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und eine Bestätigung angezeigt wird. Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.', 'critical'),
  ('01991004-0000-7000-8000-000000000010'::uuid, '94fh', '94fh-1', 'Feld „Kommentar“ nimmt keine Eingaben an',
   'Produktdetailseite — Bewertung abgeben', 'Der Student fügt den Link zum Jira-Ticket hinzu.

Es ist nicht möglich, Daten in das Feld ''Kommentar'' einzugeben',
   'Teste die Funktion zum Erstellen von Produktbewertungen auf der Website. Stelle sicher, dass es möglich ist, eine Bewertung, einen Namen und einen Kommentar zu hinterlassen. Überprüfe, dass keine Daten gesendet werden, wenn Felder leer bleiben.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.', 'medium'),
  ('01991004-0000-7000-8000-000000000011'::uuid, '9nft', '9nft-1', 'Link zum Zurücksetzen des Passworts ist defekt',
   'Passwort vergessen — E-Mail mit Rücksetzlink', 'Der Student fügt den Link zum Jira-Ticket hinzu. Beachte bitte, dass der Link zum Zurücksetzen des Passworts defekt ist.',
   'Teste die Funktion "Passwort vergessen" auf der Website. Versuche, das Passwort für dein Konto mithilfe der Funktion "Passwort vergessen" zurückzusetzen. Stelle sicher, dass der Passwort-Rücksetzprozess erfolgreich verläuft und dass du dich mit dem neuen Passwort in dein Konto einloggen kannst. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.', 'high'),
  ('01991004-0000-7000-8000-000000000012'::uuid, 'c02w', 'c02w-1', 'Ein Teil der Vergleichstabelle ist nicht mehr sichtbar',
   'Vergleichsliste — Tabelle', 'Der Student fügt den Link zum Jira-Ticket hinzu. 

Nach dem Hinzufügen ist jedoch ein Teil der Tabelle nicht mehr sichtbar.',
   'Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. 

Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.', 'medium'),
  ('01991004-0000-7000-8000-000000000013'::uuid, 'c12p', 'c12p-1', 'Vergleichsliste bleibt leer',
   'Vergleichsliste', 'Der Student fügt in Jira einen Link an das Ticket an.

Beachte bitte, dass die Vergleichsliste leer ist.',
   'Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.', 'high'),
  ('01991004-0000-7000-8000-000000000014'::uuid, 'c3yw', 'c3yw-1', 'Bestellverlauf bleibt leer',
   'Benutzerkonto — Bestellhistorie', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu. 

Der Bestellverlauf ist leer, trotz der erfolgreich aufgegebenen Bestellung.',
   'Teste die Funktionalität der Bestellhistorie und stelle sicher, dass die Bestellhistorie im persönlichen Bereich korrekt angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung. 

Erstelle nach Abschluss des Tests einen Testbericht Jira und füge den Link zu diesem bei.', 'high'),
  ('01991004-0000-7000-8000-000000000015'::uuid, 'c3yw-2', 'c3yw-2-1', 'Bestellverlauf bleibt leer',
   'Benutzerkonto — Bestellhistorie', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu.  

Der Bestellverlauf ist leer, trotz erfolgreich abgeschlossener Bestellung.',
   'Teste die Funktionalität der Bestellhistorie erneut und stelle sicher, dass die Bestellhistorie korrekt im Benutzerkonto angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung. 

Nach Abschluss des Tests sollst du einen Testbericht in Jira erstellen und den Link von diesem hier anhängen.', 'high'),
  ('01991004-0000-7000-8000-000000000016'::uuid, 'c9mc', 'c9mc-1', 'Artikelseite: Text zu klein, Farben zu blass',
   'Blog — Artikelseite', 'Der Student fügt einen Link zu einem Jira-Ticket hinzu.

Der Text auf der Seite ist zu klein, die Farben sind zu blass, und der Text ist schwer lesbar.',
   'Teste die Benutzererfahrung auf der Artikelseite im Blogbereich, um sicherzustellen, dass die Website benutzerfreundlich und einfach zu bedienen ist.

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.', 'low'),
  ('01991004-0000-7000-8000-000000000017'::uuid, 'eit8', 'eit8-1', 'Login-Button: zu grelle Farbe, Text schlecht lesbar',
   'Login-Formular', 'Der Login-Button hat eine zu grelle Farbe, wodurch der Text darauf schwer lesbar ist.',
   'Registriere ein Konto und führe das Testen des Login-Formulars auf der Website durch, indem du die bei der Registrierung angegebenen Daten verwendest. Stelle sicher, dass der Zugriff auf das Konto nur mit korrekten Daten möglich ist, und überprüfe, ob die Benutzeroberfläche der Website komfortabel zu nutzen ist.

Alle Abweichungen vom Szenario oder visuelle Probleme müssen in einem JIRA-Ticket festgehalten werden. Der Link zum Ticket ist in der Antwort beizufügen.', 'low'),
  ('01991004-0000-7000-8000-000000000018'::uuid, 'ny5c', 'ny5c-1', 'Warenkorb zeigt immer nur einen Artikel',
   'Warenkorb', 'Der Student erstellt einen Bug als Ticket in Jira und fügt den Link hinzu.

Der Fehler besteht darin, dass beim Hinzufügen mehrerer Artikel zum Warenkorb immer nur ein Artikel angezeigt wird.',
   'Führe einen Funktionstest des Warenkorbs auf der Website durch. Wähle ein beliebiges Produkt aus dem Katalog aus und füge es dem Warenkorb hinzu, um sicherzustellen, dass das Produkt erfolgreich hinzugefügt wird.

Gehe anschließend zur Warenkorbseite und überprüfe, ob alle Daten zu den Produkten korrekt in der Tabelle angezeigt werden, einschließlich Produktname, Menge, Preis und Gesamtsumme.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Bericht der durchgeführten Tests hinzu.', 'high'),
  ('01991004-0000-7000-8000-000000000019'::uuid, 'p3gn', 'p3gn-1', 'Slider wechselt beim Klick auf die Pfeile nicht',
   'Startseite — Testimonial-Slider', 'Der Studierende erstellt einen Bug als Ticket in Jira, in dem angegeben wird, dass der Slider beim Klicken auf die Pfeile nicht umschaltet.',
   'Teste die Funktion des Testimonial-Sliders auf der Startseite der Website.

Stelle sicher, dass er beim Klicken auf die Navigationspfeile korrekt wechselt.

Dokumentiere nach dem Test die Ergebnisse, indem du die durchgeführten Schritte und mögliche entdeckte Fehler präzise festhältst."', 'medium'),
  ('01991004-0000-7000-8000-000000000020'::uuid, 'qy5c', 'qy5c-1', 'Favoritenliste zeigt nur ein Produkt',
   'Favoritenliste', 'Der Student erstellt einen Bug als Ticket in Jira.

Fehlerbeschreibung:
In der Favoritenliste wird nur ein Produkt angezeigt, obwohl mehrere hinzugefügt wurden.

Erstellung eines Bugs als Ticket:
Titel: In der Favoritenliste wird nur ein Produkt angezeigt.
Beschreibung: Beim Hinzufügen mehrerer Produkte zur Favoritenliste wird nur eines angezeigt.

Schritte zur Reproduktion:

Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte sollten in der Favoritenliste angezeigt werden.
Tatsächliches Ergebnis: Es wird nur ein Produkt angezeigt.

Status: Das Ticket wurde an den Programmierer zur Fehlerbehebung übergeben.',
   'Teste auf der Website die Funktion zum Hinzufügen von Produkten zur Favoritenliste unter Verwendung von szenariobasierten Tests. Liste einige typische Nutzungsszenarien auf, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.

Testschritte
Szenarien

Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "In die Favoritenliste hinzufügen".
Erwartetes Ergebnis: Das Produkt wurde erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gebe an, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.

Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wurde erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gebe an, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.

Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Gebe an, wenn nicht alle hinzugefügten Produkte angezeigt werden.', 'high'),
  ('01991004-0000-7000-8000-000000000021'::uuid, 'rw6e', 'rw6e-1', 'Fehler im Registrierungsformular',
   'Registrierungsformular', 'Der Studierende erstellt nach dem Test ein Jira-Ticket als Fehler, beschreibt den Fehler detailliert im Ticket und hängt abschließend einen Link zum Jira-Ticket in der Antwort an.',
   'Teste das Registrierungsformular der Website, indem du ein Konto erstellst. Stelle sicher, dass bei der Bestätigung der Registrierung eine Validierung erfolgt und fehlerhafte Eingaben deutlich markiert werden. 

Das Formular muss folgende Anforderungen erfüllen:

Der Vorname sollte zwischen 1 und 32 Zeichen lang sein.
Der Nachname sollte zwischen 1 und 32 Zeichen lang sein.
Die E-Mail-Adresse muss ein @-Zeichen enthalten.
Die Telefonnummer sollte zwischen 3 und 32 Zeichen lang sein.
Das Passwort sollte zwischen 4 und 20 Zeichen lang sein.
Das Kontrollkästchen für die Datenschutzrichtlinie muss angekreuzt sein.

Alle Abweichungen vom definierten Szenario sind in einem JIRA-Ticket zu dokumentieren und der entsprechende Link in der Rückmeldung zu hinterlegen.', 'medium'),
  ('01991004-0000-7000-8000-000000000022'::uuid, 'v3qy', 'v3qy-1', 'Der Logo-Link führt nicht zur Startseite',
   'Header — Logo', 'Der Student hat einen Link zum Ticket in Jira hinzugefügt.

Der Link im Logo funktioniert nicht und führt nicht zur Startseite.',
   'Teste die Navigation im Header der Website erneut. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.', 'medium'),
  ('01991004-0000-7000-8000-000000000023'::uuid, 'w5vw', 'w5vw-1', 'List-Ansicht zeigt keine Artikel, das Limit wird ignoriert',
   'Blogseite — List-/Grid-Ansicht', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu.  

Beim Anzeigen der Karten im List-Format erscheinen die Artikel nicht, und das festgelegte Limit wird nicht eingehalten.',
   'Teste die Funktionalität der Blogseite. Stelle sicher, dass die Anzeige von Artikeln im List- und Grid-Format korrekt funktioniert und dass das Limit für die Anzeige von Artikeln auf einer Seite eingehalten wird. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.', 'medium')

) as defect(id, scenario_code, code, title, location_hint,
            expected_behaviour, reproduction, severity)
on conflict on constraint hunt_scenario_defects_code_unique do update set
  title = excluded.title,
  location_hint = excluded.location_hint,
  expected_behaviour = excluded.expected_behaviour,
  reproduction = excluded.reproduction,
  severity = excluded.severity,
  updated_at = statement_timestamp();


-- ─── 5. The tasks ──────────────────────────────────────────────────────────
-- One stage, positions contiguous from 0 — `assert_content_version_render_ready`
-- rejects a gap. Within a Tag the Arena task comes first, because the knowledge
-- task in the same row is gated behind it.
--
-- `task_kind` is `hunt` or `knowledge`, never `practical`: a practical task
-- would additionally require an active non-empty review rubric
-- (`assert_competency_graph_ready`), and none of this content has one.

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind, state,
  target_url, source_system, external_id
)
select task.id, '01991000-0000-7000-8000-000000000001', '01991000-0000-7000-8000-000000000003', '01991000-0000-7000-8000-000000000002',
       task.position, task.task_kind, 'draft',
       task.target_url, task.source_system, task.external_id
from (values
  ('01991001-0000-7000-8000-000000000001'::uuid, 0, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000002'::uuid, 1, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000003'::uuid, 2, 'hunt', 'https://shop.ditele-learn.ai/?taskid=p3gn', 'arena', 'p3gn'),
  ('01991001-0000-7000-8000-000000000004'::uuid, 3, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000005'::uuid, 4, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000006'::uuid, 5, 'hunt', 'https://shop.ditele-learn.ai/?taskid=rw6e', 'arena', 'rw6e'),
  ('01991001-0000-7000-8000-000000000007'::uuid, 6, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000008'::uuid, 7, 'hunt', 'https://shop.ditele-learn.ai/?taskid=7ctc', 'arena', '7ctc'),
  ('01991001-0000-7000-8000-000000000009'::uuid, 8, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000010'::uuid, 9, 'hunt', 'https://shop.ditele-learn.ai/?taskid=eit8', 'arena', 'eit8'),
  ('01991001-0000-7000-8000-000000000011'::uuid, 10, 'hunt', 'https://shop.ditele-learn.ai/?taskid=9nft', 'arena', '9nft'),
  ('01991001-0000-7000-8000-000000000012'::uuid, 11, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000013'::uuid, 12, 'hunt', 'https://shop.ditele-learn.ai/?taskid=1e0p', 'arena', '1e0p'),
  ('01991001-0000-7000-8000-000000000014'::uuid, 13, 'hunt', 'https://shop.ditele-learn.ai/?taskid=11ed', 'arena', '11ed'),
  ('01991001-0000-7000-8000-000000000015'::uuid, 14, 'hunt', 'https://shop.ditele-learn.ai/?taskid=c12p', 'arena', 'c12p'),
  ('01991001-0000-7000-8000-000000000016'::uuid, 15, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000017'::uuid, 16, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000018'::uuid, 17, 'hunt', 'https://shop.ditele-learn.ai/?taskid=c02w', 'arena', 'c02w'),
  ('01991001-0000-7000-8000-000000000019'::uuid, 18, 'knowledge', null, null, null),
  ('01991001-0000-7000-8000-000000000020'::uuid, 19, 'hunt', 'https://shop.ditele-learn.ai/?taskid=3r8y', 'arena', '3r8y'),
  ('01991001-0000-7000-8000-000000000021'::uuid, 20, 'hunt', 'https://shop.ditele-learn.ai/?taskid=cnb2', 'arena', 'cnb2'),
  ('01991001-0000-7000-8000-000000000022'::uuid, 21, 'hunt', 'https://shop.ditele-learn.ai/?taskid=90s7', 'arena', '90s7'),
  ('01991001-0000-7000-8000-000000000023'::uuid, 22, 'hunt', 'https://shop.ditele-learn.ai/?taskid=94fh', 'arena', '94fh'),
  ('01991001-0000-7000-8000-000000000024'::uuid, 23, 'hunt', 'https://shop.ditele-learn.ai/?taskid=3vy6', 'arena', '3vy6'),
  ('01991001-0000-7000-8000-000000000025'::uuid, 24, 'hunt', 'https://shop.ditele-learn.ai/?taskid=6n39', 'arena', '6n39'),
  ('01991001-0000-7000-8000-000000000026'::uuid, 25, 'hunt', 'https://shop.ditele-learn.ai/?taskid=57wv', 'arena', '57wv'),
  ('01991001-0000-7000-8000-000000000027'::uuid, 26, 'hunt', 'https://shop.ditele-learn.ai/?taskid=v3qy', 'arena', 'v3qy'),
  ('01991001-0000-7000-8000-000000000028'::uuid, 27, 'hunt', 'https://shop.ditele-learn.ai/?taskid=367y', 'arena', '367y'),
  ('01991001-0000-7000-8000-000000000029'::uuid, 28, 'hunt', 'https://shop.ditele-learn.ai/?taskid=4c57', 'arena', '4c57'),
  ('01991001-0000-7000-8000-000000000030'::uuid, 29, 'hunt', 'https://shop.ditele-learn.ai/?taskid=qy5c', 'arena', 'qy5c'),
  ('01991001-0000-7000-8000-000000000031'::uuid, 30, 'hunt', 'https://shop.ditele-learn.ai/?taskid=34mc', 'arena', '34mc'),
  ('01991001-0000-7000-8000-000000000032'::uuid, 31, 'hunt', 'https://shop.ditele-learn.ai/?taskid=9jv8', 'arena', '9jv8'),
  ('01991001-0000-7000-8000-000000000033'::uuid, 32, 'hunt', 'https://shop.ditele-learn.ai/?taskid=ny5c', 'arena', 'ny5c'),
  ('01991001-0000-7000-8000-000000000034'::uuid, 33, 'hunt', 'https://shop.ditele-learn.ai/?taskid=3v60', 'arena', '3v60'),
  ('01991001-0000-7000-8000-000000000035'::uuid, 34, 'hunt', 'https://shop.ditele-learn.ai/?taskid=5qmu', 'arena', '5qmu'),
  ('01991001-0000-7000-8000-000000000036'::uuid, 35, 'hunt', 'https://shop.ditele-learn.ai/?taskid=945u', 'arena', '945u'),
  ('01991001-0000-7000-8000-000000000037'::uuid, 36, 'hunt', 'https://shop.ditele-learn.ai/?taskid=5vv6', 'arena', '5vv6'),
  ('01991001-0000-7000-8000-000000000038'::uuid, 37, 'hunt', 'https://shop.ditele-learn.ai/?taskid=y5ym', 'arena', 'y5ym'),
  ('01991001-0000-7000-8000-000000000039'::uuid, 38, 'hunt', 'https://shop.ditele-learn.ai/?taskid=3h59', 'arena', '3h59'),
  ('01991001-0000-7000-8000-000000000040'::uuid, 39, 'hunt', 'https://shop.ditele-learn.ai/?taskid=5v4t', 'arena', '5v4t'),
  ('01991001-0000-7000-8000-000000000041'::uuid, 40, 'hunt', 'https://shop.ditele-learn.ai/?taskid=c3yw', 'arena', 'c3yw'),
  ('01991001-0000-7000-8000-000000000042'::uuid, 41, 'hunt', 'https://shop.ditele-learn.ai/?taskid=c3yw', 'arena', 'c3yw-2'),
  ('01991001-0000-7000-8000-000000000043'::uuid, 42, 'hunt', 'https://shop.ditele-learn.ai/?taskid=w5vw', 'arena', 'w5vw'),
  ('01991001-0000-7000-8000-000000000044'::uuid, 43, 'hunt', 'https://shop.ditele-learn.ai/?taskid=nvy7', 'arena', 'nvy7'),
  ('01991001-0000-7000-8000-000000000045'::uuid, 44, 'hunt', 'https://shop.ditele-learn.ai/?taskid=c9mc', 'arena', 'c9mc'),
  ('01991001-0000-7000-8000-000000000046'::uuid, 45, 'hunt', 'https://shop.ditele-learn.ai/?taskid=mc8h', 'arena', 'mc8h'),
  ('01991001-0000-7000-8000-000000000047'::uuid, 46, 'hunt', 'https://shop.ditele-learn.ai/?taskid=47h5', 'arena', '47h5')

) as task(id, position, task_kind, target_url, source_system, external_id)
on conflict (id) do update set
  position = excluded.position,
  task_kind = excluded.task_kind,
  target_url = excluded.target_url,
  source_system = excluded.source_system,
  external_id = excluded.external_id;


insert into public.task_localizations (
  id, task_id, locale, title, instructions_html, hint_text
)
values
  ('01991002-0000-7000-8000-000000000001', '01991001-0000-7000-8000-000000000001', 'de',
   'Was sind Softwaretests?',
   'Herzlich willkommen auf unserer Lernplattform! Hier kannst du wichtige praktische Fähigkeiten erwerben, die dir in der Zukunft von großem Nutzen sein werden.',
   null),
  ('01991002-0000-7000-8000-000000000002', '01991001-0000-7000-8000-000000000002', 'de',
   'Warum Testen notwendig ist',
   'Willkommen im Team! Du bist jetzt Teil unseres Tester-Teams. In diesem Kurs wirst du einen Online-Shop testen,der sich aktuell in der Entwicklungsphase befindet. Deine Unterstützung in dieser entscheidenden Projektphase ist für uns von großem Wert, und wir danken dir herzlich dafür.',
   null),
  ('01991002-0000-7000-8000-000000000003', '01991001-0000-7000-8000-000000000003', 'de',
   'Testimonial-Slider auf der Startseite',
   'Willkommen zu deiner ersten Aufgabe! Heute widmen wir uns der Überprüfung eines Sliders auf der Startseite. Dieses Designelement lenkt die Aufmerksamkeit der Nutzer auf wichtige Informationen und erleichtert eine schnelle Orientierung.

Beim Testen ist es entscheidend, nicht nur die einwandfreie Funktion des Sliders zu gewährleisten, sondern auch seine Benutzerfreundlichkeit zu bewerten.

Das gilt ebenso für die kommenden Aufgaben:

Überprüfe sowohl die Funktionsfähigkeit als auch die Nutzererfahrung (Usability).

Lass uns direkt mit dem Test dieses zentralen Elements starten!

Teste die Funktion des Testimonial-Sliders auf der Startseite der Website.

Stelle sicher, dass er beim Klicken auf die Navigationspfeile korrekt wechselt.

Dokumentiere nach dem Test die Ergebnisse, indem du die durchgeführten Schritte und mögliche entdeckte Fehler präzise festhältst."',
   null),
  ('01991002-0000-7000-8000-000000000004', '01991001-0000-7000-8000-000000000004', 'de',
   'Modelle des Softwarelebenszyklus',
   'Nachdem du erfolgreich mit den Aufgaben gestartet bist, möchten wir dir nun theoretische Grundlagen vermitteln. 

Diese dienen dir als wertvolles Werkzeug für die kommenden Herausforderungen. Das Verstehen der Theorie hilft dir nicht nur dabei, die Aufgaben präziser zu erfassen, sondern auch deren Kontext einzuordnen – ein wichtiger Schritt für optimale Ergebnisse.

Tauchen wir gemeinsam in die Welt des Wissens ein, die uns befähigt, jede Aufgabe souverän zu meistern!',
   null),
  ('01991002-0000-7000-8000-000000000005', '01991001-0000-7000-8000-000000000005', 'de',
   'Teststufen im V-Modell',
   'Setzen wir das Testen des Online-Shops fort! Im nächsten Schritt tauchen wir tiefer in die Theorie ein, die als Grundlage für die erfolgreiche Bearbeitung der nächsten Aufgaben dient. 

Dabei betrachten wir weitere Aspekte, um ein besseres Verständnis für die Funktionen und das Zusammenspiel der Komponenten eines Online-Shops zu entwickeln. 

Bereit, dein Wissen zu erweitern? Dann legen wir los!',
   null),
  ('01991002-0000-7000-8000-000000000006', '01991001-0000-7000-8000-000000000006', 'de',
   'Registrierungsformular',
   'Heute beschäftigen wir uns mit dem Registrierungsprozess eines Benutzers in einem Online-Shop. Dieser Schritt ist entscheidend, da er die Grundlage für die spätere Interaktion des Kunden mit der Plattform bildet. 

Die Registrierung umfasst nicht nur das Ausfüllen eines Formulars, sondern auch die Erstellung eines Kontos, das Benutzerdaten speichert und ein individuell angepasstes Nutzungserlebnis ermöglicht. 

Lass uns die zentralen Aspekte dieses Prozesses gemeinsam analysieren und uns auf dessen Test vorbereiten!

Teste das Registrierungsformular der Website, indem du ein Konto erstellst. Stelle sicher, dass bei der Bestätigung der Registrierung eine Validierung erfolgt und fehlerhafte Eingaben deutlich markiert werden. 

Das Formular muss folgende Anforderungen erfüllen:

Der Vorname sollte zwischen 1 und 32 Zeichen lang sein.
Der Nachname sollte zwischen 1 und 32 Zeichen lang sein.
Die E-Mail-Adresse muss ein @-Zeichen enthalten.
Die Telefonnummer sollte zwischen 3 und 32 Zeichen lang sein.
Das Passwort sollte zwischen 4 und 20 Zeichen lang sein.
Das Kontrollkästchen für die Datenschutzrichtlinie muss angekreuzt sein.

Alle Abweichungen vom definierten Szenario sind in einem JIRA-Ticket zu dokumentieren und der entsprechende Link in der Rückmeldung zu hinterlegen.',
   null),
  ('01991002-0000-7000-8000-000000000007', '01991001-0000-7000-8000-000000000007', 'de',
   'Fehlhandlung, Fehlerzustand, Fehlerwirkung',
   'Heute beschäftigen wir uns mit dem Registrierungsprozess eines Benutzers in einem Online-Shop. Dieser Schritt ist entscheidend, da er die Grundlage für die spätere Interaktion des Kunden mit der Plattform bildet. 

Die Registrierung umfasst nicht nur das Ausfüllen eines Formulars, sondern auch die Erstellung eines Kontos, das Benutzerdaten speichert und ein individuell angepasstes Nutzungserlebnis ermöglicht. 

Lass uns die zentralen Aspekte dieses Prozesses gemeinsam analysieren und uns auf dessen Test vorbereiten!',
   null),
  ('01991002-0000-7000-8000-000000000008', '01991001-0000-7000-8000-000000000008', 'de',
   'Registrierungsformular — Fehlernachtest',
   'Glückwunsch zum erfolgreichen Abschluss der letzten Testphase! 

Heute steht eine erneute Überprüfung des Registrierungsformulars an, das du zuvor getestet hast. 

Dank deines Engagements und wertvollen Feedbacks konnten die Entwickler die identifizierten Fehler beheben. Nun ist es an der Zeit, diese zentrale Komponente des Online-Shops erneut zu evaluieren. 

Lass uns überprüfen, ob die vorgenommenen Anpassungen wie geplant wirken und uns auf die kommenden Herausforderungen vorbereiten!

Teste das Registrierungsformular der Website erneut, um zu prüfen, ob die Behebung erfolgreich ist.

Erstelle wieder ein Konto. Stelle sicher, dass bei der Bestätigung der Registrierung eine Validierung erfolgt und fehlerhafte Eingaben deutlich markiert werden. 

Das Formular muss den folgenden Anforderungen entsprechen:

Der Vorname sollte zwischen 1 und 32 Zeichen lang sein.
Der Nachname sollte zwischen 1 und 32 Zeichen lang sein.
Die E-Mail-Adresse muss ein @-Zeichen enthalten.
Die Telefonnummer sollte zwischen 3 und 32 Zeichen lang sein.
Das Passwort sollte zwischen 4 und 20 Zeichen lang sein.
Das Kontrollkästchen für die Datenschutzrichtlinie muss angekreuzt sein.

Alle Abweichungen vom definierten Szenario sind wieder in einem JIRA-Ticket zu dokumentieren und der entsprechende Link in der Rückmeldung zu hinterlegen.',
   null),
  ('01991002-0000-7000-8000-000000000009', '01991001-0000-7000-8000-000000000009', 'de',
   'Der Peer-Review-Prozess',
   'Glückwunsch zum erfolgreichen Abschluss der letzten Testphase! 

Heute steht eine erneute Überprüfung des Registrierungsformulars an, das du zuvor getestet hast. 

Dank deines Engagements und wertvollen Feedbacks konnten die Entwickler die identifizierten Fehler beheben. Nun ist es an der Zeit, diese zentrale Komponente des Online-Shops erneut zu evaluieren. 

Lass uns überprüfen, ob die vorgenommenen Anpassungen wie geplant wirken und uns auf die kommenden Herausforderungen vorbereiten!',
   null),
  ('01991002-0000-7000-8000-000000000010', '01991001-0000-7000-8000-000000000010', 'de',
   'Login-Formular',
   'Herzlichen Glückwunsch zur erfolgreichen Überprüfung des Registrierungsformulars! Dank deiner Hilfe konnten die Entwickler alle festgestellten Probleme beheben, und nun können die Nutzer problemlos ihre Konten erstellen. Jetzt ist es Zeit, zum nächsten Schritt überzugehen: dem Test der Login-Form. Lass uns überprüfen, wie reibungslos und sicher sich die Nutzer in ihre Konten einloggen können, und sicherstellen, dass dieses wichtige Element des Online-Shops stabil funktioniert.

Registriere ein Konto und führe das Testen des Login-Formulars auf der Website durch, indem du die bei der Registrierung angegebenen Daten verwendest. Stelle sicher, dass der Zugriff auf das Konto nur mit korrekten Daten möglich ist, und überprüfe, ob die Benutzeroberfläche der Website komfortabel zu nutzen ist.

Alle Abweichungen vom Szenario oder visuelle Probleme müssen in einem JIRA-Ticket festgehalten werden. Der Link zum Ticket ist in der Antwort beizufügen.',
   null),
  ('01991002-0000-7000-8000-000000000011', '01991001-0000-7000-8000-000000000011', 'de',
   'Funktion „Passwort vergessen“',
   'Großartige Arbeit! Dank deiner Bemühungen haben die Entwickler das Problem mit dem Login-Button behoben, und nun können die Nutzer problemlos auf ihre Daten zugreifen. Jetzt gehen wir zum nächsten Schritt über: die Überprüfung des Passwort-Wiederherstellungsprozesses. Lass uns diese Funktion testen und sicherstellen, dass sie zuverlässig und sicher funktioniert. Lass uns mit dem Testen beginnen!

Teste die Funktion "Passwort vergessen" auf der Website. Versuche, das Passwort für dein Konto mithilfe der Funktion "Passwort vergessen" zurückzusetzen. Stelle sicher, dass der Passwort-Rücksetzprozess erfolgreich verläuft und dass du dich mit dem neuen Passwort in dein Konto einloggen kannst. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000012', '01991001-0000-7000-8000-000000000012', 'de',
   'Checklisten im Review',
   'Großartige Arbeit! Dank deiner Bemühungen haben die Entwickler das Problem mit dem Login-Button behoben, und nun können die Nutzer problemlos auf ihre Daten zugreifen. Jetzt gehen wir zum nächsten Schritt über: die Überprüfung des Passwort-Wiederherstellungsprozesses. Lass uns diese Funktion testen und sicherstellen, dass sie zuverlässig und sicher funktioniert. Lass uns mit dem Testen beginnen!',
   null),
  ('01991002-0000-7000-8000-000000000013', '01991001-0000-7000-8000-000000000013', 'de',
   'Kontaktdaten im Benutzerkonto ändern',
   'Dank deiner Bemühungen können die Nutzer jetzt problemlos auf ihre Konten zugreifen. Jetzt müssen wir sicherstellen, dass die Funktionen des Benutzerbereichs korrekt arbeiten. Beginnen wir mit der Überprüfung der Möglichkeit, die Kontaktdaten zu bearbeiten. Diese wichtige Funktion ermöglicht es den Nutzern, ihre Profilinformationen aktuell zu halten. Lass uns überprüfen, wie gut diese Funktion ihre Aufgabe erfüllt und sicherstellen, dass sie zuverlässig ist.

Teste die Funktion zur Änderung der Kontaktdaten des Nutzers im Benutzerbereich auf der Website. Melde dich dazu mit den Daten an, die du vorher verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass alle Kontaktdaten bearbeitet und korrekt gespeichert werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000014', '01991001-0000-7000-8000-000000000014', 'de',
   'Lieferadressen anlegen und ändern',
   'Vielen Dank für deine wertvolle Teilnahme am letzten Test! Deine Arbeit hat dem Entwicklerteam geholfen, die Probleme mit der Passwort-Wiederherstellung, dem Login-Button und dem E-Mail-Feld zu identifizieren und zu beheben. Heute setzen wir unsere Arbeit fort und gehen zum nächsten Testschritt über. Diesmal konzentrieren wir uns auf die Funktionen zum Erstellen und Ändern von Lieferadressen.

Teste die Funktion zum Erstellen und Ändern von Lieferadressen auf der Website. Melde dich mit den Daten an, die du zuvor verwendet hast, oder registriere ein neues Konto. Stelle sicher, dass du eine neue Lieferadresse erstellen und bereits vorhandene Adressen bearbeiten kannst.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000015', '01991001-0000-7000-8000-000000000015', 'de',
   'Vergleichsliste',
   'Wir setzen unsere Testreihe fort! Diesmal konzentrieren wir uns auf die Funktion zum Hinzufügen von Produkten zur Vergleichsliste. Diese Funktion ist für unsere Nutzer besonders wichtig, da sie es ihnen ermöglicht, verschiedene Produkte zu vergleichen und fundiertere Kaufentscheidungen zu treffen.

Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000016', '01991001-0000-7000-8000-000000000016', 'de',
   'Testaktivitäten und Testausführungsplan',
   'Wir setzen unsere Arbeit fort! Heute ergänzen wir unsere Tests mit etwas Theorie. Bevor wir zur Praxis übergehen, lass uns einige Grundlagen des Softwaretests wiederholen, um unser Wissen aufzufrischen und uns besser auf die kommenden Aufgaben vorzubereiten.',
   null),
  ('01991002-0000-7000-8000-000000000017', '01991001-0000-7000-8000-000000000017', 'de',
   'Monitoring und Steuerung von Tests',
   'Willkommen zur nächsten Phase unseres Testens! Diesmal beginnen wir mit einer kleinen theoretischen Frage, um unser Wissen vor der praktischen Testdurchführung zu vertiefen. Es ist wichtig, nicht nur zu wissen, wie man Aufgaben ausführt, sondern auch, warum wir bestimmte Schritte im Testprozess unternehmen.',
   null),
  ('01991002-0000-7000-8000-000000000018', '01991001-0000-7000-8000-000000000018', 'de',
   'Vergleichsliste — Fehlernachtest',
   'Heute müssen wir diese Funktionalität erneut testen und sicherstellen, dass alles korrekt funktioniert. Dies ist ein wichtiger Schritt, um zu gewährleisten, dass unsere Nutzer eine positive Erfahrung mit der Website haben.

Teste die Funktion zum Hinzufügen von Produkten zur Vergleichsliste auf der Website. 

Füge einige Produkte sowohl über den Gastzugang als auch über ein Kundenkonto zur Vergleichsliste hinzu. Stelle sicher, dass alle Produkte korrekt hinzugefügt werden.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000019', '01991001-0000-7000-8000-000000000019', 'de',
   'Arten von Testwerkzeugen',
   'Heute müssen wir diese Funktionalität erneut testen und sicherstellen, dass alles korrekt funktioniert. Dies ist ein wichtiger Schritt, um zu gewährleisten, dass unsere Nutzer eine positive Erfahrung mit der Website haben.',
   null),
  ('01991002-0000-7000-8000-000000000020', '01991001-0000-7000-8000-000000000020', 'de',
   'Produktsortierung auf der Kategorieseite',
   'Wir setzen die Tests der Website fort! Heute prüfen wir die Funktionalität der Produktsortierung auf der Kategorieseite. Diese Funktion ist entscheidend, da sie unseren Nutzern ermöglicht, gewünschte Produkte effizient zu finden und zu vergleichen.

Vielen Dank für Ihre bisherige Testarbeit! Durch Ihre Unterstützung konnten die Entwickler das Problem mit der Tabelle aus dem letzten Auftrag beheben, was die Benutzererfahrung deutlich verbessert hat.

Teste die Funktion zur Sortierung von Produkten auf der Kategorieseite auf der Website. Die Produkte sollten nach Name, Preis, Bewertung und Modell sortiert werden. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000021', '01991001-0000-7000-8000-000000000021', 'de',
   'Bildansicht auf der Produktdetailseite',
   'Wir führen die Tests fort und konzentrieren uns diesmal auf die Funktion zur Bildansicht auf der Produktdetailseite. Dieser Aspekt ist entscheidend, da er Nutzern hilft, sich vor dem Kauf ein detailliertes Bild des Produkts zu verschaffen.

Teste den Bildansichtsmodus auf der Produktdetailseite der Website. Stelle sicher, dass alle Bilder korrekt geladen werden und in der erwarteten Qualität angezeigt werden. Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000022', '01991001-0000-7000-8000-000000000022', 'de',
   'Produktsuche',
   'Der nächste Schritt im Testprozess ist die Überprüfung der Produktsuchfunktion auf der Website. Diese Funktion ist entscheidend, da sie Nutzern ermöglicht, schnell und bequem die gewünschten Produkte im Katalog zu finden.

Teste die Produktsuchfunktion auf der Website. Führe die Suche durch, indem du ein Schlüsselwort oder eine Phrase eingibst, die mit den Produkten im Katalog übereinstimmt, und überprüfe, ob die angezeigten Suchergebnisse deinem Suchbegriff entsprechen.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Link zum Bericht der durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000023', '01991001-0000-7000-8000-000000000023', 'de',
   'Produktbewertungen erstellen',
   'Wir setzen die Tests der Website-Funktionalität fort! Dieses Mal prüfen wir die Funktion zum Erstellen von Produktbewertungen. Bewertungen spielen eine wichtige Rolle, da sie Nutzern helfen, fundierte Kaufentscheidungen zu treffen und ihre Meinung zu den Produkten mitzuteilen.

Teste die Funktion zum Erstellen von Produktbewertungen auf der Website. Stelle sicher, dass es möglich ist, eine Bewertung, einen Namen und einen Kommentar zu hinterlassen. Überprüfe, dass keine Daten gesendet werden, wenn Felder leer bleiben.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000024', '01991001-0000-7000-8000-000000000024', 'de',
   'Filterfunktion auf der Kategorieseite',
   'Wir führen die Tests der Website-Funktionalität fort! Heute liegt unser Fokus auf der Überprüfung der Filterfunktion auf der Kategorieseite. Die Filterung ist entscheidend, da sie Nutzern hilft, die gewünschten Produkte präzise aus dem umfangreichen Sortiment auszuwählen.

Teste die Filterfunktion auf der Kategorieseite der Website. Überprüfe, ob die Filterung korrekt funktioniert und Nutzern ermöglicht, die gewünschten Produkte präzise auszuwählen.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000025', '01991001-0000-7000-8000-000000000025', 'de',
   'Filterfunktion — Fehlernachtest',
   'Willkommen zum nächsten Testschritt! Heute widmen wir uns der erneuten Überprüfung der Filterfunktion auf der Kategorieseite. Dieser Prozess wird oft als ''Nachtfehler-Test'' bezeichnet. In einer früheren Prüfung wurde festgestellt, dass die Produktfilterung nicht funktionierte. Dank der Arbeit unserer Entwickler wurde das Problem jedoch behoben.

Vielen Dank für deine Teilnahme an den vorherigen Tests, die entscheidend zur Identifizierung und Lösung des Problems beigetragen haben. Deine heutige Aufgabe besteht darin, sicherzustellen, dass die Filterfunktion wie vorgesehen funktioniert. Überprüfe, ob Nutzer die Produkte auf der Kategorieseite mühelos entsprechend ihren Anforderungen filtern können.

Teste die Filterfunktion auf der Kategorieseite der Website erneut. Überprüfe, ob die Filterung korrekt funktioniert.

Erstelle nach Abschluss der Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000026', '01991001-0000-7000-8000-000000000026', 'de',
   'Navigation im Header',
   'Guten Tag!
Heute testen wir das Navigationsmenü im Header unserer Website. Ziel ist es, sicherzustellen, dass alle Textlinks und Icons korrekt funktionieren und auf die richtigen Seiten verweisen. Zudem prüfen wir, dass keine defekten Links vorhanden sind.

Warum ist das wichtig?
Der Header ist der obere Bereich einer Webseite und enthält normalerweise das Logo, das Hauptnavigationsmenü sowie andere wichtige Informationen. Da dieser Abschnitt beim Laden der Seite sofort sichtbar ist, ist es essenziell, dass alle Links im Header einwandfrei funktionieren und die Nutzer zuverlässig zu den richtigen Seiten führen. Nur so kann eine benutzerfreundliche Navigation gewährleistet werden.

Teste die Funktionsweise des Navigationsmenüs im oberen Bereich der Website (Header). Stelle sicher, dass alle Textlinks, Icons und das Logo korrekt funktionieren und auf die richtigen Seiten verweisen. Es dürfen keine defekten Links vorhanden sein.

Klicke auf jeden Textlink im Menü.
Erwartetes Ergebnis: Jeder Textlink führt auf die entsprechende Seite.
Tatsächliches Ergebnis: Dokumentiere, wenn ein Link nicht korrekt funktioniert, und gib an, welcher Link betroffen ist.

Klicke auf jedes Icon im Menü.
Erwartetes Ergebnis: Jedes Icon führt auf die richtige Seite.
Tatsächliches Ergebnis: Beschreibe, wenn ein Icon nicht wie erwartet funktioniert.

Überprüfe das Logo, indem du darauf klickst.
Erwartetes Ergebnis: Das Logo führt zurück zur Startseite.
Tatsächliches Ergebnis: Notiere, falls das Logo nicht wie erwartet funktioniert.

Nach dem Test erstelle ein Jira-Ticket und füge den Testbericht sowie den Link zum Ticket hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000027', '01991001-0000-7000-8000-000000000027', 'de',
   'Navigation im Header — Fehlernachtest',
   'Guten Tag! Heute testen wir das Navigationsmenü im Header unserer Website erneut. Dieses Mal prüfen wir, ob die Entwickler die zuvor nicht funktionierenden Links erfolgreich behoben haben. Unsere Aufgabe ist es, sicherzustellen, dass nach den vorgenommenen Änderungen alle Text- und Symbol-Links auf die richtigen Seiten führen und keine ungültigen Links mehr vorhanden sind.

Teste die Navigation im Header der Website erneut. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Bericht der durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000028', '01991001-0000-7000-8000-000000000028', 'de',
   'Navigation im Footer',
   'Guten Tag! Heute testen wir die Navigation im Footer unserer Website. Ziel ist es sicherzustellen, dass alle Text- und Symbol-Links im Footer, einschließlich des Logos, auf die richtigen Seiten führen und keine ungültigen Links vorhanden sind.

Warum ist es wichtig, den Footer zu überprüfen?
Der Footer ist ein wesentlicher Bestandteil der Website, da er wichtige Navigationsinformationen und Links zu verschiedenen Bereichen enthält. Es ist entscheidend, sicherzustellen, dass Nutzer auf allen Seiten der Website Zugriff auf diese Informationen und Links haben.

Teste die Navigation im Footer der Website. Überprüfe, ob alle Text- und Symbol-Links auf die entsprechenden Seiten führen und keine ungültigen Links vorhanden sind.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Bericht über die durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000029', '01991001-0000-7000-8000-000000000029', 'de',
   'Kontaktformular',
   'Hallo! Heute werden wir die Funktionalität des Kontaktformulars auf unserer Website testen. Unser Ziel ist es, sicherzustellen, dass das Formular korrekt mit dem Benutzer interagiert, die Daten vor dem Absenden auf Richtigkeit überprüft und nach erfolgreichem Absenden eine Bestätigung anzeigt. Wenn die Daten falsch eingegeben werden, sollte das Absenden nicht erfolgen.

Das Kontaktformular ist ein wichtiges Werkzeug für die Kommunikation mit den Benutzern und für das Einholen von Feedback. Daher ist es wichtig, dass es zuverlässig und effizient funktioniert.

Teste die Funktionalität des Kontaktformulars auf der Website. Stelle sicher, dass die Daten vor dem Absenden auf Vollständigkeit und Inhalt überprüft werden. Bei fehlerhaften Daten sollte das Absenden nicht erfolgen.

Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.',
   null),
  ('01991002-0000-7000-8000-000000000030', '01991001-0000-7000-8000-000000000030', 'de',
   'Favoritenliste — szenariobasiertes Testen',
   'Willkommen zur nächsten Aufgabe! Heute werden wir die Funktion zum Hinzufügen von Produkten zur Wunschliste auf der Website testen. Diese Funktion spielt eine wichtige Rolle für die Benutzer, da sie es ihnen ermöglicht, interessante Produkte für einen späteren Kauf zu speichern und deren Verfügbarkeit sowie Preisänderungen im Blick zu behalten.

Teste auf der Website die Funktion zum Hinzufügen von Produkten zur Favoritenliste unter Verwendung von szenariobasierten Tests. Liste einige typische Nutzungsszenarien auf, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.

Testschritte
Szenarien

Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "In die Favoritenliste hinzufügen".
Erwartetes Ergebnis: Das Produkt wurde erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gebe an, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.

Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wurde erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gebe an, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.

Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Gebe an, wenn nicht alle hinzugefügten Produkte angezeigt werden.',
   null),
  ('01991002-0000-7000-8000-000000000031', '01991001-0000-7000-8000-000000000031', 'de',
   'Favoritenliste — Fehlernachtest',
   'Willkommen zum erneuten Test der Funktion zum Hinzufügen von Produkten zur Favoritenliste! Auch dieses Mal verwenden wir szenariobasierte Tests, um die Korrektheit der Funktion zu überprüfen.

Dank der vorherigen Tests konnten die Programmierer die Anzeige der Produkte in der Favoritenliste korrigieren. Unsere Aufgabe besteht nun darin, sicherzustellen, dass diese Korrekturen erfolgreich umgesetzt wurden und die Funktion reibungslos funktioniert."

Auf der Website teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste, indem du szenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen eines Produkts, das Entfernen eines Produkts aus der Favoritenliste usw., und stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss der Tests erstelle ein Ticket in Jira und füge den Testbericht bei.

Testschritte
Testszenarien
Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt wird erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Angeben, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.
Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wird erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Angeben, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.
Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Angeben, wenn nicht alle hinzugefügten Produkte angezeigt werden.',
   null),
  ('01991002-0000-7000-8000-000000000032', '01991001-0000-7000-8000-000000000032', 'de',
   'Favoritenliste — zweiter Fehlernachtest',
   'Wir setzen unser Testen der Funktion zum Hinzufügen von Produkten zur Favoritenliste auf der Website fort. Nach dem vorherigen Test, bei dem ein Fehler festgestellt wurde, aufgrund dessen neue Produkte nicht zur Favoritenliste hinzugefügt werden konnten, haben die Entwickler entsprechende Korrekturen vorgenommen. Heute werden wir diese Funktion erneut testen, indem wir testszenariobasierte Tests verwenden.

Teste erneut die Funktion zum Hinzufügen von Produkten zur Favoritenliste auf der Website, indem du testszenariobasierte Tests verwendest. Nenne einige typische Nutzungsszenarien dieser Funktion, wie das Hinzufügen von Produkten, das Entfernen von Produkten aus der Favoritenliste und die Überprüfung der Anzeige von Produkten. Stelle sicher, dass jedes Szenario korrekt funktioniert. Nach Abschluss des Tests erstelle ein Ticket in Jira und füge den Bericht über die durchgeführten Tests bei.

Testschritte
Testszenarien
Hinzufügen eines Produkts zur Favoritenliste:

Schritte:
Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt wird erfolgreich zur Favoritenliste hinzugefügt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gib an, wenn das Produkt nicht hinzugefügt wird oder ein Fehler auftritt.
Entfernen eines Produkts aus der Favoritenliste:

Schritte:
Gehe zur Favoritenliste.
Klicke auf die Schaltfläche "Entfernen" neben dem Produkt.
Erwartetes Ergebnis: Das Produkt wird erfolgreich aus der Favoritenliste entfernt, eine Bestätigungsnachricht erscheint.
Tatsächliches Ergebnis: Gib an, wenn das Produkt nicht entfernt wird oder ein Fehler auftritt.
Überprüfung der Anzeige von Produkten in der Favoritenliste:

Schritte:
Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte werden in der Favoritenliste angezeigt.
Tatsächliches Ergebnis: Gib an, wenn nicht alle hinzugefügten Produkte angezeigt werden.',
   null),
  ('01991002-0000-7000-8000-000000000033', '01991001-0000-7000-8000-000000000033', 'de',
   'Warenkorb',
   'Willkommen! Heute werden wir die Funktionalität des Warenkorbs auf der Website testen. Unser Ziel ist es, sicherzustellen, dass der Prozess des Hinzufügens von Produkten zum Warenkorb und die Anzeige von Informationen über die Produkte im Warenkorb korrekt funktioniert.

Wir möchten auch unseren Dank für dein vorheriges Testen ausdrücken. Dank deiner Teilnahme funktioniert die Funktion zum Hinzufügen von Produkten zur Favoritenliste erfolgreich auf der Website.

Führe einen Funktionstest des Warenkorbs auf der Website durch. Wähle ein beliebiges Produkt aus dem Katalog aus und füge es dem Warenkorb hinzu, um sicherzustellen, dass das Produkt erfolgreich hinzugefügt wird.

Gehe anschließend zur Warenkorbseite und überprüfe, ob alle Daten zu den Produkten korrekt in der Tabelle angezeigt werden, einschließlich Produktname, Menge, Preis und Gesamtsumme.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Bericht der durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000034', '01991001-0000-7000-8000-000000000034', 'de',
   'Warenkorb — Fehlernachtest',
   'Hallo! Heute testen wir die Funktionalität des Warenkorbs auf der Website erneut. Unser Ziel ist es, sicherzustellen, dass der Fehler, der zu einer falschen Anzeige der Artikelanzahl im Warenkorb führte, behoben wurde.

Beim letzten Test wurde ein Problem festgestellt, bei dem beim Hinzufügen mehrerer Artikel zum Warenkorb nur ein Artikel angezeigt wurde. Vielen Dank für deinen Einsatz beim Testen, der dazu beigetragen hat, dieses Problem zu identifizieren.

Hallo! Heute testen wir die Funktionalität des Warenkorbs auf der Website erneut. Unser Ziel ist es, sicherzustellen, dass der Fehler, der zu einer falschen Anzeige der Artikelanzahl im Warenkorb führte, behoben wurde.

Beim letzten Test wurde ein Problem festgestellt, bei dem beim Hinzufügen mehrerer Artikel zum Warenkorb nur ein Artikel angezeigt wurde. Vielen Dank für deinen Einsatz beim Testen, der dazu beigetragen hat, dieses Problem zu identifizieren.',
   null),
  ('01991002-0000-7000-8000-000000000035', '01991001-0000-7000-8000-000000000035', 'de',
   'Warenkorb — zweiter Fehlernachtest',
   'Hallo! Heute testen wir die Funktionalität des Warenkorbs auf der Website erneut. Beim vorherigen Test wurde ein Fehler entdeckt, durch den Artikel nicht zum Warenkorb hinzugefügt werden konnten. Dieser Fehler wurde inzwischen behoben, und unsere Aufgabe ist es nun, sicherzustellen, dass die Funktionalität einwandfrei funktioniert.

Teste die Funktionalität des Warenkorbs auf der Website erneut. Wähle einen beliebigen Artikel aus dem Katalog aus und füge ihn dem Warenkorb hinzu. Stelle sicher, dass der Artikel erfolgreich hinzugefügt wird.

Gehe anschließend zur Warenkorbseite und überprüfe, ob alle Daten zu den Artikeln korrekt in der Tabelle angezeigt werden, einschließlich Artikelbezeichnungen, Menge, Preis und Gesamtbetrag.

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000036', '01991001-0000-7000-8000-000000000036', 'de',
   'Bestellvorgang ohne Anmeldung',
   'Hallo! Heute testen wir die Funktionalität des Bestellvorgangs auf der Website. Wir freuen uns, mitteilen zu können, dass beim vorherigen Test ein Fehler entdeckt und behoben wurde, der das Hinzufügen von Artikeln zum Warenkorb betraf.

Nun können wir mit dem Testen des gesamten Bestellvorgangs fortfahren.

Teste die Funktionalität des Bestellvorgangs auf der Website ohne Anmeldung. Füge mehrere Artikel zum Warenkorb hinzu und navigiere zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich Liefer- und Zahlungsdaten, und schließe den Bestellvorgang ab.

Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und eine Bestätigung angezeigt wird. Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000037', '01991001-0000-7000-8000-000000000037', 'de',
   'Bestellvorgang — Fehlernachtest',
   'Grüße! Heute testen wir die Funktionalität des Bestellvorgangs auf der Website erneut. Beim letzten Test wurde ein Fehler festgestellt, der dazu führte, dass Benutzerdaten während des Bestellvorgangs nicht angegeben werden konnten. Unser Ziel ist es, zu überprüfen, ob dieser Fehler erfolgreich behoben wurde.

Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast. 

Erstelle nach Abschluss des Tests ein Ticket in Jira und füge den Link zum Testbericht hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000038', '01991001-0000-7000-8000-000000000038', 'de',
   'Bestellvorgang — zweiter Fehlernachtest',
   'Grüße! Heute werden wir die Funktionalität der Bestellung auf der Website erneut testen. Beim letzten Test wurde ein Fehler festgestellt, durch den die Zahlungsdaten während des Bestellvorgangs nicht angegeben werden konnten. Unsere Aufgabe besteht darin, zu überprüfen, ob dieser Fehler behoben wurde.

Teste die Funktionalität des Bestellvorgangs auf der Website erneut. Füge mehrere Artikel zum Warenkorb hinzu und gehe zur Bestellseite. Fülle alle erforderlichen Felder aus, einschließlich der Liefer- und Zahlungsdaten, und schließe dann den Bestellvorgang ab. Stelle sicher, dass die Bestellung erfolgreich erstellt wurde und du eine Bestätigung erhalten hast. 

Erstelle nach Abschluss des Tests eine Karte in Jira und füge den Link zum Testbericht hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000039', '01991001-0000-7000-8000-000000000039', 'de',
   'Warenrückgabe',
   'Guten Tag! Heute werden wir die Funktion zur Rückgabe von Waren auf unserer Website testen. Wir freuen uns, mitteilen zu können, dass durch unser vorheriges Testen Fehler im Bestellprozess entdeckt und behoben wurden.

Tätige eine Bestellung auf der Website und teste daraufhin die Funktion zur Rückgabe von Waren. 

Erstelle nach Abschluss des Tests eine Karte in Jira und füge den Bericht über die durchgeführten Tests hinzu.',
   null),
  ('01991002-0000-7000-8000-000000000040', '01991001-0000-7000-8000-000000000040', 'de',
   'Warenrückgabe — Regressionstest',
   'Hallo! Heute wirst du einen Regressionstest der Rückgabefunktion auf unserer Website durchführen. Beachte, dass beim letzten Test eine Fehlfunktion entdeckt wurde, die zu einer Weiterleitung auf die Hauptseite anstelle der Rückgabeseite führte.

Bitte tätige eine Bestellung auf der Website und teste anschließlich die Rückgabefunktion erneut. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Testbericht bei.',
   null),
  ('01991002-0000-7000-8000-000000000041', '01991001-0000-7000-8000-000000000041', 'de',
   'Bestellhistorie',
   'Hallo! Heute testen wir die Funktionalität der Bestellhistorie auf unserer Website. Basierend auf den vorherigen Aufgaben ist unser Ziel, sicherzustellen, dass die Bestellhistorie korrekt im Benutzerkonto angezeigt wird.

Teste die Funktionalität der Bestellhistorie und stelle sicher, dass die Bestellhistorie im persönlichen Bereich korrekt angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung. 

Erstelle nach Abschluss des Tests einen Testbericht Jira und füge den Link zu diesem bei.',
   null),
  ('01991002-0000-7000-8000-000000000042', '01991001-0000-7000-8000-000000000042', 'de',
   'Bestellhistorie — Fehlernachtest',
   'Guten Tag! Heute werden wir die Funktionalität der Bestellhistorie auf unserer Website erneut testen. Basierend auf den vorherigen Aufgaben ist es unser Ziel, sicherzustellen, dass die Bestellhistorie nach Abschluss einer Bestellung korrekt im Benutzerkonto angezeigt wird.

Teste die Funktionalität der Bestellhistorie erneut und stelle sicher, dass die Bestellhistorie korrekt im Benutzerkonto angezeigt wird. Melde dich im Testkonto an und tätige eine Bestellung. 

Nach Abschluss des Tests sollst du einen Testbericht in Jira erstellen und den Link von diesem hier anhängen.',
   null),
  ('01991002-0000-7000-8000-000000000043', '01991001-0000-7000-8000-000000000043', 'de',
   'Blogseite — List- und Grid-Ansicht',
   'Guten Tag! Heute werden wir die Funktionalität der Blogseite auf unserer Website testen. Unser Ziel ist es, sicherzustellen,dass die Anzeige von Artikeln sowohl im List- als auch im Grid-Format korrekt funktioniert und das festgelegte Limit für die Artikelanzahl pro Seite eingehalten wird. Die Blogseite spielt eine wichtige Rolle bei der Bereitstellung von Informationen und Inhalten für die Benutzer. Daher ist es wichtig, dass ihre Funktionalität einwandfrei funktioniert.

Teste die Funktionalität der Blogseite. Stelle sicher, dass die Anzeige von Artikeln im List- und Grid-Format korrekt funktioniert und dass das Limit für die Anzeige von Artikeln auf einer Seite eingehalten wird. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   null),
  ('01991002-0000-7000-8000-000000000044', '01991001-0000-7000-8000-000000000044', 'de',
   'Blogseite — Fehlernachtest',
   'Willkommen! Heute testen wir die Funktionalität der Blogseite auf unserer Website erneut. Unser Ziel ist es sicherzustellen, dass die Anzeige von Artikeln im List- und Grid-Format korrekt funktioniert und das festgelegte Limit für die Artikelanzahl pro Seite eingehalten wird. Beim letzten Mal haben wir einen Fehler festgestellt: Beim Anzeigen der Artikel im List-Format erschienen sie nicht, und auch die Steuerung des Artikel-Limits funktionierte nicht.

Teste die Funktionalität der Blogseite erneut und stelle sicher, dass die Funktionen zur Anzeige von Artikeln (List und Grid), sowie das Limit für die Anzeige von Artikeln auf einer Seite funktionieren. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   null),
  ('01991002-0000-7000-8000-000000000045', '01991001-0000-7000-8000-000000000045', 'de',
   'Benutzererfahrung auf der Artikelseite',
   'Grüße! Heute werden wir die Qualität der Benutzererfahrung auf der Artikelseite im Blogbereich unserer Website testen. Unser Ziel ist es, sicherzustellen, dass sich die Benutzer bei der Nutzung unserer Website wohlfühlen und eine angenehme Erfahrug haben. Die Seite des Blogartikels spielt eine Schlüsselrolle bei der Bereitstellung von Informationen und Inhalten für unsere Benutzer. Daher ist es wichtig, dass sie bequem und einfach zu bedienen ist.

Teste die Benutzererfahrung auf der Artikelseite im Blogbereich, um sicherzustellen, dass die Website benutzerfreundlich und einfach zu bedienen ist.

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   null),
  ('01991002-0000-7000-8000-000000000046', '01991001-0000-7000-8000-000000000046', 'de',
   'Markenseite',
   'Hallo! Heute testen wir die Funktionalität der Markenseite auf unserer Website. Unser Ziel ist es, sicherzustellen, dass alle Funktionen zur Anzeige von Marken korrekt funktionieren und Benutzer leicht die Marken finden können, die sie interessieren. Die Markenseite ist ein wichtiger Bestandteil unserer Website, da sie den Benutzern ermöglicht, schnell zu den Produkten einer bestimmten Marke zu gelangen.

Überprüfe die Funktionalität der Markenseite. Stelle sicher, dass die alphabetische Sortierung der Marken korrekt funktioniert und dass Ankerlinks zu jedem Buchstaben ordnungsgemäß funktionieren. Überprüfe außerdem, ob die Links zu den Marken auf die entsprechenden Produktseiten führen. 

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   null),
  ('01991002-0000-7000-8000-000000000047', '01991001-0000-7000-8000-000000000047', 'de',
   'Breadcrumb-Navigation',
   'Guten Tag! Heute werden wir die Funktionalität der Breadcrumb-Navigation auf der gesamten Website testen. Breadcrumbs sind ein wichtiges Navigationselement, das den Benutzern hilft, sich auf der Website zurechtzufinden, indem sie Links zu übergeordneten Seiten und zur Navigationshierarchie bereitstellen. Unser Ziel ist es sicherzustellen, dass die Breadcrumb-Navigation auf allen Seiten der Website korrekt funktioniert und den Benutzern ermöglicht, schnell zwischen verschiedenen Abschnitten zu wechseln.

Vielen Dank für die durchgeführten Tests! Wir freuen uns, Ihnen mitteilen zu können, dass die Website dank Ihrer Bemühungen jetzt einwandfrei funktioniert. Ihre wichtige Arbeit hat unseren Entwicklern geholfen, alle Fehler zu identifizieren und zu beheben. Dank dieser Verbesserung können unsere Benutzer ein stabileres und benutzerfreundlicheres Erlebnis genießen. Vielen Dank für Ihren Beitrag zur Qualität unseres Produkts!

Bitte teste die Funktionalität der Breadcrumb-Navigation auf der gesamten Website. Besuche verschiedene Seiten und stelle sicher, dass die Links korrekt funktionieren und die Breadcrumb-Navigation korrekt angezeigt wird.

Erstelle nach Abschluss des Tests einen Testbericht in Jira und füge den Link zu diesem hier an.',
   null)

on conflict (task_id, locale) do update set
  title = excluded.title,
  instructions_html = excluded.instructions_html,
  hint_text = excluded.hint_text,
  updated_at = statement_timestamp();


-- Trainer-only. `task_model_answers` is the table the learner's RLS cannot
-- reach, which is why the answer key does not live in `task_localizations`.

insert into public.task_model_answers (task_localization_id, model_answer)
values
  ('01991002-0000-7000-8000-000000000003', 'Der Studierende erstellt einen Bug als Ticket in Jira, in dem angegeben wird, dass der Slider beim Klicken auf die Pfeile nicht umschaltet.'),
  ('01991002-0000-7000-8000-000000000006', 'Der Studierende erstellt nach dem Test ein Jira-Ticket als Fehler, beschreibt den Fehler detailliert im Ticket und hängt abschließend einen Link zum Jira-Ticket in der Antwort an.'),
  ('01991002-0000-7000-8000-000000000008', 'Der Studierende bearbeitet das Jira-Ticket aus Aufgabe 6 und dokumentiert seinen Fehlernachtest im Ticket. 

Der Fehlernachtest war erfolgreich. 
Der Fehler wird auf den Status "erledigt" gesetzt.  

Alles funktioniert, der Nachtest war erfolgreich.

Abschließend hängt der Studierende den Link zum Jira Ticket in der Antwort an.'),
  ('01991002-0000-7000-8000-000000000010', 'Der Login-Button hat eine zu grelle Farbe, wodurch der Text darauf schwer lesbar ist.'),
  ('01991002-0000-7000-8000-000000000011', 'Der Student fügt den Link zum Jira-Ticket hinzu. Beachte bitte, dass der Link zum Zurücksetzen des Passworts defekt ist.'),
  ('01991002-0000-7000-8000-000000000013', 'Der Student fügt in Jira einen Link an die Karte an.  
Das E-Mail-Feld kann nicht bearbeitet werden'),
  ('01991002-0000-7000-8000-000000000014', 'Der Student fügt in Jira einen Link an das Ticket an.

Eine Adresse kann erstellt werden, aber sie lässt sich nicht bearbeiten.'),
  ('01991002-0000-7000-8000-000000000015', 'Der Student fügt in Jira einen Link an das Ticket an.

Beachte bitte, dass die Vergleichsliste leer ist.'),
  ('01991002-0000-7000-8000-000000000018', 'Der Student fügt den Link zum Jira-Ticket hinzu. 

Nach dem Hinzufügen ist jedoch ein Teil der Tabelle nicht mehr sichtbar.'),
  ('01991002-0000-7000-8000-000000000020', 'Der Student fügt in Jira einen Link zum Ticket hinzu. 

Die Sortierfunktion arbeitet korrekt.'),
  ('01991002-0000-7000-8000-000000000021', 'Der Student fügt in Jira einen Link zum Ticket hinzu. 

Die Funktion arbeitet korrekt.'),
  ('01991002-0000-7000-8000-000000000022', 'Der Student fügt den Link zum Jira-Ticket hinzu.

Die Funktionalität arbeitet wie erwartet, und der Test war erfolgreich.'),
  ('01991002-0000-7000-8000-000000000023', 'Der Student fügt den Link zum Jira-Ticket hinzu.

Es ist nicht möglich, Daten in das Feld ''Kommentar'' einzugeben'),
  ('01991002-0000-7000-8000-000000000024', 'Der Student fügt den Link zum Jira-Ticket hinzu.

Die Filterfunktion arbeitet nicht korrekt; Produkte werden überhaupt nicht gefiltert.'),
  ('01991002-0000-7000-8000-000000000025', 'Der Student fügt den Link zum Jira-Ticket hinzu.

Der Nachtest wurde erfolgreich abgeschlossen, und die Funktionalität arbeitet jetzt einwandfrei.'),
  ('01991002-0000-7000-8000-000000000026', 'Der Student hat einen Link zum Ticket in Jira hinzugefügt.

Erstelle ein Fehler-Ticket in Jira:

Titel: Die Links „Über uns“ und „Blog“ funktionieren nicht
Beschreibung: Die Links „Über uns“ und „Blog“ im Navigationsmenü sind nicht funktionsfähig.

Schritte zur Reproduktion:

Gehe zur Startseite der Website.
Klicke auf den Link „Über uns“.
Klicke auf den Link „Blog“.

Erwartetes Ergebnis: Die Links sollten auf die entsprechenden Seiten führen.
Tatsächliches Ergebnis: Die Links führen zu einem Fehler oder funktionieren nicht.
Die Links „Über uns“ und „Blog“ funktionieren nicht.'),
  ('01991002-0000-7000-8000-000000000027', 'Der Student hat einen Link zum Ticket in Jira hinzugefügt.

Der Link im Logo funktioniert nicht und führt nicht zur Startseite.'),
  ('01991002-0000-7000-8000-000000000028', 'Der Student hat einen Link zum Ticket in Jira hinzugefügt.

Die Navigation im Footer funktioniert einwandfrei.'),
  ('01991002-0000-7000-8000-000000000029', 'Der Student hat einen Link zum Ticket in Jira hinzugefügt.  

Alles funktioniert'),
  ('01991002-0000-7000-8000-000000000030', 'Der Student erstellt einen Bug als Ticket in Jira.

Fehlerbeschreibung:
In der Favoritenliste wird nur ein Produkt angezeigt, obwohl mehrere hinzugefügt wurden.

Erstellung eines Bugs als Ticket:
Titel: In der Favoritenliste wird nur ein Produkt angezeigt.
Beschreibung: Beim Hinzufügen mehrerer Produkte zur Favoritenliste wird nur eines angezeigt.

Schritte zur Reproduktion:

Füge mehrere Produkte zur Favoritenliste hinzu.
Gehe zur Favoritenliste.
Erwartetes Ergebnis: Alle hinzugefügten Produkte sollten in der Favoritenliste angezeigt werden.
Tatsächliches Ergebnis: Es wird nur ein Produkt angezeigt.

Status: Das Ticket wurde an den Programmierer zur Fehlerbehebung übergeben.'),
  ('01991002-0000-7000-8000-000000000031', 'Der Student erstellt einen Bug als Ticket in Jira.

Titel: Produkte werden nicht zur Favoritenliste hinzugefügt
Beschreibung: Beim Versuch, Produkte zur Favoritenliste hinzuzufügen, werden diese nicht hinzugefügt.

Schritte zur Reproduktion:

Gehe zur Produktseite.
Klicke auf die Schaltfläche "Zu Favoriten hinzufügen".
Erwartetes Ergebnis: Das Produkt sollte zur Favoritenliste hinzugefügt werden.
Tatsächliches Ergebnis: Das Produkt wird nicht hinzugefügt.

Status: Das Ticket wurde an den Entwickler zur Fehlerbehebung weitergeleitet.

Empfehlungen für das "White-Box"-Testing:
Verfahrenstyp: Befehlsabdeckung (die einfachste Art des "White-Box"-Testings).'),
  ('01991002-0000-7000-8000-000000000032', 'Der Student fügt den Link zum Ticket in Jira hinzu.

Die Funktionalität wurde überprüft und funktioniert jetzt einwandfrei.

Dokumentiere die Ergebnisse des Nachtests im Jira-Ticket für den gemeldeten Fehler.'),
  ('01991002-0000-7000-8000-000000000033', 'Der Student erstellt einen Bug als Ticket in Jira und fügt den Link hinzu.

Der Fehler besteht darin, dass beim Hinzufügen mehrerer Artikel zum Warenkorb immer nur ein Artikel angezeigt wird.'),
  ('01991002-0000-7000-8000-000000000034', 'Der Student fügt den Link im Bug-Ticket in Jira hinzu.

Der Fehler hat sich verschlimmert: Artikel können jetzt überhaupt nicht mehr zum Warenkorb hinzugefügt werden.'),
  ('01991002-0000-7000-8000-000000000035', 'Der Student fügt den Link im Bug-Ticket in Jira hinzu.

Die Funktionalität wurde überprüft und funktioniert jetzt einwandfrei.'),
  ('01991002-0000-7000-8000-000000000036', 'Der Student fügt den Link zum Ticket, in Jira, hinzu.   

Die Bestellung funktioniert nicht, da keine Benutzerdaten angegeben werden können.'),
  ('01991002-0000-7000-8000-000000000037', 'Der Student fügt den Link zum Ticket, in Jira, hinzu. 

Die Bestellung funktioniert nicht, da keine Benutzerdaten angegeben werden können.'),
  ('01991002-0000-7000-8000-000000000038', 'Der Student fügt den Link zum Ticket, in Jira, hinzu. 

Die Bestellung funktioniert.'),
  ('01991002-0000-7000-8000-000000000039', 'Der Student fügt den Link zum Ticket, in Jira, hinzu. 

Es ist unmöglich, mit der Rückgabe von Waren auf die entsrechende Seite zuzugreifen; die Weiterleitung erfolgt stattdessen auf die Hauptseite.'),
  ('01991002-0000-7000-8000-000000000040', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu. 

Alles funktioniert korrekt. Der Test war erfolgreich.'),
  ('01991002-0000-7000-8000-000000000041', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu. 

Der Bestellverlauf ist leer, trotz der erfolgreich aufgegebenen Bestellung.'),
  ('01991002-0000-7000-8000-000000000042', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu.  

Der Bestellverlauf ist leer, trotz erfolgreich abgeschlossener Bestellung.'),
  ('01991002-0000-7000-8000-000000000043', 'Der Student fügt einen Link zu einem Ticket, in Jira, hinzu.  

Beim Anzeigen der Karten im List-Format erscheinen die Artikel nicht, und das festgelegte Limit wird nicht eingehalten.'),
  ('01991002-0000-7000-8000-000000000044', 'Der Student fügt einen Link zu einem Jira-Ticket hinzu.  

Alles funktioniert.'),
  ('01991002-0000-7000-8000-000000000045', 'Der Student fügt einen Link zu einem Jira-Ticket hinzu.

Der Text auf der Seite ist zu klein, die Farben sind zu blass, und der Text ist schwer lesbar.'),
  ('01991002-0000-7000-8000-000000000046', 'Überprüfe, ob der Link zur Aufgabe in Jira korrekt angehängt ist. 

Alles funktioniert.'),
  ('01991002-0000-7000-8000-000000000047', 'Stelle sicher, dass der Student den Link zur Aufgabe in Jira angehängt hat. 

Vergewissere dich, dass alles korrekt funktioniert.')

on conflict (task_localization_id) do update set
  model_answer = excluded.model_answer,
  updated_at = statement_timestamp();


-- ─── The test DURING a knowledge task ──────────────────────────────────────
-- `single` selection, so minimum and maximum must both be 1 — readiness checks
-- exactly that pair, and every row in the sheet has exactly one right answer.

insert into public.task_assessments (
  task_id, question_translations, selection_mode,
  minimum_selections, maximum_selections
)
values
  ('01991001-0000-7000-8000-000000000001', jsonb_build_object('de', 'Was sind Softwaretests?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000002', jsonb_build_object('de', 'Warum ist das Testen notwendig?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000004', jsonb_build_object('de', 'Welche Softwareentwicklungslebenszyklus-Modelle kennst du?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000005', jsonb_build_object('de', 'Welche Teststufen umfasst das V-Modell?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000007', jsonb_build_object('de', 'Was ist eine Fehlhandlung?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000009', jsonb_build_object('de', 'Was ist der Peer-Review-Prozess im Rahmen der Softwareentwicklung?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000012', jsonb_build_object('de', 'Welche Rolle spielen Checklisten für erfolgreiche Reviews im Softwareentwicklungsprozess?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000016', jsonb_build_object('de', 'In welcher Testaktivität wird der Testausführungsplan erstellt?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000017', jsonb_build_object('de', 'Was umfasst das Monitoring und die Steuerung von Tests?'), 'single', 1, 1),
  ('01991001-0000-7000-8000-000000000019', jsonb_build_object('de', 'Welche Arten von Testwerkzeugen gibt es?'), 'single', 1, 1)

on conflict (task_id) do update set
  question_translations = excluded.question_translations,
  selection_mode = excluded.selection_mode,
  minimum_selections = excluded.minimum_selections,
  maximum_selections = excluded.maximum_selections,
  updated_at = statement_timestamp();


-- No `is_correct` here: `20260717098000_protect_assessment_solutions` DROPPED
-- that column precisely so a learner-readable row can never carry the answer.
-- The solution goes into `task_option_answers` below.

insert into public.task_options (id, task_id, option_key, labels, position)
values
  ('01991005-0000-7000-8000-000000000001', '01991001-0000-7000-8000-000000000001', 'a',
   jsonb_build_object('de', 'Testen neuer Rasierer'), 0),
  ('01991005-0000-7000-8000-000000000002', '01991001-0000-7000-8000-000000000001', 'b',
   jsonb_build_object('de', 'Testen neuer Produkte in der Einkaufsstraße'), 1),
  ('01991005-0000-7000-8000-000000000003', '01991001-0000-7000-8000-000000000001', 'c',
   jsonb_build_object('de', 'Softwaretests prüfen Anforderungen, identifizieren Fehler und gewährleisten die Qualität in der Software.'), 2),
  ('01991005-0000-7000-8000-000000000004', '01991001-0000-7000-8000-000000000001', 'd',
   jsonb_build_object('de', 'Neue Funktionen zum Testen programmieren.'), 3),
  ('01991005-0000-7000-8000-000000000005', '01991001-0000-7000-8000-000000000002', 'a',
   jsonb_build_object('de', 'Um den Schönheitsgrad des Softwareprodukts zu erhöhen.'), 0),
  ('01991005-0000-7000-8000-000000000006', '01991001-0000-7000-8000-000000000002', 'b',
   jsonb_build_object('de', 'Um Fehler zu identifizieren und Risiken im Entwicklungsprozess zu reduzieren.'), 1),
  ('01991005-0000-7000-8000-000000000007', '01991001-0000-7000-8000-000000000002', 'c',
   jsonb_build_object('de', 'Um die Anzahl der Funktionen in der Software zu erhöhen.'), 2),
  ('01991005-0000-7000-8000-000000000008', '01991001-0000-7000-8000-000000000002', 'd',
   jsonb_build_object('de', 'Um den Entwicklungsprozess zu beschleunigen.'), 3),
  ('01991005-0000-7000-8000-000000000009', '01991001-0000-7000-8000-000000000004', 'a',
   jsonb_build_object('de', 'Wasserfallmodell, Spiralmodell, Prototyping-Modell, Extremprogrammierung (Extreme Programming, XP)'), 0),
  ('01991005-0000-7000-8000-000000000010', '01991001-0000-7000-8000-000000000004', 'b',
   jsonb_build_object('de', 'Kaskadenmodell, Modell von Wachstum und Modifikation, Modell von Forschung und Modifikation, Modell von Forschung und Entwicklung'), 1),
  ('01991005-0000-7000-8000-000000000011', '01991001-0000-7000-8000-000000000004', 'c',
   jsonb_build_object('de', 'Lebenszyklus eines Hundes, Lebenszyklus einer Katze, Lebenszyklus einer Pflanze'), 2),
  ('01991005-0000-7000-8000-000000000012', '01991001-0000-7000-8000-000000000004', 'd',
   jsonb_build_object('de', 'Das Parallel-Cluster-Modell und das Recursive-Flow-Modell.'), 3),
  ('01991005-0000-7000-8000-000000000013', '01991001-0000-7000-8000-000000000005', 'a',
   jsonb_build_object('de', 'Komponententests, Integrationstests, Systemtests, Abnahmetest'), 0),
  ('01991005-0000-7000-8000-000000000014', '01991001-0000-7000-8000-000000000005', 'b',
   jsonb_build_object('de', 'Definition von Anforderungen, Analyse, Entwurf, Implementierung, Prüfung'), 1),
  ('01991005-0000-7000-8000-000000000015', '01991001-0000-7000-8000-000000000005', 'c',
   jsonb_build_object('de', 'Funktionale Tests, nicht-funktionale Tests, Black-Box-Tests und White-Box-Tests'), 2),
  ('01991005-0000-7000-8000-000000000016', '01991001-0000-7000-8000-000000000005', 'd',
   jsonb_build_object('de', 'Keines der oben genannten'), 3),
  ('01991005-0000-7000-8000-000000000017', '01991001-0000-7000-8000-000000000007', 'a',
   jsonb_build_object('de', 'Ein Ereignis, bei dem eine Komponente oder ein System die geforderte Funktion nicht im vorgesehenen Umfang erfüllt.'), 0),
  ('01991005-0000-7000-8000-000000000018', '01991001-0000-7000-8000-000000000007', 'b',
   jsonb_build_object('de', 'Menschliche Handlungen, die zu einem falschen Ergebnis führen.'), 1),
  ('01991005-0000-7000-8000-000000000019', '01991001-0000-7000-8000-000000000007', 'c',
   jsonb_build_object('de', 'Unzulänglichkeit oder Defekt im Arbeitsmaterial, wodurch es nicht den Anforderungen oder Spezifikationen entspricht.'), 2),
  ('01991005-0000-7000-8000-000000000020', '01991001-0000-7000-8000-000000000007', 'd',
   jsonb_build_object('de', 'Alle drei sind richtig.'), 3),
  ('01991005-0000-7000-8000-000000000021', '01991001-0000-7000-8000-000000000009', 'a',
   jsonb_build_object('de', 'Überprüfung auf grammatikalische Fehler im Code'), 0),
  ('01991005-0000-7000-8000-000000000022', '01991001-0000-7000-8000-000000000009', 'b',
   jsonb_build_object('de', 'Bewertung der Qualität und Übereinstimmung des Codes mit festgelegten Standards und Anforderungen'), 1),
  ('01991005-0000-7000-8000-000000000023', '01991001-0000-7000-8000-000000000009', 'c',
   jsonb_build_object('de', 'Durchführung von Tests der Benutzeroberfläche'), 2),
  ('01991005-0000-7000-8000-000000000024', '01991001-0000-7000-8000-000000000009', 'd',
   jsonb_build_object('de', 'Eine Reviewart, die durch andere Personen mit denselben Fähigkeiten zum Erstellen des Arbeitsergebnisses ausgeführt wird.'), 3),
  ('01991005-0000-7000-8000-000000000025', '01991001-0000-7000-8000-000000000012', 'a',
   jsonb_build_object('de', 'Gewährleistung der Datensicherheit'), 0),
  ('01991005-0000-7000-8000-000000000026', '01991001-0000-7000-8000-000000000012', 'b',
   jsonb_build_object('de', 'Verbesserung der Programmleistung'), 1),
  ('01991005-0000-7000-8000-000000000027', '01991001-0000-7000-8000-000000000012', 'c',
   jsonb_build_object('de', 'Sicherstellung der Vollständigkeit und Qualität des Reviews'), 2),
  ('01991005-0000-7000-8000-000000000028', '01991001-0000-7000-8000-000000000012', 'd',
   jsonb_build_object('de', 'Spielt keine Rolle'), 3),
  ('01991005-0000-7000-8000-000000000029', '01991001-0000-7000-8000-000000000016', 'a',
   jsonb_build_object('de', 'Bei der Testplanung'), 0),
  ('01991005-0000-7000-8000-000000000030', '01991001-0000-7000-8000-000000000016', 'b',
   jsonb_build_object('de', 'Bei der Testvorbereitung'), 1),
  ('01991005-0000-7000-8000-000000000031', '01991001-0000-7000-8000-000000000016', 'c',
   jsonb_build_object('de', 'Bei der Durchführung von Tests'), 2),
  ('01991005-0000-7000-8000-000000000032', '01991001-0000-7000-8000-000000000016', 'd',
   jsonb_build_object('de', 'Bei der Testrealisierung'), 3),
  ('01991005-0000-7000-8000-000000000033', '01991001-0000-7000-8000-000000000017', 'a',
   jsonb_build_object('de', 'Testfortschrittsbericht'), 0),
  ('01991005-0000-7000-8000-000000000034', '01991001-0000-7000-8000-000000000017', 'b',
   jsonb_build_object('de', 'Registrierung von Fehlern und Mängeln'), 1),
  ('01991005-0000-7000-8000-000000000035', '01991001-0000-7000-8000-000000000017', 'c',
   jsonb_build_object('de', 'Analyse der Testergebnisse'), 2),
  ('01991005-0000-7000-8000-000000000036', '01991001-0000-7000-8000-000000000017', 'd',
   jsonb_build_object('de', 'Alle oben genannten'), 3),
  ('01991005-0000-7000-8000-000000000037', '01991001-0000-7000-8000-000000000019', 'a',
   jsonb_build_object('de', 'Werkzeuge zur Testdurchführung'), 0),
  ('01991005-0000-7000-8000-000000000038', '01991001-0000-7000-8000-000000000019', 'b',
   jsonb_build_object('de', 'Managementwerkzeuge'), 1),
  ('01991005-0000-7000-8000-000000000039', '01991001-0000-7000-8000-000000000019', 'c',
   jsonb_build_object('de', 'Werkzeuge für die Zusammenarbeit'), 2),
  ('01991005-0000-7000-8000-000000000040', '01991001-0000-7000-8000-000000000019', 'd',
   jsonb_build_object('de', 'Alle oben genannten'), 3)

on conflict (id) do update set
  labels = excluded.labels,
  position = excluded.position,
  updated_at = statement_timestamp();


-- The solution, in the table the learner's RLS cannot reach.

insert into public.task_option_answers (task_option_id, is_correct)
values
  ('01991005-0000-7000-8000-000000000001', false),
  ('01991005-0000-7000-8000-000000000002', false),
  ('01991005-0000-7000-8000-000000000003', true),
  ('01991005-0000-7000-8000-000000000004', false),
  ('01991005-0000-7000-8000-000000000005', false),
  ('01991005-0000-7000-8000-000000000006', true),
  ('01991005-0000-7000-8000-000000000007', false),
  ('01991005-0000-7000-8000-000000000008', false),
  ('01991005-0000-7000-8000-000000000009', true),
  ('01991005-0000-7000-8000-000000000010', false),
  ('01991005-0000-7000-8000-000000000011', false),
  ('01991005-0000-7000-8000-000000000012', false),
  ('01991005-0000-7000-8000-000000000013', true),
  ('01991005-0000-7000-8000-000000000014', false),
  ('01991005-0000-7000-8000-000000000015', false),
  ('01991005-0000-7000-8000-000000000016', false),
  ('01991005-0000-7000-8000-000000000017', false),
  ('01991005-0000-7000-8000-000000000018', true),
  ('01991005-0000-7000-8000-000000000019', false),
  ('01991005-0000-7000-8000-000000000020', false),
  ('01991005-0000-7000-8000-000000000021', false),
  ('01991005-0000-7000-8000-000000000022', false),
  ('01991005-0000-7000-8000-000000000023', false),
  ('01991005-0000-7000-8000-000000000024', true),
  ('01991005-0000-7000-8000-000000000025', false),
  ('01991005-0000-7000-8000-000000000026', false),
  ('01991005-0000-7000-8000-000000000027', true),
  ('01991005-0000-7000-8000-000000000028', false),
  ('01991005-0000-7000-8000-000000000029', false),
  ('01991005-0000-7000-8000-000000000030', false),
  ('01991005-0000-7000-8000-000000000031', false),
  ('01991005-0000-7000-8000-000000000032', true),
  ('01991005-0000-7000-8000-000000000033', false),
  ('01991005-0000-7000-8000-000000000034', false),
  ('01991005-0000-7000-8000-000000000035', false),
  ('01991005-0000-7000-8000-000000000036', true),
  ('01991005-0000-7000-8000-000000000037', false),
  ('01991005-0000-7000-8000-000000000038', false),
  ('01991005-0000-7000-8000-000000000039', false),
  ('01991005-0000-7000-8000-000000000040', true)

on conflict (task_option_id) do update set
  is_correct = excluded.is_correct,
  updated_at = statement_timestamp();


-- ─── 6. The link between the two halves of a row ───────────────────────────
-- Four rows carry both a Testfrage and a Task hash. In those, the knowledge
-- task waits on that row's Arena screen: locked until a trainer approves the
-- Arena submission. `required_hunt_scenario_id` is refused on a hunt task by a
-- CHECK, which is why it can only ever sit on the knowledge half.

update public.tasks task_record
set required_hunt_scenario_id = (
      select id from public.hunt_scenarios
      where code = gate.scenario_code
      order by scenario_version desc limit 1
    )
from (values
  ('01991001-0000-7000-8000-000000000007'::uuid, 'rw6e'),
  ('01991001-0000-7000-8000-000000000009'::uuid, '7ctc'),
  ('01991001-0000-7000-8000-000000000012'::uuid, '9nft'),
  ('01991001-0000-7000-8000-000000000019'::uuid, 'c02w')

) as gate(task_id, scenario_code)
where task_record.id = gate.task_id;


-- Sequence: each task requires the one before it, so the 43 days are walked in
-- order. `prerequisites` is what `learner_snapshot_task_lock_reasons` already
-- reads, so this needs no new machinery.

insert into public.prerequisites (
  id, organization_id, target_task_id, required_task_id
)
select link.id,
       (select id from public.organizations
        where is_default and state = 'active' and archived_at is null),
       link.target_task_id, link.required_task_id
from (values
  ('01991009-0000-7000-8000-000000000002'::uuid, '01991001-0000-7000-8000-000000000002'::uuid, '01991001-0000-7000-8000-000000000001'::uuid),
  ('01991009-0000-7000-8000-000000000003'::uuid, '01991001-0000-7000-8000-000000000003'::uuid, '01991001-0000-7000-8000-000000000002'::uuid),
  ('01991009-0000-7000-8000-000000000004'::uuid, '01991001-0000-7000-8000-000000000004'::uuid, '01991001-0000-7000-8000-000000000003'::uuid),
  ('01991009-0000-7000-8000-000000000005'::uuid, '01991001-0000-7000-8000-000000000005'::uuid, '01991001-0000-7000-8000-000000000004'::uuid),
  ('01991009-0000-7000-8000-000000000006'::uuid, '01991001-0000-7000-8000-000000000006'::uuid, '01991001-0000-7000-8000-000000000005'::uuid),
  ('01991009-0000-7000-8000-000000000007'::uuid, '01991001-0000-7000-8000-000000000007'::uuid, '01991001-0000-7000-8000-000000000006'::uuid),
  ('01991009-0000-7000-8000-000000000008'::uuid, '01991001-0000-7000-8000-000000000008'::uuid, '01991001-0000-7000-8000-000000000007'::uuid),
  ('01991009-0000-7000-8000-000000000009'::uuid, '01991001-0000-7000-8000-000000000009'::uuid, '01991001-0000-7000-8000-000000000008'::uuid),
  ('01991009-0000-7000-8000-000000000010'::uuid, '01991001-0000-7000-8000-000000000010'::uuid, '01991001-0000-7000-8000-000000000009'::uuid),
  ('01991009-0000-7000-8000-000000000011'::uuid, '01991001-0000-7000-8000-000000000011'::uuid, '01991001-0000-7000-8000-000000000010'::uuid),
  ('01991009-0000-7000-8000-000000000012'::uuid, '01991001-0000-7000-8000-000000000012'::uuid, '01991001-0000-7000-8000-000000000011'::uuid),
  ('01991009-0000-7000-8000-000000000013'::uuid, '01991001-0000-7000-8000-000000000013'::uuid, '01991001-0000-7000-8000-000000000012'::uuid),
  ('01991009-0000-7000-8000-000000000014'::uuid, '01991001-0000-7000-8000-000000000014'::uuid, '01991001-0000-7000-8000-000000000013'::uuid),
  ('01991009-0000-7000-8000-000000000015'::uuid, '01991001-0000-7000-8000-000000000015'::uuid, '01991001-0000-7000-8000-000000000014'::uuid),
  ('01991009-0000-7000-8000-000000000016'::uuid, '01991001-0000-7000-8000-000000000016'::uuid, '01991001-0000-7000-8000-000000000015'::uuid),
  ('01991009-0000-7000-8000-000000000017'::uuid, '01991001-0000-7000-8000-000000000017'::uuid, '01991001-0000-7000-8000-000000000016'::uuid),
  ('01991009-0000-7000-8000-000000000018'::uuid, '01991001-0000-7000-8000-000000000018'::uuid, '01991001-0000-7000-8000-000000000017'::uuid),
  ('01991009-0000-7000-8000-000000000019'::uuid, '01991001-0000-7000-8000-000000000019'::uuid, '01991001-0000-7000-8000-000000000018'::uuid),
  ('01991009-0000-7000-8000-000000000020'::uuid, '01991001-0000-7000-8000-000000000020'::uuid, '01991001-0000-7000-8000-000000000019'::uuid),
  ('01991009-0000-7000-8000-000000000021'::uuid, '01991001-0000-7000-8000-000000000021'::uuid, '01991001-0000-7000-8000-000000000020'::uuid),
  ('01991009-0000-7000-8000-000000000022'::uuid, '01991001-0000-7000-8000-000000000022'::uuid, '01991001-0000-7000-8000-000000000021'::uuid),
  ('01991009-0000-7000-8000-000000000023'::uuid, '01991001-0000-7000-8000-000000000023'::uuid, '01991001-0000-7000-8000-000000000022'::uuid),
  ('01991009-0000-7000-8000-000000000024'::uuid, '01991001-0000-7000-8000-000000000024'::uuid, '01991001-0000-7000-8000-000000000023'::uuid),
  ('01991009-0000-7000-8000-000000000025'::uuid, '01991001-0000-7000-8000-000000000025'::uuid, '01991001-0000-7000-8000-000000000024'::uuid),
  ('01991009-0000-7000-8000-000000000026'::uuid, '01991001-0000-7000-8000-000000000026'::uuid, '01991001-0000-7000-8000-000000000025'::uuid),
  ('01991009-0000-7000-8000-000000000027'::uuid, '01991001-0000-7000-8000-000000000027'::uuid, '01991001-0000-7000-8000-000000000026'::uuid),
  ('01991009-0000-7000-8000-000000000028'::uuid, '01991001-0000-7000-8000-000000000028'::uuid, '01991001-0000-7000-8000-000000000027'::uuid),
  ('01991009-0000-7000-8000-000000000029'::uuid, '01991001-0000-7000-8000-000000000029'::uuid, '01991001-0000-7000-8000-000000000028'::uuid),
  ('01991009-0000-7000-8000-000000000030'::uuid, '01991001-0000-7000-8000-000000000030'::uuid, '01991001-0000-7000-8000-000000000029'::uuid),
  ('01991009-0000-7000-8000-000000000031'::uuid, '01991001-0000-7000-8000-000000000031'::uuid, '01991001-0000-7000-8000-000000000030'::uuid),
  ('01991009-0000-7000-8000-000000000032'::uuid, '01991001-0000-7000-8000-000000000032'::uuid, '01991001-0000-7000-8000-000000000031'::uuid),
  ('01991009-0000-7000-8000-000000000033'::uuid, '01991001-0000-7000-8000-000000000033'::uuid, '01991001-0000-7000-8000-000000000032'::uuid),
  ('01991009-0000-7000-8000-000000000034'::uuid, '01991001-0000-7000-8000-000000000034'::uuid, '01991001-0000-7000-8000-000000000033'::uuid),
  ('01991009-0000-7000-8000-000000000035'::uuid, '01991001-0000-7000-8000-000000000035'::uuid, '01991001-0000-7000-8000-000000000034'::uuid),
  ('01991009-0000-7000-8000-000000000036'::uuid, '01991001-0000-7000-8000-000000000036'::uuid, '01991001-0000-7000-8000-000000000035'::uuid),
  ('01991009-0000-7000-8000-000000000037'::uuid, '01991001-0000-7000-8000-000000000037'::uuid, '01991001-0000-7000-8000-000000000036'::uuid),
  ('01991009-0000-7000-8000-000000000038'::uuid, '01991001-0000-7000-8000-000000000038'::uuid, '01991001-0000-7000-8000-000000000037'::uuid),
  ('01991009-0000-7000-8000-000000000039'::uuid, '01991001-0000-7000-8000-000000000039'::uuid, '01991001-0000-7000-8000-000000000038'::uuid),
  ('01991009-0000-7000-8000-000000000040'::uuid, '01991001-0000-7000-8000-000000000040'::uuid, '01991001-0000-7000-8000-000000000039'::uuid),
  ('01991009-0000-7000-8000-000000000041'::uuid, '01991001-0000-7000-8000-000000000041'::uuid, '01991001-0000-7000-8000-000000000040'::uuid),
  ('01991009-0000-7000-8000-000000000042'::uuid, '01991001-0000-7000-8000-000000000042'::uuid, '01991001-0000-7000-8000-000000000041'::uuid),
  ('01991009-0000-7000-8000-000000000043'::uuid, '01991001-0000-7000-8000-000000000043'::uuid, '01991001-0000-7000-8000-000000000042'::uuid),
  ('01991009-0000-7000-8000-000000000044'::uuid, '01991001-0000-7000-8000-000000000044'::uuid, '01991001-0000-7000-8000-000000000043'::uuid),
  ('01991009-0000-7000-8000-000000000045'::uuid, '01991001-0000-7000-8000-000000000045'::uuid, '01991001-0000-7000-8000-000000000044'::uuid),
  ('01991009-0000-7000-8000-000000000046'::uuid, '01991001-0000-7000-8000-000000000046'::uuid, '01991001-0000-7000-8000-000000000045'::uuid),
  ('01991009-0000-7000-8000-000000000047'::uuid, '01991001-0000-7000-8000-000000000047'::uuid, '01991001-0000-7000-8000-000000000046'::uuid)

) as link(id, target_task_id, required_task_id)
on conflict (id) do nothing;


end
$content$;

commit;


-- ─── 7. Review and publish, as admin1 ──────────────────────────────────────
-- Through the product's own workflow rather than by writing `state` and
-- `snapshot` by hand. `submit_content_for_review` → `decide_content_review` →
-- `publish_content_version` is where every readiness rule is enforced and where
-- the learner snapshot is built and validated; setting the columns directly
-- would skip all of it and could leave a snapshot that silently hides the
-- course from every enrolled learner.
--
-- The three RPCs are `security definer` and read `auth.uid()`, so the actor is
-- supplied through the JWT claim rather than by changing role.

do $publish$
declare
  actor constant uuid := '01991007-0000-7000-8000-000000000001';
  version_id constant uuid := '01991000-0000-7000-8000-000000000002';
  version_row public.content_versions;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', actor, 'role', 'authenticated')::text,
                     true);

  select * into version_row from public.content_versions where id = version_id;
  if version_row.state = 'published' then
    raise notice 'content version is already published — nothing to do';
    return;
  end if;

  if version_row.state = 'draft' then
    version_row := public.submit_content_for_review(
      version_id, version_row.row_version,
      'praxiskurs-import-submit-0001', app_private.uuid7()
    );
  end if;

  version_row := public.decide_content_review(
    version_id, version_row.row_version, 'approved',
    'Import aus DiTeLeApp_UseCases.xlsx',
    'praxiskurs-import-review-0001', app_private.uuid7()
  );

  version_row := public.publish_content_version(
    version_id, version_row.row_version,
    'praxiskurs-import-publish-0001', app_private.uuid7()
  );

  raise notice 'published version % of %', version_row.version_number, version_id;
end
$publish$;

update public.courses set state = 'active', updated_at = statement_timestamp()
where id = '01991000-0000-7000-8000-000000000001';

-- ─── 8. Put the accounts on the course ─────────────────────────────────────
-- Through the same RPCs the admin studio's People screen calls, so the learner
-- gets the default course cohort, the audit events and the notification that a
-- hand-written `insert into enrollments` would skip. Both are idempotent: an
-- existing enrolment is returned rather than duplicated.

do $assign$
declare
  actor constant uuid := '01991007-0000-7000-8000-000000000001';
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', actor, 'role', 'authenticated')::text,
                     true);

  perform public.enroll_learner_in_course(
    '01991000-0000-7000-8000-000000000001', '01991007-0000-7000-8000-000000000003',
    'Praxiskurs import', app_private.uuid7()
  );
  perform public.assign_trainer_to_course(
    '01991000-0000-7000-8000-000000000001', '01991007-0000-7000-8000-000000000002', app_private.uuid7()
  );
end
$assign$;


-- ─── Verification, by effect and not by "the inserts ran" ──────────────────
do $verify$
declare
  observed integer;
  snapshot_row public.content_versions;
begin
  select count(*) into observed from public.tasks
  where content_version_id = '01991000-0000-7000-8000-000000000002';
  if observed <> 47 then
    raise exception 'expected 47 tasks, found %', observed;
  end if;

  select count(*) into observed from public.hunt_scenarios
  where code in (select external_id from public.tasks
                 where content_version_id = '01991000-0000-7000-8000-000000000002' and source_system = 'arena');
  if observed <> 37 then
    raise exception 'expected 37 Arena screens, found %', observed;
  end if;

  -- Every knowledge task must have exactly one correct answer recorded in the
  -- protected table. Scoring reads `task_option_answers`, not `task_options`.
  select count(*) into observed
  from public.tasks task_record
  join public.task_assessments assessment on assessment.task_id = task_record.id
  where task_record.content_version_id = '01991000-0000-7000-8000-000000000002'
    and (select count(*) from public.task_options option_record
         join public.task_option_answers answer
           on answer.task_option_id = option_record.id and answer.is_correct
         where option_record.task_id = task_record.id) <> 1;
  if observed <> 0 then
    raise exception '% knowledge tasks do not have exactly one correct answer', observed;
  end if;

  select count(*) into observed from public.tasks
  where content_version_id = '01991000-0000-7000-8000-000000000002' and required_hunt_scenario_id is not null;
  if observed <> 4 then
    raise exception 'expected 4 gated knowledge tasks, found %', observed;
  end if;

  -- The one that actually decides whether a learner sees anything. An invalid
  -- learner snapshot does not error — it makes the course disappear.
  select * into snapshot_row from public.content_versions where id = '01991000-0000-7000-8000-000000000002';
  if snapshot_row.state <> 'published' then
    raise exception 'content version is %, not published', snapshot_row.state;
  end if;
  if not app_private.is_valid_learner_content_snapshot(
       snapshot_row.snapshot, '01991000-0000-7000-8000-000000000001', 'praxiskurs-softwaretester-foundation-level', '01991000-0000-7000-8000-000000000002', 1) then
    raise exception 'the published snapshot is not a valid learner snapshot';
  end if;
  if not app_private.is_valid_public_catalog_snapshot(
       snapshot_row.snapshot, '01991000-0000-7000-8000-000000000001', 'praxiskurs-softwaretester-foundation-level', '01991000-0000-7000-8000-000000000002', 1) then
    raise exception 'the published snapshot is not a valid catalogue snapshot';
  end if;

  -- The accounts, and that they can actually sign in: a confirmed e-mail, a
  -- password that verifies, and an identity row. Counting `auth.users` alone
  -- would pass for an account nobody can log into.
  select count(*) into observed
  from auth.users account
  join auth.identities identity on identity.user_id = account.id
  join public.profiles profile_record on profile_record.user_id = account.id
  where account.email in ('admin1@gmail.com', 'trainer1@gmail.com', 'student1@gmail.com')
    and account.email_confirmed_at is not null
    and account.encrypted_password = extensions.crypt('123123123', account.encrypted_password)
    and profile_record.state = 'active';
  if observed <> 3 then
    raise exception 'expected 3 sign-in-ready accounts, found %', observed;
  end if;

  select count(*) into observed from public.enrollments
  where course_id = '01991000-0000-7000-8000-000000000001' and learner_id = '01991007-0000-7000-8000-000000000003' and state = 'assigned';
  if observed <> 1 then
    raise exception 'student1 is not assigned to the course';
  end if;

  select count(*) into observed from public.course_trainers
  where course_id = '01991000-0000-7000-8000-000000000001' and trainer_id = '01991007-0000-7000-8000-000000000002' and removed_at is null;
  if observed <> 1 then
    raise exception 'trainer1 is not assigned to the course';
  end if;

  raise notice 'Praxiskurs imported: 47 tasks, 37 Arena screens, published';
end
$verify$;
