# DiTeLe — QA Test Plan

**For:** the testing team
**Applies to:** commit `b5fbdde` and later
**Last verified against a running build:** 2026-07-22

Every step, label and expected result below was executed against a production
build of this repository and copied from what the screen actually showed. Where
something is known to be broken, it is in [§8 Known issues](#8-known-issues) with
the reason — please do not re-report those. Where something is not yet built, it
is in [§9 Not built yet](#9-not-built-yet) — please do not test it.

If a step here does not match the app, **that is a bug in this document** and we
want to hear about it. Say which step number.

---

## 1. Before you start

### 1.1 Run the app

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

Use `npm run build && npm start`, not `npm run dev`, for anything you intend to
file a bug against. The dev server keeps a compilation cache that can serve a
half-updated module graph and throw errors that do not exist in the source — see
[§8.1](#81-referenceerror-x-is-not-defined-in-the-dev-server-only).

### 1.2 Test accounts

All four share the password `123123123`.

| Account | Role | Lands on after login |
|---|---|---|
| `learner@ditele.local` | Learner | `/de/learn` |
| `trainer@ditele.local` | Trainer | `/de/trainer` |
| `admin@ditele.local` | Admin | `/de/admin` |
| `org-admin@ditele.local` | Organisation admin → treated as admin | `/de/admin` |

> ⚠️ **Sign-in is rate limited: 5 attempts per address and 30 per browser, per 15
> minutes.** Switching roles repeatedly will trip it, and once tripped even the
> correct password is refused until the window passes. See
> [§8.5](#85-zu-viele-versuche-after-repeated-sign-ins).

### 1.3 Languages

The URL carries the language: `/de/…`, `/en/…`, `/ru/…`.

**Course content is German-only by design.** Task titles, instructions and course
descriptions stay German on `/en` and `/ru`. That is not a bug. Only *interface*
strings — navigation, buttons, headings, labels — are translated. Report an
untranslated **interface** string; do not report untranslated **content**.

### 1.4 How to report

State: the URL, the account, the language, what you did, what you expected, what
happened. A screenshot of the whole window beats a crop. If the browser console
or the terminal showed an error, paste it whole.

---

## 2. Navigation — what each role should see

Verified in both languages. The header shows the primary items; the rest live
behind **Mehr / More**.

| Role | Primary (DE) | Behind "Mehr" (DE) |
|---|---|---|
| Learner | Start · Kurse · Aufgaben · Arena | Fragen · Verlauf · Zertifikate · Benachrichtigungen · Profil |
| Trainer | Übersicht · Reviews · Fragen | Fortschritt · Verlauf · Frage-Archiv · Profil |
| Admin | Übersicht · Kurse · Benutzer | Aufgaben · Fortschritt · Kursanfragen · Fehlermeldungen · Einstellungen · Profil |

| Role | Primary (EN) | Behind "More" (EN) |
|---|---|---|
| Learner | Home · Courses · Tasks · Arena | Questions · Learning history · Certificates · Notifications · Profile |
| Trainer | Overview · Submissions · Questions | Learner progress · Learning history · Review history · Profile |
| Admin | Overview · Courses · Users | Tasks · Learner progress · Applications · Reports · Settings · Profile |

### TC-NAV-01 — exactly one item is highlighted
1. Sign in as any role.
2. Click each primary item in turn.

**Expect:** on every page **exactly one** navigation item is red with an
underline. Never two, never zero. On a page that lives behind *Mehr*, the *Mehr*
button itself is highlighted.

### TC-NAV-02 — nothing is unreachable
1. Sign in as each role.
2. Open every item in the primary row and behind *Mehr*.

**Expect:** every item opens a page with real content. No 404, no blank page.

### TC-NAV-03 — below 1024px the bar moves to the bottom
1. Narrow the window under 1024px.

**Expect:** the top navigation disappears and a bottom tab bar takes over with
four tabs plus *Mehr*. Content is never hidden behind the bar — scroll to the
bottom and the last row is fully visible.

---

## 3. Sign in and sign out

### TC-AUTH-01 — sign in
1. Open `/de/login`, enter an account from §1.2, submit.

**Expect:** you land on that role's start page (§1.2), and the avatar with your
initials appears top right.

### TC-AUTH-02 — wrong password says the same thing as unknown user
1. Sign in with a real address and a wrong password.
2. Sign in with an address that does not exist.

**Expect:** the **same** message both times — the app must not reveal whether an
address is registered.

### TC-AUTH-03 — sign out works from every role
1. Sign in as learner. Click the avatar → **Abmelden / Sign out**.
2. Repeat as trainer, then as admin.

**Expect:** you return to a signed-out state and cannot reach `/de/learn`,
`/de/trainer` or `/de/admin` by typing the URL — each redirects to login.

### TC-AUTH-05 — sign-in is rate limited
1. In a fresh browser profile, enter a **wrong** password for the same address
   six times in a row.

**Expect:** from roughly the sixth attempt, *"Zu viele Versuche…"* instead of the
usual message. The limit is 5 per email address and 30 per browser per 15
minutes, and it also blocks the correct password until the window passes.

### TC-AUTH-04 — a role cannot open another role's pages
1. Signed in as **learner**, type `/de/admin` then `/de/trainer`.
2. Signed in as **trainer**, type `/de/admin`.

**Expect:** you do not see the page. You are redirected or shown "no access".

---

## 4. Learner journey

### TC-LEARN-01 — the dashboard says what to do next
1. Sign in as learner. You are on `/de/learn`.

**Expect:** a large **Weiter lernen** card naming one task with one red button;
a circular overall-progress percentage; and three figures — Aktive Kurse,
Erledigte Aufgaben, Offene Aufgaben. The numbers count up once when they first
appear.

### TC-LEARN-02 — open a course and a task
1. Click **Kurse**, open a course.
2. Click **Aufgaben**, open a task.

**Expect:** the course page lists stages and tasks; the task page shows the
instructions on the left and, on desktop, an answer panel on the right.

### TC-LEARN-03 — the task progress list is truthful
On a task page, look at the **Fortschritt** card in the right column.

**Expect:** four steps — Aufgabe gestartet · Antwort verfasst · Zur Prüfung
eingereicht · Vom Trainer geprüft. Completed steps carry a filled red circle
with a tick, the step you are on carries a ring with a dot, later steps are
empty rings. **At most one step is ever "current"**, and no step after an
incomplete one may be shown as done.

### TC-LEARN-04 — a draft survives a reload
1. Open a task you have not submitted. Type into the answer field.
2. Wait for the save indicator, then reload the page.

**Expect:** your text is still there.

### TC-LEARN-05 — a submitted task is read-only
1. Open a task you already submitted.

**Expect:** the fields cannot be edited and the screen says the submission is
with the trainer.

### TC-LEARN-06 — cannot submit an empty answer
1. Open a fresh task, submit without typing anything.

**Expect:** a message telling you what is missing. Nothing is sent.

---

## 5. Arena (the gamification loop)

Arena is reached from the learner's **Arena** tab.

### TC-ARENA-01 — the hub shows your standing
1. Sign in as learner → **Arena**.

**Expect:** a level with a name (e.g. *Level 1 — Neuling*), a streak in days, an
XP figure with a progress bar toward the next level, and a badge count. Below:
a **Jagden** section and an **Abzeichen** section listing earned badges with
their descriptions.

### TC-ARENA-02 — no open hunt is a designed state, not an error
1. As a learner with no hunt available, open **Arena**.

**Expect:** *"Gerade keine Jagd offen"* with an explanation and a button back to
your courses. Not a blank area, not an error.

### TC-ARENA-03 — run a hunt end to end
1. As learner, open a task of type **Jagd** (hunt) and open its test environment.
2. Find a defect, write it up as a report, submit.
3. Sign in as **trainer** → **Reviews** → open that submission.
4. Accept it.
5. Sign back in as the learner → **Arena**.

**Expect at step 3:** below the answer, a **Fehlerjagd — Abgleich** panel showing
the scenario name and a counter like *"0 von 4 gefunden"*. Reported defects are
listed for the trainer to judge; if none were captured it says so.
**Expect at step 5:** XP has increased and, if a threshold was crossed, a badge
appears in **Abzeichen**.

> XP is only awarded **after** a trainer accepts. A learner who submits and sees
> no XP yet is correct behaviour, and the hub says so.

---

## 6. Trainer journey

### TC-TRAIN-01 — the queue is oldest-first
1. Sign in as trainer → **Reviews**.

**Expect:** a table of submissions with participant, task, group, submitted-at, a
waiting-time badge and a status. Oldest first.

### TC-TRAIN-02 — review a submission
1. Open a submission from the queue.

**Expect:** the task statement, the learner's answer, attempt number, time spent,
hints used, and a decision panel offering accept / request revision.

### TC-TRAIN-03 — the decision reaches the learner
1. Request a revision with a comment.
2. Sign in as that learner and open the task.

**Expect:** the task shows that a revision is required, the trainer's comment is
visible, and the task is editable again.

### TC-TRAIN-04 — questions
1. **Fragen** → open a question → answer it.

**Expect:** it moves out of the open list; **Frage-Archiv** (behind *Mehr*)
lists handled questions.

---

## 7. Admin journey

### TC-ADMIN-01 — the dashboard counts real things
1. Sign in as admin → **Übersicht**.

**Expect:** tiles for users, courses, groups, open reviews, open course requests
and open reports, plus a content-status breakdown and a recent-activity list.

### TC-ADMIN-02 — create a course
1. **Kurse** → **Kurs anlegen**. Fill the form, save.

**Expect:** the course is created and you land on its editor. It appears in the
course list.

> The form has **no** cover image, motivational video or duration input yet.
> Those columns exist in the database but no field has been built — see
> [§9](#9-not-built-yet). Do not report them missing.

### TC-ADMIN-02a — the course list is cards, two per row
1. **Kurse**.

**Expect:** courses render as **cards, two per row** on a desktop window — not a
table. Each card shows the course title, its identifier, a status badge
(*Entwurf / Aktiv / Inaktiv / Archiviert*), and four figures: **Teilnehmende**,
**Trainer**, **Aufgaben**, **Dauer**. A course nobody is on shows `0`, not a
blank. Narrow the window below ~768px and the cards go to one per row.

**Also expect:** the search box and the status filter still work, and filtering
by *Aktiv* shows only the cards whose badge says *Aktiv*.

### TC-ADMIN-02b — duplicate a course
1. **Kurse** → on any card, **Duplizieren**.
2. A field appears pre-filled with `<identifier>-kopie`. Submit it.
3. Reload the list.

**Expect:** a new card appears with the suffix ` (Kopie)` on its title. It is in
**Entwurf**, its task count matches the original, and its **Teilnehmende** and
**Trainer** figures are **0** — a duplicate deliberately copies the content and
not the people.

4. Now try to duplicate again using the **same** identifier.

**Expect:** a message telling you the identifier is not usable. No second copy.

### TC-ADMIN-02c — put people on a course
1. **Kurse** → on a card, **Personen**.

**Expect:** two panels — **Teilnehmende** and **Trainer im Kurs**.

2. In **Teilnehmende**, pick somebody from the dropdown and **Hinzufügen**.

**Expect:** they appear in the list below, and the **Teilnehmende** figure on
that course's card goes up by one when you go back to **Kurse**.

3. Sign in as that learner.

**Expect:** the course is now in their **Kurse** without them having requested
it.

4. Back as admin, **Entfernen** them, then add them again.

**Expect:** both work. Removing and re-adding the same person must not fail —
this was broken and is now fixed, so a failure here is a real regression.

5. In **Trainer im Kurs**, add a trainer. Under a learner, use **Trainer
   zuweisen** to give that learner a mentor.

**Expect:** both appear immediately. A learner may have several trainers.

> **A course with nothing published refuses enrolment on purpose.** If you pick
> a course whose version is still *Entwurf*, you get *"Dieser Kurs hat noch
> keine veröffentlichte Version…"*. That is correct behaviour, not a bug:
> enrolling against unpublished content would show the learner an empty course.

### TC-ADMIN-03 — course content editor
1. Open a course → work through its stages, tasks and localisations.

**Expect:** changes save with a visible saving/saved indicator, and a published
version becomes read-only.

### TC-ADMIN-04 — users
1. **Benutzer** → open a user; **Benutzer anlegen** → create one.

**Expect:** the list is searchable and filterable; a created user appears in it.

### TC-ADMIN-05 — learner progress board
1. **Mehr** → **Fortschritt**.

**Expect:** a table with participant, plan day, tasks, **Level**, **Serie**
(streak), **Offene Jagden** (open hunts), last active, and a flag column. Counts
above the table (all / inactive / behind / stalled) match the rows when you
filter by them.

### TC-ADMIN-06 — course requests
1. **Mehr** → **Kursanfragen**. Approve one, decline another.

**Expect:** each decision is reflected in the list; an approved learner gains
access to the course.

---

## 8. Known issues

Please do **not** file these.

### 8.1 `ReferenceError: X is not defined` in the dev server only
`npm run dev` can serve a stale compiled module and throw, for example,
`ReferenceError: uiStrings is not defined` in `page-header.tsx`, usually followed
by the same page returning 200 on the next request. The source is correct;
verified by a clean production build with zero such errors.
**Do this instead:** stop the dev server, delete the `.next` folder, restart. If
it survives `npm run build && npm start`, it is real — please file it.

### 8.2 `Invalid Refresh Token: Refresh Token Not Found`
Terminal noise from a stale session cookie, typically after the database was
reseeded. The application already handles it and sends you to login. Clear
cookies for `localhost` to stop it.

### 8.3 `GET /sw.js 404`
Nothing in this application registers a service worker and no `sw.js` is shipped.
The request comes from a browser extension or a service worker left registered by
another project on `localhost`. Remove it in DevTools → Application → Service
Workers.

### 8.4 ~~Badge names are German on `/en` and `/ru`~~ — fixed
Fixed on 2026-07-22 by applying `20260727120000_arena_badge_labels_en_ru.sql`.
All eleven badges now carry German, English and Russian labels. Badge names on
`/en` and `/ru` **are** a valid bug again — please report them if you see any.

### 8.5 "Zu viele Versuche" after repeated sign-ins
Sign-in is rate limited: **5 attempts per email address and 30 per browser, per
15-minute window.** Exceeding either shows *"Zu viele Versuche. Bitte warten Sie
einen Moment und versuchen Sie es erneut."* — including for the **correct**
password, which makes it look like the account broke.

This is intended behaviour and worth testing on purpose once (see TC-AUTH-05).
It is easy to trip by accident when testing several roles in a row.
**If you hit it:** wait 15 minutes, or continue in a different browser profile.
Automated test runs trip it quickly.

---

## 9. Not built yet

Do not write test cases against these; they do not exist.

- **No admin screen for Arena content.** Hunt scenarios are seeded through SQL
  (`supabase/seed_arena_scenarios.sql`), not authored in the UI. There is no
  admin page to create, edit or retire a hunt, and no admin page to define badges
  or XP rules. The database side landed on 2026-07-22 — the tables, the HTML
  column and the commands all exist and are tested — but **nothing calls them
  yet**.
- **No trainer Arena screen.** A trainer meets Arena only inside a submission
  review, through the *Fehlerjagd — Abgleich* panel. There is no separate hunt
  overview, and **no Arena entry in the trainer or admin navigation**. Do not
  report either as missing.
- **The two new task locks have no words on screen.** A course task can now be
  gated on an Arena hunt, and on the previous task's pre-task question. The
  database produces both lock reasons correctly, but the learner UI does not
  render them yet, so such a task appears locked with no explanation. Nothing in
  the seeded data is gated this way, so you should not meet it — if you do, it
  is expected, not a bug.
- **No pre-task question on screen.** "Jetzt beantworten / Später beantworten"
  does not exist in the UI yet.
- **Course form fields.** Cover image, the two motivational videos and course
  duration have database columns but **no input anywhere**. The course editor
  cannot set them.
- **No task modal.** Tasks are still edited in the existing content studio, not
  in the modal the redesign calls for.
- **Group (cohort) administration.** There are no `/admin/groups` pages at all —
  the section was removed from the product and from the navigation. Do not test
  creating, editing or listing groups, and do not report the absence of a
  "Gruppen" navigation item as a bug. Groups still exist in the data and appear
  as a **column** on the trainer queue and the admin progress board.
  A group is now created automatically, named **Standard**, the first time an
  admin enrols somebody on a course that has none.
- **Legal content.** `/de/legal` and `/de/privacy` still need real company
  details; the pages exist, the text is placeholder.

**No longer in this list** — these were built on 2026-07-22 and now have test
cases above: adding and removing course members by hand (TC-ADMIN-02c),
assigning a trainer to a course and to a learner (TC-ADMIN-02c), and duplicating
a course (TC-ADMIN-02b).

---

## 10. Database

The whole schema is in the repository: **74 migrations** in
`supabase/migrations/` plus five seed files in `supabase/`.

**The ledger is in sync as of 2026-07-22.** All 74 repository migrations are
recorded as applied on the development database, and no recorded version lacks a
file. A production `supabase db push` runs all 74 in order and produces the same
schema. Nothing to work around.

It was not always so, and the repair is worth knowing about if you see it again:
17 migrations had been applied by hand with `psql` without being recorded, and
one recorded version had no file because the feature behind it was deliberately
removed. Each of the 17 was confirmed applied **by schema effect** — the table,
column, function or constraint it creates was checked to exist — before being
recorded, because marking an unapplied migration as applied would leave a silent
hole in the schema. The orphan was marked reverted. One migration turned out to
be genuinely unapplied and was run properly, which is [§8.4](#84-badge-names-are-german-on-en-and-ru).

**If you ever apply a migration by hand, record it.** `supabase migration repair
--status applied <version>` exists for this.

---

## 11. Accessibility checks

Worth a pass on any screen you touch.

- **Keyboard only.** Tab through the page. Everything clickable must be
  reachable, must show a visible focus ring, and must work with Enter or Space.
  In a menu, `Esc` closes it and returns focus to the button that opened it.
- **Touch targets.** On a phone-width window, every button, link and menu item
  should be at least ~44px tall.
- **Reduced motion.** Turn on the operating system's "reduce motion" setting and
  reload. Nothing should animate — no counting numbers, no drifting background,
  no sliding panels. Everything must still be readable and usable.
- **Both themes.** Check the sun/moon toggle. Text must stay readable in both;
  report anything faint, especially grey-on-grey.
