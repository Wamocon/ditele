# 10 — Entwicklungsplan A: DiTeLe-Neubau

> **Entscheidung:** Eine neue Anwendung entwickeln, die alle bewährten DiTeLe-Abläufe erhält, die Benutzeroberfläche ersetzt und die freigegebenen Zielfunktionen ergänzt.  
> **Verbindliche Grundlagen:** [App-Analyse & Architektur](./08_APP_ANALYSE_UND_ARCHITEKTUR.md) und [Marktanalyse & Produktzielbild](./09_MARKTANALYSE_UND_ZIELBILD.md)  
> **Repository erneut geprüft:** `Wamocon_academy_Ditele`, Commit `c5d9d63` zuzüglich der lokalen Änderung des ChatBot-Modells  
> **Planungsdatum:** 17. Juli 2026  
> **Evidenzgrenze:** Nur das Next.js-Frontend war verfügbar. Die Laravel-API, das MariaDB-Schema, die Implementierung des Testsystems und die Eloomi-Konfiguration lagen nicht vor.

---

## 1. Entscheidung, Ergebnis und ehrliche 48-Stunden-Grenze

Dieser Plan erstellt eine **neue DiTeLe-Webanwendung** mit einer modernen, rollenbasierten Nutzungserfahrung. Die vorhandene Laravel-API wird zunächst über eine Kompatibilitätsschicht weiterverwendet. Zuerst entstehen das neue Frontend und dessen kanonische Verträge; anschließend werden Backend-Domänen schrittweise hinter diesen Verträgen ersetzt.

Die Bestandsanwendung umfasst 47 Routen, 100 Komponentendateien, drei authentifizierte Rollen, mehrsprachige Inhalte, Medien-Uploads, mehrere zustandsbehaftete Abläufe und ein externes Backend. Das Zielbild ergänzt Kompetenzen, flexible Lernpfade, Labs, Evidenzen, Portfolios, Gamification, Analytics, KI-Governance, Organisationen und Integrationen.

### Was „in zwei Tagen fertig“ bedeuten kann

| Lieferstufe | In 48 Stunden möglich? | Genaue Bedeutung |
|---|:---:|---|
| Produktionsreife neue Plattform mit allen alten und neuen Funktionen | Nein | Erfordert verifizierte Backend-Regeln, Datenmigration, Sicherheitstests, Lab-Infrastruktur, Integrationsverträge, Barrierefreiheit, Resilienz und Betriebsbereitschaft |
| API-gestütztes Beschleunigungsrelease | Bedingt | Mit vorbereitetem Team, stabiler API, Testkonten, Seed-Daten und eingefrorenem Umfang möglich; sechs Kernabläufe funktionieren gegen die bestehende API |
| Vollständiger moderner UI-Demonstrator | Ja | Alle primären Routen und Rollen-Shells bestehen; reine Zielfunktionen nutzen eindeutig gekennzeichnete Fixtures und den Status `Vorschau` |
| Produktionsreifer Rewrite durch eine Person | Nein | Das Zeitlimit würde ungetestetes Verhalten, unsichere Abkürzungen und versteckte Paritätslücken erzwingen |

### Empfohlenes 48-Stunden-Ziel

Ein auslieferbares **Greenfield Release 0** mit folgenden Ergebnissen:

1. neue App-Shell, Designsystem, responsive Navigation und Grundlage für EN/DE/RU;
2. API-gestützter Login, Katalog, Kursanfrage, Lernenden-Aufgabe/-Abgabe, Trainer-Review, Trainer-Q&A sowie Admin-Kurs- und Gruppenansichten;
3. Routen-Shells und freigegebene UX für jede bestehende Ansicht;
4. Vorschauansichten für Kompetenzen, adaptive Pfade, Labs, Portfolio, Gamification, Analytics, Organisationen und Integrationen; wo APIs fehlen, ausschließlich mit typisierten Fixtures;
5. Kompatibilitäts-API-Client, Rollenmatrix, Zustandsdefinitionen, Fehlerbehandlung und auditierbare Ereignisnamen;
6. automatisierte Smoke-Tests für die sechs Kernabläufe;
7. Produktions-Backlog, das nicht mit fertiger Funktionalität verwechselt werden kann.

Das Greenfield-Release darf Fixture-gestützte Module nicht als produktiv kennzeichnen.

---

## 2. Zu erhaltende Ausgangsbasis

### 2.1 Aktuelle technische Basis

| Bereich | Verifizierter Ist-Zustand | Greenfield-Entscheidung |
|---|---|---|
| Frontend | Next.js 14.2, React 18, TypeScript 5, App Router | Saubere App-Router-Anwendung auf einer zum Projektstart ausgewählten, unterstützten stabilen Version |
| UI | Tailwind, Radix-/shadcn-ähnliche Primitive, CSS-Module | Ein tokenbasiertes Komponentensystem; Verhalten übernehmen, Legacy-Styling nicht |
| Datenzugriff | Verteilte Axios-Aufrufe in Seiten/Komponenten | Typisiertes serverseitiges Gateway plus generierter oder manuell verifizierter Kompatibilitätsclient |
| Zustand | `localStorage`, Cookies, Effects, teilweise React Query | Server-Session, URL-Zustand, Query-Cache nur für interaktive Client-Daten |
| Rollen | Gast, Student, Trainer, Admin | Alle vier Zustände erhalten; Organisationsadmin erst mit verfügbarer Backend-Policy |
| Lokalisierung | EN/DE/RU mit i18next plus eigenem Storage | Ein Locale-System, typisierte Schlüssel, lokalisierte Routen, Fallback-Tests |
| Backend | Separate Laravel-REST-API | Weiterbetrieb über `LegacyApiAdapter`; Einführung kanonischer BFF-Verträge |
| KI | Groq-Client im Browser | Ausschließlich serverseitiges KI-Gateway; kein öffentlicher Provider-Schlüssel |
| Tests | Keine Source-Tests gefunden | Unit-, Komponenten-, Vertrags- und End-to-End-Gates ab dem ersten Release |

### 2.2 Register der funktionalen Bestandsgleichheit

Jede Zeile blockiert das Release, sofern sie nicht ausdrücklich als reine Zielfunktion markiert ist.

| ID | Bestehende Funktion | Gast | Student | Trainer | Admin | Greenfield-Abnahme |
|---|---|:---:|:---:|:---:|:---:|---|
| CUR-01 | Öffentlicher Kurskatalog und Kurs-Landingpage | ✓ | ✓ | — | Ansichtsmodus | Gleiche Inhalte, Locale, Medien und Registrierungsaktionen |
| CUR-02 | Registrierung, Login, Logout, Passwort-Reset | ✓ | ✓ | ✓ | ✓ | Gleichwertige Ergebnisse und explizite Fehler-/Session-abgelaufen-Zustände |
| CUR-03 | Profil, Profilbearbeitung, Historie, Zertifikatsdownload | — | ✓ | eigenes | ✓ | Bestehende Daten und Downloads bleiben verfügbar |
| CUR-04 | Kursanfrage/-registrierung und Antragsbearbeitung | erst registrieren | ✓ | — | ✓ | Anfrage-, Listen-, Annahme- und Zuweisungsablauf bleibt erhalten |
| CUR-05 | Aktive/abgeschlossene Kurse und Gruppenmitgliedschaft | — | ✓ | Gruppenansicht | alle | Bestehender Serverstatus bleibt maßgeblich |
| CUR-06 | Datumsaktivierte Kursstufen/Aufgaben | — | ✓ | anpassen | konfigurieren | Aktuelle Datumslogik bleibt bis zur Ablösung durch Kompetenzregeln nutzbar |
| CUR-07 | Aufgabenbeschreibung, Videos, Ziel-Link, Hinweise, Antwort, Tests, Dauer | — | ✓ | Vorschau | Vorschau | Alle Eingaben und Telemetriedaten bleiben ohne stille Payload-Änderung erhalten |
| CUR-08 | Abgabe, Annehmen/Ablehnen, Kommentar, Weitergabe, Archiv/Historie | — | abgeben/sehen | ✓ | über Traineransicht | Statuswechsel und Weitergabebereich entsprechen der API |
| CUR-09 | Aufgabenfragen, Antworten, Weitergabe, Queue/Archiv | — | fragen/sehen | ✓ | über Traineransicht | Vollständiger Lernenden-/Trainer-Kreislauf bleibt erhalten |
| CUR-10 | Kurs-/Stufen-/Video-/Aufgaben-/Test-/Fehlerkategorie-Authoring und Vorschau | — | — | — | ✓ | Erstellen/Bearbeiten/Löschen/Vorschau und Multipart-Medien funktionieren |
| CUR-11 | Gruppe erstellen/bearbeiten/löschen/duplizieren/starten/stoppen | — | — | zugewiesene starten/stoppen | ✓ | Bestehender Gruppenlebenszyklus bleibt erhalten |
| CUR-12 | Studenten/Trainer zuweisen/entfernen; Benutzer-/Trainerverwaltung | — | — | — | ✓ | Umfang und Bestätigungen destruktiver Aktionen bleiben erhalten |
| CUR-13 | Zertifikate, Bewertungen, Fehlermeldungen, Benachrichtigungen, Exporte | begrenzt | ✓ | relevant | ✓ | Downloads, Mutationsfeedback und Fehlerwiederherstellung werden getestet |
| CUR-14 | Wechsel der Admin-Rollenansicht | — | — | — | ✓ | Nur als Impersonation/Ansichtsmodus mit dauerhaftem Banner und Audit-Ereignis |
| CUR-15 | Chat zur Kursempfehlung | ✓ | ✓ | optional | optional | Provider-Aufruf wird serverseitig und beachtet Quota, Datenschutz und Fallback |

### 2.3 Bestehende Zustandsautomaten

Numerische Werte dürfen nicht direkt in UI-Komponenten codiert werden.

```text
Gruppe:       wartend -> aktiv -> inaktiv/abgeschlossen
Abgabe:       Entwurf -> eingereicht -> angenommen
                                    -> Überarbeitung_nötig -> erneut_eingereicht
Frage:        offen -> zugewiesen -> beantwortet -> archiviert
                           -> weitergegeben -> zugewiesen
Zertifikat:   berechtigt -> ausgestellt -> verfügbar -> widerrufen/abgelaufen (Zielerweiterung)
```

Der Kompatibilitätsadapter übersetzt aktuelle Serverwerte wie `0`, `1` und `2` in benannte Zustände. Ein Übergang wird nur angezeigt, wenn der Server ihn autorisiert.

---

## 3. Zusätzlicher Produktumfang

### 3.1 Priorisierung

| Stufe | Funktion | Erste nutzbare Ausbaustufe | Backend-/Infrastrukturabhängigkeit |
|---|---|---|---|
| P0 | Sichere Session, Server-KI-Proxy, typisierte API, Rollen-Policies, Audit-Ereignisse | Release 0/1 | Änderungen an Laravel-Authentifizierung/-Policies können nötig sein |
| P0 | Flexible Lernprogression | Manueller Pfad plus Voraussetzungregeln | Neue Enrollment-/Pfad-APIs und Migration der Datumslogik |
| P0 | Kompetenzen, Rubriken, Evidenz-Ledger | Kompetenzprofil und Aufgaben-Kompetenz-Zuordnung | Neue Domänentabellen und Bewertungsregeln |
| P0 | Moderne Lernenden-, Trainer- und Admin-Arbeitsbereiche | Release 0 | Bestehende API genügt für Paritätsansichten |
| P1 | Einstufungstest und nächste beste Aktion | Deterministische Regel-Engine | Item-Bank-, Attempt- und Mastery-API |
| P1 | Testing-Lab-Lebenszyklus | Start/Reset/Status/Evidenz-UI | Isolierter Umgebungs-Orchestrator und Seed-Szenarien |
| P1 | Trainer-Workbench mit Queue-SLA und Rubrik | Bestehendes Review plus Rubrik-Panel | Review-SLA-/Rubrik-API für Vollfunktion |
| P1 | Verifiziertes Portfolio und teilbare Zertifikate | Evidenzauswahl und Verifikationsseite | Evidenz-/Zertifikats-Verifikationsdienst |
| P1 | Kompetenzbasierte XP, Badges, Missionen, Benachrichtigungen | Ledger und Badge-Regeln | Gamification-Ledger/-Ereignisse |
| P1 | Produkt- und Lernanalytics | Ereigniserfassung und Kerndashboards | Einwilligung, Event-Pipeline, Warehouse/BI |
| P2 | Kontextbezogener KI-Testing-Coach | Hinweiskaskade mit Quellen und Eskalation | Retrieval-Korpus, Policy, Evaluationen, Quotas |
| P2 | Eloomi-/LTI-/xAPI-/Webhook-Adapter | Verbindungs- und Sync-Abgleichs-UI | Anbieter-Vertrag, Zugangsdaten, Ownership-Entscheidungen |
| P2 | Organisationen, Mandantenrollen, SSO, B2B-Reporting | Organisationsadmin-Bereich | Mandantenmodell, OIDC, Isolations-Policies |
| P2 | Pakete, Berechtigungen, Zahlung/CRM | Entitlement-Prüfungen | Kommerzielle Entscheidungen und Provider-Integration |

### 3.2 Aus den Bestandsdokumenten aufgelöste Produktregeln

1. Kompetenznachweise, praktische Arbeit, Labs, Review und Portfolios bilden das Kerneigentum von DiTeLe.
2. Eloomi ist optional und wird über einen Adapter angebunden; DiTeLe muss eigenständig funktionieren.
3. Die Progression wird langfristig kompetenzbasiert; während der Migration bleibt die bestehende Datumsfreischaltung verfügbar.
4. Gamification belohnt nachgewiesenes Lernen. Es gibt **keinen strafenden XP-Verfall** und keine Punkte für reine Logins/Klicks.
5. KI verrät keine versteckten Fehler oder endgültigen Prüfungsantworten und trifft nie die finale Trainerentscheidung.
6. „ISTQB-Readiness“ darf gemessen werden; eine Prüfungs-/Bestehensgarantie darf ohne freigegebene rechtliche und kommerzielle Grundlage nicht erscheinen.
7. Zertifikats-Ownership und -Berechtigung sind Serverregeln, keine UI-Annahmen.

---

## 4. Greenfield-Architektur

### 4.1 Laufzeitsicht

```text
Browser/PWA
  -> Next.js Edge-/Server-Schicht
       -> servervalidierte Session und Locale
       -> rollenbezogene Layouts und Server Components
       -> Same-Origin-BFF (/api/*)
            -> LegacyApiAdapter -> bestehende Laravel-API
            -> CoreApiAdapter   -> neue modulare Backend-Domänen
            -> KI-Gateway       -> ausgewählter Modell-Provider
            -> Integration Hub  -> Eloomi/LTI/Webhooks
       -> Objekt-/Medienauslieferung über signierte URLs oder freigegebenes CDN
```

Die UI importiert Domänenschnittstellen, niemals Laravel-Response-Formate. Der Wechsel vom `LegacyApiAdapter` zu einem neuen Modul darf keine Neuentwicklung der Ansichten erfordern.

### 4.2 Vorgeschlagene Frontend-Struktur

```text
src/
  app/[locale]/
    (public)/
    (learner)/
    (trainer)/
    (admin)/
    (organization)/
    api/
  features/
    identity/ catalog/ enrollment/ cohorts/ learning/
    tasks/ review/ mentoring/ skills/ labs/ portfolio/
    certification/ gamification/ analytics/ integrations/
  entities/
    user/ course/ group/ task/ attempt/ question/ skill/ evidence/
  shared/
    api/ auth/ config/ i18n/ ui/ validation/ telemetry/ testing/
```

### 4.3 Daten- und Rendering-Regeln

- Server Components für initiale Reads verwenden und unabhängige Aufrufe parallelisieren.
- Client Components nur für Formulare, Dialoge, Drag-and-drop, Live-Timer und optimistische Interaktionen.
- Filter, Tabs, Pagination und ausgewählte IDs in der URL halten, wenn Teilen/Zurücknavigation relevant sind.
- Query-Cache nur für interaktiven Serverzustand; Schlüssel und Invalidierung zentral definieren.
- Alle BFF-Ein- und -Ausgaben zur Laufzeit validieren; unbekannte Statuswerte sichtbar ablehnen.
- Geheimnisse und KI-Provider-SDKs ausschließlich serverseitig halten.
- Schwere Editoren, Video-Player, Diagramme und Exportpakete dynamisch laden.
- Kanonische Zeitstempel in UTC speichern und in der Zeitzone des Benutzers darstellen.
- Ein Fehlerformat verwenden: `code`, `message_key`, `field_errors`, `correlation_id`, `retryable`.

### 4.4 Kanonische API-Grenze

| Kanonische Operation | Aktuelles Adapterziel | Zukünftiger Owner |
|---|---|---|
| `session.login/logout/me` | `/login`, `/logout`, `/user/global/profile` | Identity |
| `catalog.list/get` | `/guest/courses/list`, `/guest/courses/show` | Catalog |
| `enrollment.request/list` | `/courses/register`, `/courses/requests` | Enrollment |
| `cohort.list/get/changeState` | `/groups*`, `/groups/changestatus` | Cohort |
| `task.list/get/submit` | `/tasks`, `/task/show`, `/task/solved/send` | Task & Assessment |
| `review.get/decide/transfer` | `/task/show/trainer`, `/solving/change/status`, `/solving/transfer` | Review |
| `question.list/create/answer/transfer` | `/question*` | Mentoring |
| `certificate.list/download/issue` | `/certificate*` | Certification |
| `skill.*`, `lab.*`, `portfolio.*` | Kein aktueller Endpoint | Neue Kernmodule |

Vor dem Austausch eines Adapters ist OpenAPI oder ein gleichwertig geprüfter Vertrag erforderlich.

---

## 5. Moderne UI und Informationsarchitektur

### 5.1 Visuelle Richtung

Die UI soll wie ein **professioneller QA-Arbeitsbereich** wirken, nicht wie ein generisches Video-LMS:

- neutrale Ink-/Slate-Flächen mit ruhigem Blau als Primärfarbe sowie Amber/Grün/Rot für semantische Zustände;
- kontrastreiche Typografie, zurückhaltende Ebenen, konsistentes 4/8-Pixel-Raster und großzügige Lesebreite für Aufgaben;
- Evidenz, Schweregrad, Status, Termin, Reviewer und Kompetenzbeherrschung als strukturierte Daten statt dekorativer Karten;
- heller und dunkler Modus auf denselben semantischen Tokens;
- WCAG 2.2 AA für Tastatur, Kontrast, Fokus, Labels, Fehlerzusammenfassung, reduzierte Bewegung und Screenreader;
- keine gradientenlastigen Dashboards, übermäßigen Pills, versteckten Aktionen oder horizontalen Mobil-Tabellen.

Vor der Implementierung werden vollständige Screen-Konzepte für Lernenden-Aufgabe, Trainer-Review und Admin-Kurseditor erstellt und freigegeben. Tokens und Komponenten werden daraus abgeleitet; unzusammenhängende Mockups werden nicht vermischt.

### 5.2 Gemeinsame Komponenten

| Grundlage | Komponenten |
|---|---|
| Navigation | App-Shell, rollenbezogene Sidebar, Mobile Drawer, Breadcrumbs, Command/Search, Locale-/Profilmenüs |
| Feedback | Skeleton, Leerzustand, Fehlerzustand, Offline-/Retry-Banner, Toast, Bestätigungsdialog, Schutz ungespeicherter Änderungen |
| Daten | Barrierefreie Tabelle, mobile Liste, Filterleiste, Pagination, Massenaktion, Exportstatus |
| Lernen | Kurskarte, Pfadkarte, Fortschrittsanzeige, Aufgabennavigator, Video-/Evidenzpanel, Hinweiskaskade |
| Review | Queue-Zeile, Rubrik, Evidenzviewer, Entscheidungsleiste, Weitergabedialog, SLA-Indikator |
| Authoring | Schrittformular, Locale-Tabs, Autosave-Status, Versionsstatus, Vorschau, Veröffentlichungscheckliste |
| Kompetenzen | Skill-Chip, Mastery-Anzeige, Kompetenzkarte, Evidenz-Timeline, Badge-/Missionskarte |

### 5.3 Rollennavigation

| Rolle | Primäre Ziele |
|---|---|
| Gast | Start, Katalog, Kursdetail, Über uns, Login/Registrierung, Datenschutz |
| Student | Start/nächste Aktion, mein Lernen, Kurs/Pfad, Aufgabenbereich, Fragen, Kompetenzen, Portfolio, Zertifikate, Profil |
| Trainer | Arbeitsqueue, Gruppen, Abgaben, Fragen, Lernfortschritt, Review-Historie |
| Admin | Übersicht, Kurse/Inhalte, Aufgaben, Gruppen, Benutzer, Anträge, Zertifikate, Meldungen, Integrationen, Einstellungen |
| Organisationsadmin (neu) | Personen, Zuweisungen, Teamkompetenzen, Ergebnisse, SSO/Integrationen, Audit — erst mit verfügbarer Policy/API |

---

## 6. End-to-End-Abläufe

### WF-01 Vom Gast zum eingeschriebenen Lernenden

```text
Katalog -> lokalisiertes Kursdetail -> Registrierung/Login -> Kursanfrage
-> Antragsbestätigung -> Admin-Prüfung -> Gruppen-/Pfadzuweisung
-> Benachrichtigung -> erste verfügbare Aktivität
```

Abnahme: Doppelte Anfragen sind idempotent; Fehler erhalten Formulardaten; ausstehend/angenommen/abgelehnt ist sichtbar; Locale bleibt über die Anmeldung erhalten.

### WF-02 Bestehender Aufgaben- und Überarbeitungszyklus

```text
Mein Lernen -> Kurs -> verfügbare Aufgabe -> Beschreibung/Video/Ziel
-> optionaler Hinweis -> Antwort + Testauswahl + Evidenz -> Abgabe
-> gesperrter Snapshot -> Trainer-Review
-> angenommen ODER Überarbeitung nötig -> Benachrichtigung -> Korrektur/erneute Abgabe
-> Server berechnet Fortschritt/Zertifikatsberechtigung neu
```

Abnahme: Timer-Wiederherstellung, gespeicherter Entwurf, explizite Hinweisnutzung, barrierefreie Validierung, Schutz vor Doppelabgabe, unveränderliche Einreichung und Kommentarhistorie.

### WF-03 Lernendenfrage

```text
Aufgabe -> Frage stellen -> offen -> zugewiesener Trainer
-> Antwort ODER Weitergabe -> Benachrichtigung -> Archiv/Historie
```

Abnahme: Frage bleibt mit Aufgabe/Gruppe/Lernendem verknüpft; Weitergabe verliert nie Ownership; leere und verzögerte Zustände sind sichtbar.

### WF-04 Trainer-Review

```text
Queue -> nach Gruppe/Alter/Status filtern -> Abgabe öffnen
-> Aufgabe, Evidenz, Antwort, Testergebnis, Hinweis/Dauer vergleichen
-> Rubrik/Kommentar ausfüllen -> annehmen, Überarbeitung verlangen oder weitergeben
-> Lernenden informieren -> Queue/SLA aktualisieren -> Audit-Ereignis
```

Abnahme: Berechtigung wird serverseitig geprüft; bei Konfiguration ist Kommentar Pflicht; paralleler Review-Konflikt wird erkannt.

### WF-05 Admin-Authoring und Veröffentlichung

```text
Kurs erstellen -> lokalisierte Metadaten -> Stufen/Videos -> Aufgaben/Tests/Kategorien
-> Kompetenzen/Voraussetzungen zuordnen -> Vorschau je Locale/Rolle
-> Validierungscheckliste -> Version veröffentlichen -> Gruppe/Pfad zuweisen
```

Abnahme: Entwürfe werden serverseitig gespeichert, Uploads sind wiederaufnehmbar, unvollständige Locales markiert, veröffentlichte Versionen unveränderlich und destruktive Aktionen bestätigen Auswirkungen.

### WF-06 Gruppen- und Terminverwaltung

```text
Gruppe erstellen/duplizieren -> Kurs, Trainer, Lernende zuweisen
-> Termin/Modus setzen -> starten -> Aktivierung autorisiert anpassen
-> Fortschritt überwachen -> stoppen/abschließen -> Zertifikate/Reports
```

Abnahme: Bestehendes Verhalten wartend/aktiv/inaktiv bleibt kompatibel; Ziel-Pfadmodus ist feature-geflaggt und auditierbar.

### WF-07 Zielablauf Kompetenzpfad

```text
Ziel + Einstufung -> anfängliche Kompetenzevidenz
-> Lückenberechnung -> empfohlener Pfad -> Bestätigung durch Lernenden/Trainer
-> lernen/üben/bewerten -> Mastery-Update -> Remediation oder nächste Aktivität
```

Abnahme: Jede Empfehlung nennt ihren Grund; Voraussetzungen sind sichtbar; Trainer können mit dokumentiertem Grund übersteuern.

### WF-08 Zielablauf Lab und verifizierte Evidenz

```text
Lab starten -> isoliertes Szenario bereitstellen -> Health Check
-> testen -> Artefakte erfassen -> deterministisch validieren
-> Evidenz einreichen -> automatische Prüfungen -> risikobasiertes Trainer-Review
-> Mastery/Portfolio aktualisieren -> Umgebung gemäß Retention löschen
```

Abnahme: Kein Zugriff zwischen Lernenden, deterministischer Reset, kurzlebige Secrets, wiederholbare Validierung und beobachtbare Fehler-/Retry-Kosten.

### WF-09 Zielablauf KI-Coach

```text
Hilfe anfordern -> Modus/Daten klassifizieren -> freigegebenen Kontext abrufen
-> Konzeptimpuls -> Leitfrage -> Teilhinweis -> Beispiel
-> Trainer-Eskalation -> Feedback-/Evaluationsereignis
```

Abnahme: Prüfungsantworten/versteckte Defekte werden blockiert; Quellen werden angezeigt; personenbezogene Daten minimiert; Quota, Latenz, Provider-Ausfall und Eskalation werden behandelt.

### WF-10 Zielablauf Integrations-Sync

```text
Domänenereignis -> transaktionale Outbox -> Mapping -> Eloomi/LTI/Webhook
-> idempotente Zustellung -> Bestätigung -> Checkpoint
-> Retry/DLQ bei Fehler -> Admin-Abgleich -> Replay
```

Abnahme: Ein Owner je Datenfeld, versionierte Payloads, Korrelations-IDs, Einwilligung, Audit-Historie und sicheres Replay.

---

## 7. Modulspezifikationen

| Modul | Jetzt erhalten | Ergänzen | Implementierungsreihenfolge | Release-Abnahme |
|---|---|---|---|---|
| Identity & Zugriff | Auth/Profil/Passwort/Rollen | Server-Session, MFA-/OIDC-Bereitschaft, Policy-Scopes | BFF-Fassade -> Session-Cookie -> Rollenlayouts -> Policy-Tests | Keine geschützte Seite vertraut der `localStorage`-Rolle; API erzwingt Ressourcenrechte |
| Shell & Lokalisierung | EN/DE/RU, Theme, Rollennavigation | Typisierte Schlüssel, Command/Search, responsive Shell | Tokens -> Primitive -> Layouts -> Locale-QA | Keine fehlenden Schlüssel; Tastatur-/Mobilpfade bestehen |
| Katalog & Enrollment | Öffentlicher/authentifizierter Katalog und Anfragen | Entitlement, Warteliste/Ablehnungsgrund | Adapter -> Seiten -> Antragszustände -> Admin-Aktion | WF-01 besteht inklusive Fehlerfälle |
| Content Studio | Kurs-/Stufen-/Video-/Aufgaben-/Test-CRUD | Versionen, Freigabe, Kompetenzzuordnung | Schema -> Schrittformular -> Medien -> Vorschau -> Veröffentlichung | Entwurfswiederherstellung und Locale-Validierung bestehen |
| Kohorten | Gruppen, Zuweisungen, Start/Stopp, Daten | flexibler Modus, Kapazität, Termin-Policy | Paritätsadapter -> Gruppenbereich -> Pfad-Flag | Keine Änderung der Legacy-Payloads; Audit erzeugt |
| Lernbereich | Stufen, Aufgaben, Video, Hinweis, Timer | Autosave, Evidenz, nächste Aktion, Barrierefreiheit | Aufgabenschema -> Workspace -> Abgabeschutz | WF-02 besteht mobil und Desktop |
| Review | Queues, annehmen/ablehnen/kommentieren/weitergeben/archivieren | Rubrik, SLA, Konflikterkennung, Assistenz | Queue -> Viewer -> Entscheidungen -> Historie | WF-04 besteht; unberechtigtes Review scheitert |
| Mentoring | Frage/Antwort/Weitergabe/Archiv | Kontextthread, Eskalation, SLA | Adapter -> Thread-UI -> Transfer-Ownership | WF-03 ohne verwaiste Zustände |
| Kompetenzen & Pfade | keine | Graph, Mastery, Evidenz, Voraussetzungen | Taxonomie -> Mapping -> Ledger -> Regeln -> UX | Erklärbare Empfehlung und Override-Historie |
| Labs | nur Ziel-Link | Provision/Reset/Validierung/Telemetrie | Bedrohungsmodell -> Orchestrator -> Szenariospezifikation -> UI | WF-08 plus Isolations-/Lasttests |
| Portfolio & Zertifizierung | Zertifikate listen/hinzufügen/downloaden | verifizierte Evidenz, öffentliche Prüfung, Widerruf | Kompatibilität -> Evidenzauswahl -> Verifier | Nicht erratbare Verifikation und Berechtigungstests |
| Gamification | keine | XP-Ledger, Badges, Missionen, optionales Opt-in-Leaderboard | Ereignisse -> Regel-Engine -> Ledger -> UI | Keine Login-/Klickpunkte; Replay idempotent |
| Benachrichtigungen | Liste/gelesen | Präferenzen, E-Mail/Push, Templates | Domänenereignisse -> Präferenzen -> Zustellstatus | Keine Duplikate; Abmeldung berücksichtigt |
| Analytics | einfache Counts/Reports | Eventmodell, Funnels, Kompetenz-/Review-Dashboards | Einwilligung -> Eventkatalog -> Pipeline -> Dashboards | Definition, Aktualität, Zugriff, Löschung getestet |
| KI-Gateway | generischer Browser-Chat | geschützter Coach/Empfehlung/Review-Entwurf | Serverproxy -> Redaction -> Retrieval -> Policy -> Evals | Kein Browser-Schlüssel; Leakage-/Kostentests bestehen |
| Integrationen | nicht beobachtet | Eloomi, LTI, xAPI/cmi5, Webhooks | Ownership-ADR -> kanonische Ereignisse -> Adapter -> Abgleich | Vertrags-/Idempotenz-/Berechtigungstests bestehen |
| Mandant/Commercial | nicht beobachtet | Organisationen, SSO, Pakete, Entitlements | Mandantenmodell -> Policy -> IdP -> Entitlement | Mandantenübergreifende Tests vor Launch zwingend |

---

## 8. Zweitägiger Beschleunigungsplan

### 8.1 Eintrittsbedingungen vor Start der Uhr

- Freigegebene UI-Konzepte für Lernenden-Aufgabe, Trainer-Review und Admin-Editor.
- API-Basis-URLs, Testzugänge aller Rollen und Freigabe für nichtproduktive Seed-Daten.
- Aktuelle Endpoint-/Payload-Beispiele für die sechs Kernabläufe.
- Entscheidung über neues Repository, Preview-Deployment, unterstützte Browser und Release-Owner.
- Verfügbarer Backend-Ansprechpartner für Vertragsfragen.
- Eingefrorene Featureliste; alle reinen Zielfunktionen standardmäßig `Vorschau`/aus.

Fehlt eine Bedingung, ist das 48-Stunden-Ergebnis ein Fixture-gestützter UI-Demonstrator und kein API-gestütztes Release.

### 8.2 Mindestteam für das bedingt API-gestützte Ziel

| Arbeitsstrom | Verantwortung |
|---|---|
| Architektur/API/Session | 1 Senior-Full-Stack-Entwickler |
| Lernenden-/öffentliche Experience | 1 Frontend-Entwickler |
| Trainer-/Admin-Experience | 1–2 Frontend-Entwickler |
| Designsystem/UX/Barrierefreiheit | 1 Product Designer oder Design Engineer |
| Tests/Release/QA | 1 QA-Automation- oder Full-Stack-Entwickler |

Eine Einzelperson sollte für ein Zweitagesrelease Plan B, die [Modernisierung im Bestand](./11_ENTWICKLUNGSPLAN_BESTANDSUPDATE.md), wählen.

### 8.3 Stundenplan

| Zeit | Ergebnis | Gate |
|---|---|---|
| H0–H2 | Scope Lock, Paritäts-IDs, API-Samples, Fixture-Regel, Ownership | GO nur bei erfüllten Eintrittsbedingungen |
| H2–H5 | Scaffolding, CI, Konfiguration, Locale-Routing, Tokens, App-Shell | Build-/Type-/Lint-Smoke grün |
| H5–H9 | Session-Fassade, API-Adapter, Schemas, Fehler, Rollenlayouts | Login-/Me-/Logout-/Forbidden-Tests |
| H9–H14 | Katalog, Kursdetail, Enrollment, Lernenden-Start/Kurs | WF-01-Smoke |
| H14–H20 | Aufgabenbereich, Autosave-/Timer-Schutz, Fragen, Abgabe | WF-02-/WF-03-Happy-Paths |
| H20–H24 | Integrationscheckpoint, Responsive-/A11y-Pass, Preview deployen | Tag-1-Demo; kein kritischer Blocker still mitgenommen |
| H24–H29 | Trainer-Queues, Review-Entscheidung, Weitergabe, Gruppendetail | WF-04-Smoke |
| H29–H35 | Admin-Übersicht, Kurs-/Aufgaben-/Gruppen-/Benutzerflächen mit bestehender API | WF-05-/WF-06-Paritäts-Smoke |
| H35–H39 | Vorschau-Routen und Verträge für Skills/Labs/Portfolio/Gamification/Analytics | Jede Vorschau sichtbar markiert; kein falscher Live-Status |
| H39–H43 | KI-Serverproxy als Stub/echter Provider nach Freigabe; Security Header/Logging | Kein Provider-Secret im Client-Bundle |
| H43–H46 | E2E-Kernsuite, Tastatur/Mobil, Fehler/Retry, Locale-Tests | Keine P0-Fehler |
| H46–H48 | Release Candidate, Rollback-Test, Coverage-Ledger, bekannte Lücken | Produkt/Tech/QA GO oder dokumentiertes NO-GO |

### 8.4 Definition of Done für Release 0

- Sechs API-gestützte Kernabläufe bestehen in der Ziel-Testumgebung.
- Alle Bestandsfunktionen tragen im Paritätsregister `Live`, `Vorschau`, `Blockiert` oder `Nicht begonnen`.
- Keine reine Zielfläche erscheint live, wenn sie Fixtures nutzt.
- Kein KI-/API-Secret wird an den Browser ausgeliefert.
- Geschützte Routen haben Serverprüfungen; die Verifikation der Backend-Policy wird separat dokumentiert.
- Primärabläufe in EN/DE sowie RU-Fallback rendern ohne fehlende Schlüssel.
- Kritische Desktop-/Mobilpfade bestehen Tastatur- und grundlegende Screenreader-Checks.
- Build, Typecheck, Lint, Unit-/Vertrags- und E2E-Smoke-Tests sind grün.
- Deployment, Monitoring, Korrelations-IDs und Rollback werden demonstriert.
- Release Notes führen unverifizierte Backend-Annahmen auf.

---

## 9. Roadmap bis zur Produktionsreife

| Phase | Umfang | Exit-Gate |
|---|---|---|
| G0 — Systemwahrheit | Laravel/Schema/Jobs prüfen, OpenAPI erfassen, Secrets rotieren, Daten und Kernabläufe baselinen | Kein unbekannter kritischer Vertrag/keine unbekannte Berechtigung |
| G1 — Paritätsplattform | Äquivalente aller 47 Routen, Medien, Exporte, Fehler-/Leerzustände, Responsive/A11y | 100 % CUR-01…15 und geprobte Migration |
| G2 — Sicherer Domänenkern | Identity, Policy, Inhaltsversionen, Enrollment/Kohorten, benannte Zustände, Audit/Outbox | Policy-/State-Machine-Tests und bewiesener Rollback |
| G3 — Kompetenz-MVP | Taxonomie, Aufgabenmapping, Evidenz-Ledger, flexible Pfade, Einstufung, Rubrik | Pilot belegt erklärbare Kompetenzprogression |
| G4 — Labs und Portfolio | isolierte Labs, deterministische Validierung, Evidenz, Verifier, Review-Skalierung | Security-/Isolation-/Last-/Review-Qualitätsgates |
| G5 — Organisationen/Integrationen | Mandantenmodell, SSO, Eloomi/LTI/xAPI, Webhooks, Abgleich, Reporting | Mandanten- und Replay-Tests; Ownership vereinbart |
| G6 — Differenzierung | geschützter KI-Coach, Advanced Labs, Experimente, kalibrierte Gamification | Lernverbesserung, Sicherheit, Zuverlässigkeit, Unit Economics |

Kalenderdauern werden erst nach Kenntnis von Backend-Inventar, Teamkapazität, Szenarioanzahl, Content-Migrationsvolumen und Eloomi-Vertrag geschätzt. Die mehrmonatige Größenordnung der früheren Architekturdokumente bleibt glaubwürdig — nicht 48 Stunden.

---

## 10. Datenmigration und Cutover

1. Benutzer, Rollen, Kurse, lokalisierte Inhalte, Stufen, Videos, Aufgaben, Tests, Gruppen, Zuweisungen, Abgaben, Fragen, Zertifikate, Bewertungen und Meldungen exportieren und abgleichen.
2. Unveränderliche Legacy-IDs und eine `external_id`-Mappingtabelle definieren.
3. Migration auf produktionsähnlicher Kopie proben; Anzahl, Checksummen, Beziehungen und gerenderte Stichproben vergleichen.
4. Neues Frontend zuerst gegen den Legacy-Adapter betreiben; Daten nicht allein für die UI-Modernisierung migrieren.
5. Jeweils eine Backend-Domäne mit Feature Flags und Vertragstests ersetzen.
6. Dual Write nur wenn unvermeidbar, mit Abgleich und festem Enddatum.
7. Für finalen Cutover Schreibvorgänge einfrieren oder geprüfte Change-Data-Strategie nutzen.
8. Altes Frontend im vereinbarten Rollback-/Prüfzeitraum schreibgeschützt vorhalten.

Rollback-Kriterien sind Authentifizierungsfehler, Berechtigungsregression, Abgabeverlust, falscher Review-Übergang, nicht erreichbare Zertifikate oder fehlgeschlagener Migrationsabgleich.

---

## 11. Verifikation und Lückenschutz

### 11.1 Erforderliche Testmatrix

| Test-ID | Journey | Positiv | Negativ/Fehler |
|---|---|---|---|
| E2E-01 | Gast -> Registrierung/Login -> Enrollment | Anfrage einmal erstellt | Duplikat, Validierung, Netzwerk-Retry, Ablehnung |
| E2E-02 | Aufgabe -> Abgabe -> Überarbeitung -> Annahme | Daten/Version erhalten | Session abgelaufen, Doppelabgabe, Uploadfehler, inaktive Aufgabe |
| E2E-03 | Frage -> Weitergabe -> Antwort | Ownership/Historie korrekt | unberechtigter Trainer, fehlgeschlagener Transfer, gelöschte Aufgabe |
| E2E-04 | Trainer-Review | Annahme/Überarbeitung korrekt | parallele Entscheidung, falsche Gruppe, veraltete Daten |
| E2E-05 | Admin-Kurs-/Aufgaben-Authoring | Locale/Medien/Vorschau/Publish | beschädigter Upload, ungespeicherte Daten, unvollständige Locale |
| E2E-06 | Gruppenlebenszyklus | Zuweisungen/Daten/Zustände korrekt | ungültiger Übergang, Duplikat, entfernter Trainer |
| E2E-07 | Zertifikat/Export/Benachrichtigung/Meldung | Datei/Mutation funktioniert | Datei fehlt, Berechtigung, großer Export, wiederholtes Lesen |
| E2E-08 | Kompetenz/Pfad/Lab/Portfolio | Zieldomänenregeln | Isolation, Regelkonflikt, Retry, Evidenz-Manipulation |
| SEC-01 | Rollen-/Ressourcenmatrix | erlaubte Aktion erfolgreich | jede rollen-/gruppen-/mandantenfremde Aktion scheitert |
| I18N-01 | EN/DE/RU | Schlüssel/Inhalt/Datum/Zahl korrekt | Fallback bei fehlendem Schlüssel/nicht unterstützter Locale |

### 11.2 Traceability-Gate

Für jede `CUR-*`-, `WF-*`- und Modulzeile wird erfasst:

```text
Anforderung -> Screen/Route -> API/Ereignis -> Berechtigung -> Zustandswechsel
-> automatisierter Test -> Owner -> Releasestatus -> Evidenzlink
```

Kein Element wird allein aufgrund eines Screenshots als `Fertig` markiert.

### 11.3 Ergebnis der Plan-Reverifikation

Dieser Plan wurde abgeglichen mit:

- allen 47 beobachteten Routen und der Verantwortungsmatrix für Gast/Student/Trainer/Admin;
- aktuellen Aufrufen für Katalog, Enrollment, Aufgaben, Review, Q&A, Gruppen, Content, Zertifikate, Bewertungen, Reports, Benachrichtigungen und Exporte;
- dem Diagnose-bis-Verbesserung-Zielablauf aus Dokument 08;
- Kompetenzen, Labs, KI, Trainer-Skalierung, Portfolio, Gamification, Analytics, Eloomi/LTI/xAPI, Mandanten-, Datenschutz- und Commercial-Konzepten aus Dokumenten 08 und 09;
- React-/Next-Risiken: Client-Waterfalls, zu große Client-Fläche, inkonsistenter Query-Cache, schwere Bundles und wiederholte Initialaufrufe;
- der offenen Backend-/Schema-Grenze.

Verbleibende Unbekannte stehen nachfolgend und werden nicht still als Annahmen behandelt.

---

## 12. Blockierende Fragen und abschließende Empfehlung

### Vor Produktion erforderliche Backend-/Produktentscheidungen

1. Exakte Laravel-Routen, Schemas, Policies, Statuswechsel, Jobs, Token-Laufzeit und Rate Limits.
2. Zertifikatsberechtigung, Generierung, Widerruf, Prüfung und Ownership.
3. Ownership des Testziels, Defect Seeding, Isolation je Lernendem, Reset, Telemetrie und Kapazität.
4. Aktuelle Produktionsvolumen, Dateigrößen, Parallelität, Review-Durchsatz und Retention.
5. Owner der Kompetenz-Taxonomie, Mastery-Formel, Evidenzanforderungen, Rubrik-Kalibrierung und Pfad-Override-Policy.
6. Eloomi-Ownership für Benutzer, Enrollment, Fortschritt, Content und Zertifikate sowie verfügbare SSO-/API-/Webhook-/LTI-Funktionen.
7. Entscheidungen zu Organisation/Mandant, Preis, Entitlement, Zahlung, White Label und Datenresidenz.
8. DSGVO-Rechtsgrundlage, Einwilligung, Auftragsverarbeitung, KI-DSFA, Retention, Export und Löschung.

### Empfehlung

Dieser Greenfield-Plan ist richtig, wenn das strategische Ziel eine langlebige Produktplattform ist und ein multidisziplinäres Team die Funktionsparität absichern kann. Für ein echtes Zweitagesrelease mit kleinem Team sollte zuerst der Bestand nach [Plan B](./11_ENTWICKLUNGSPLAN_BESTANDSUPDATE.md) modernisiert werden. Adapter und Designsystem sind dabei so anzulegen, dass die spätere Greenfield-Migration möglich bleibt.
