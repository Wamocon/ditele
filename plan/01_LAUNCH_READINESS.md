# Stage 2 — Launch Readiness for 200 Real Students

> **Created:** 2026-07-21 · after you selected "Real launch, ~200 students"
> **Read this before Stage 1 starts.** It contains one blocker that no amount of coding fixes.

---

## 1. The blocker: nobody outside your office can reach the app

```
NEXT_PUBLIC_SUPABASE_URL = http://192.168.178.75:56721
                                └──────┬──────┘
                            192.168.x.x is a PRIVATE LAN ADDRESS
```

`192.168.178.75` is a private address in the RFC 1918 range. It is reachable from your office network and from nowhere else on earth. A student at home types the URL and gets a connection timeout.

Three more things are also true of that URL:

| Problem | Consequence for 200 students |
|---|---|
| **`http://`, not `https://`** | Browsers block secure cookies over plain HTTP. Supabase auth sessions will not persist reliably. Chrome shows "Not secure" next to a login form asking for a password. |
| **No domain name** | Nothing to put in an email, nothing to bookmark, no certificate possible. |
| **Port `56721`** | Corporate and school networks routinely block non-standard ports. Some of your students will be unable to connect even with a public IP. |

**This is not a code problem.** Six parallel chats writing perfect React cannot fix it. It needs an infrastructure decision from you before any real student logs in.

### What it needs

1. A public domain — say `academy.wamocon.com` or `ditele.wamocon.com`
2. TLS certificates (Let's Encrypt is free and automatic)
3. A reverse proxy — Caddy or nginx — in front of both Next.js and Supabase, on ports 80/443
4. The server reachable from the public internet, or hosted somewhere that already is
5. `NEXT_PUBLIC_SUPABASE_URL` and `DITELE_APP_ORIGIN` updated to the public HTTPS URLs

Realistically half a day of infrastructure work, and it is completely independent of the app build. **It can happen in parallel with Stage 1** — different person, different skills, no shared files.

---

## 2. Why 5–6 hours cannot produce a 200-student launch

Not pessimism. Arithmetic. Here is what "real launch" requires that "pilot" does not:

| Requirement | Why it only matters at real-launch scale | Effort |
|---|---|---|
| **Public HTTPS hosting** | §1. Without it there is no launch at all. | ~4 h infra |
| **Working email delivery** | Password reset and account confirmation. With 200 users, roughly 20 will forget their password in week one. Without email they are locked out permanently and you handle it by hand. | 1–2 h + SMTP credentials |
| **DSGVO / GDPR compliance** | German law. Impressum and Datenschutzerklärung with **real legal text**, consent records, a documented deletion path. Lorem ipsum on a live German education site is a legal exposure, not a to-do item. | Legal review + 2 h |
| **Database backups, verified by restoring one** | 200 students × weeks of submissions. An unbacked-up database is one disk failure away from losing all of it. `KNOWN_BLOCKERS.md` BLK-010 has this open. | 2 h |
| **Pagination on every list** | Every query in a 6-hour build is unbounded. It is instant with 8 rows and times out with 5,000 submissions. | 2 h |
| **Error monitoring** | With 5 pilot users, they tell you when something breaks. With 200 they just leave. | 1 h |
| **Full RLS audit** | Every one of the 99 tables, verified per role. Stage 1 verifies the ones the UI touches. A real launch has to prove student A cannot read student B's submissions — for every table, not the ones we happened to use. | 3 h |
| **Load check** | 200 students, 30 concurrent at peak. Nobody has measured whether that server handles it. | 2 h |
| **Accessibility (BITV 2.0 / WCAG 2.1 AA)** | German public-sector-adjacent education has real accessibility expectations. Stage 1 does keyboard and contrast. A launch needs a screen-reader pass. | 3 h |
| **EN + RU translation quality** | German gets written by the build. English and Russian need actual translation, not machine output shipped to paying students. | Translator time |
| **Automated E2E suite** | With 200 users a regression is a support incident. Stage 1's smoke test catches crashes, not wrong behaviour. | 4 h |

**That is 25–30 hours of work that has nothing to do with building screens.** It is what turns an application into a service.

---

## 3. The restructure: two stages, one honest path

```
  STAGE 1 — TODAY, 5–6 h                    STAGE 2 — LAUNCH HARDENING
  ┌────────────────────────────┐            ┌────────────────────────────┐
  │ The full app.              │            │ Public HTTPS + domain      │
  │ 42 routes, 3 roles,        │  ─────►    │ Email delivery             │
  │ DE/EN/RU, branded,         │            │ DSGVO legal text           │
  │ responsive, real database. │            │ Backups (restore-tested)   │
  │                            │            │ Pagination everywhere      │
  │ Ship to 5–15 people        │            │ Monitoring + full RLS audit│
  │ you can talk to.           │            │ Load test + a11y pass      │
  └────────────────────────────┘            │ EN/RU translation review   │
                                            │ E2E suite                  │
              │                             └────────────────────────────┘
              │                                          │
              ▼                                          ▼
    You learn what is actually                  Open to 200 students
    wrong from real usage                       with the receipts
```

### Why this ordering is better, not just safer

You are going to change things after watching real people use this. Everyone does. The question is only whether you find out **before** or **after** you have hardened, translated, load-tested and legally reviewed the wrong design.

Fifteen students for one week will teach you more about the task workspace than any amount of planning. Then you harden what survived contact with them.

**Stage 1 does not change.** The plan in [00_MASTER_PLAN.md](00_MASTER_PLAN.md) is exactly right for the pilot, and it is exactly the foundation the launch needs. Nothing gets thrown away. What changes is that we stop calling the end of today "launch" and start calling it what it is: **a complete app, ready for real users to try.**

---

## 4. What Stage 1 does differently, given a launch is coming

Four small changes, decided now because they are cheap now and expensive later:

| Change | Why now |
|---|---|
| **Never hardcode a UI string.** Every string goes through the i18n layer with a typed key, German filled in, EN/RU stubbed. | Retrofitting i18n across 42 routes later is the 3-hour rewrite. Doing it as you type costs nothing. |
| **Every list query takes `limit` and `offset` from the start**, even when it returns 8 rows today. | Adding pagination to 20 screens later is a day. Passing two extra arguments now is a minute. |
| **Every destructive action writes an `audit_events` row.** The table already exists. | You cannot reconstruct who deleted what after the fact. Either it is logged from day one or that history never existed. |
| **`NEXT_PUBLIC_SUPABASE_URL` is read from env, never inlined**, and `DITELE_APP_ORIGIN` likewise. | When the URL changes to `https://academy.wamocon.com`, it must be one env change and not a grep across the codebase. |

These are added to [02_WORKSTREAMS.md](02_WORKSTREAMS.md) §5.5 as rules for every chat.

---

## 5. Stage 2 checklist

Nothing here is startable today. Every item needs a decision or a credential from you.

### Infrastructure — blocks everything
- [ ] Domain chosen and DNS pointed at the server
- [ ] TLS via Let's Encrypt, auto-renewing
- [ ] Reverse proxy (Caddy or nginx) fronting Next.js and Supabase on 443
- [ ] `NEXT_PUBLIC_SUPABASE_URL` → `https://<domain>`
- [ ] `DITELE_APP_ORIGIN` → `https://<domain>`
- [ ] Server reachable from outside the LAN, verified from a mobile network
- [ ] Firewall: only 80/443 exposed, database port closed to the internet

### Data safety
- [ ] Automated daily `pg_dump`, stored off the machine
- [ ] **A restore actually performed and verified.** An untested backup is not a backup.
- [ ] Retention policy agreed (BLK-008)

### Auth & email
- [ ] SMTP or Resend configured in Supabase Auth
- [ ] Password-reset email delivers and the link works
- [ ] Confirmation email delivers, or email confirmation deliberately disabled
- [ ] Login rate limiting verified under real conditions

### Legal — German market, non-negotiable
- [ ] Impressum with real company details (§5 TMG)
- [ ] Datenschutzerklärung reviewed by someone qualified
- [ ] Consent records wired to the `consent_records` table
- [ ] Data export and deletion paths working (`data_export_requests`, `data_deletion_requests`)
- [ ] AV-Vertrag / processing agreement if any processor touches student data

### Performance & scale
- [ ] Every list paginated, no unbounded query anywhere
- [ ] Indexes checked on every filtered column
- [ ] Load test at 30 concurrent users
- [ ] Video and PDF delivery checked at size

### Security
- [ ] RLS verified per role for **all 99 tables**, not only the ones the UI touches
- [ ] `grep -r "service_role" .next/static/` returns nothing
- [ ] Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy
- [ ] Supabase service-role key rotated after the build (six chats saw the repo)

### Quality
- [ ] Playwright E2E covering the six core journeys
- [ ] Screen-reader pass on the student flow
- [ ] EN and RU translations reviewed by a human
- [ ] Error monitoring live, with alerts going somewhere a person reads

### Operations
- [ ] Named release owner (BLK-010)
- [ ] Rollback rehearsed, not just documented
- [ ] Support channel for students
- [ ] Trainer onboarding — they need to know how to review before students start submitting

---

## 6. What I recommend

**Build Stage 1 today, exactly as planned.** It is the right work and none of it is wasted.

**Start the infrastructure work in parallel** — different person, different skills, zero file conflicts with the six chats. If the domain and HTTPS are ready when Stage 1 finishes, you are much closer than you think.

**Then put 10–15 real students on it for one week.** Watch them. Fix what they hit.

**Then do Stage 2 and open it to 200.**

If a date is already promised to 200 students and it cannot move, say so — that is a different conversation and it changes what we cut, not how fast we go. But do not let today end with the app pointed at a `192.168.x.x` address and a launch on the calendar. That failure is guaranteed and it has nothing to do with the quality of the code.
