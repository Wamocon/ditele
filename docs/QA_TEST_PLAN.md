# DiTeLe — QA Test Plan

**For:** the testing team
**Applies to:** commit `73f68f0` and later
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
| Trainer | Übersicht · Reviews · Fragen | **Arena** · Fortschritt · Verlauf · Frage-Archiv · Profil |
| Admin | Übersicht · Kurse · Benutzer | Aufgaben · **Arena** · Fortschritt · Kursanfragen · Fehlermeldungen · Einstellungen · Profil |

| Role | Primary (EN) | Behind "More" (EN) |
|---|---|---|
| Learner | Home · Courses · Tasks · Arena | Questions · Learning history · Certificates · Notifications · Profile |
| Trainer | Overview · Submissions · Questions | **Arena** · Learner progress · Learning history · Review history · Profile |
| Admin | Overview · Courses · Users | Tasks · **Arena** · Learner progress · Applications · Reports · Settings · Profile |

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

## 7a. Arena authoring (admin) and the gate chain

### TC-ARENA-10 — author a bug hunt
1. Sign in as admin → **Mehr** → **Arena** → **Szenario anlegen**.
2. Fill in a Kennung like `kasse-v2`, a title, a description.
3. In **HTML des Bildschirms**, paste a small page — a heading, a number and a
   button that changes it. Plain HTML, CSS and JavaScript all work.
4. Under **Eingebaute Fehler**, add one: a Kennung, a Kurzbeschreibung, and what
   should have happened.
5. Set the status to **Aktiv** and save.

**Expect:** the modal closes and the scenario appears in the list, showing the
badge **HTML** and *Eingebaute Fehler: 1*.

### TC-ARENA-11 — the screen really runs
1. On that scenario, click **Vorschau** (opens a new tab).

**Expect:** your page renders as a **working UI**, never as source. Click the
button — the JavaScript runs and the number changes.

**Also expect:** nothing anywhere on that page mentions your planted defect, its
Kennung or what should have happened. That list is the answer key and is for
trainers only.

### TC-ARENA-12 — the trainer can read the answer key, the learner cannot
1. Sign in as **trainer** → **Mehr** → **Arena**.

**Expect:** every active hunt, each listing its planted defects with severity,
where to look, what should have happened and how to trigger it — under a warning
that says this list is never shown to learners.

2. Sign in as **learner** and type `/de/trainer/arena`.

**Expect:** you do not see the page.

### TC-ARENA-13 — a hunt nobody points at is not reachable by guessing
1. As a **learner**, type the sandbox URL of a scenario no task uses:
   `/de/arena/sandbox/kasse-v2`.

**Expect:** *"Szenario nicht gefunden"* — not the screen. A learner may only
open a hunt some task in their own course points at. "No such scenario" and
"not yours" are deliberately the **same** answer, so the page cannot be used to
find out which scenarios exist. The admin's **Vorschau** still works.

### TC-ARENA-14 — put a gate on a course task
1. As admin, open a course in **Entwurf**, open a stage, click a task.

**Expect:** the task editor opens **in a modal** over the page, not inline.

2. Set **Vorausgesetzte Fehlerjagd** to a scenario.
3. On the *previous* task in the list, fill in **Frage vor der Aufgabe** in all
   three languages. Save.

**Expect:** both save without error. Leaving one language blank stores no
question at all — that is intended; it is all three or none.

### TC-ARENA-15 — the gate chain, as a learner
Needs a published course carrying the gates from TC-ARENA-14 and a learner
enrolled on it.

1. Sign in as that learner → **Kurse** → open the course.

**Expect:** the gated task is locked and says **why** — *"Bestehen Sie zuerst
die Fehlerjagd …"* — with a link through to it. If its question is also
outstanding you see **both** sentences, not just one.

2. Open the task that carries the question.

**Expect:** a **Frage vor der Aufgabe** panel above the task, offering *Jetzt
beantworten* and *Überspringen und später beantworten*. The task itself is fully
usable either way — the question is not a barrier.

3. Click **Überspringen und später beantworten**.

**Expect:** the task stays open and now says you skipped it and that the next
task stays locked until you answer. **This is correct — do not file it.**

4. Go back to the course. The following task is still locked.
5. Return, type an answer, click **Jetzt beantworten**.

**Expect:** the panel says *Beantwortet*, and the following task's question lock
is gone. It may still be locked by its Arena gate; that is a separate reason and
is shown separately.

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

- **A duplicated course cannot be published.** `Duplizieren` copies the content
  correctly, but not the review rubrics, and a course whose practical tasks have
  no rubric is refused at *Zur Prüfung einreichen* with *"every practical task
  requires an active non-empty review rubric"*. There is no screen that
  re-attaches them. Known and recorded; do not file it.
- **No locale tabs for course media.** The cover image and the two motivational
  videos are written for German only. The fields exist once, not three times.
- **The course editor cannot change media after creation.** Cover image and
  videos can be set when the course is created and not edited afterwards.
- **No "retire" action for an Arena scenario.** The status can be changed in the
  authoring modal, but there is no confirmation step and no warning if a task
  still points at the scenario being retired.
- **Group (cohort) administration.** There are no `/admin/groups` pages at all —
  the section was removed from the product and from the navigation. Do not test
  creating, editing or listing groups, and do not report the absence of a
  "Gruppen" navigation item as a bug. Groups still exist in the data and appear
  as a **column** on the trainer queue and the admin progress board.
  A group is created automatically, named **Standard**, the first time an admin
  enrols somebody on a course that has none.
- **Legal content.** `/de/legal` and `/de/privacy` still need real company
  details; the pages exist, the text is placeholder.

**No longer in this list.** Everything below was in §9 and is now built, with
test cases above — please do test these:

| Was missing | Now | Test case |
|---|---|---|
| adding/removing course members by hand | `/admin/courses/…/people` | TC-ADMIN-02c |
| assigning a trainer to a course and to a learner | same screen | TC-ADMIN-02c |
| duplicating a course | card action | TC-ADMIN-02b |
| an admin screen for Arena content | `/admin/arena` | TC-ARENA-10/11 |
| a trainer Arena screen | `/trainer/arena` | TC-ARENA-12 |
| Arena in the trainer and admin navigation | behind **Mehr** | TC-NAV-02 |
| the pre-task question on screen | task page | TC-ARENA-15 |
| the two new task locks having words | course page | TC-ARENA-15 |

---

## 10. Database

The whole schema is in the repository: **77 migrations** in
`supabase/migrations/` plus five seed files in `supabase/`.

**The ledger is in sync as of 2026-07-22.** All 77 repository migrations are
recorded as applied on the development database, and no recorded version lacks a
file. A production `supabase db push` runs all 77 in order and produces the same
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
