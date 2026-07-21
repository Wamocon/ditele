-- ═══════════════════════════════════════════════════════════════════════════
-- Bug Arena — hunt scenarios (WS-9)
--
-- ⚠️ This is a SEED, not a migration. WS-9's migration block is empty by
-- design (06_ARENA_WORKSTREAMS §4): adding a scenario must never need a
-- schema change, and the day it does, that is a defect in WS-9 and it goes in
-- ISSUES.md. Apply it the same way WS-8 applies migrations:
--
--   tr -d '' < supabase/seed_arena_scenarios.sql | ssh Nvidia-1 --     'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
--
-- Idempotent: re-running it updates the row in place rather than duplicating
-- it. `hunt_scenarios_code_version_unique` is the conflict target, so a
-- CHANGED scenario should get a NEW `scenario_version` rather than
-- overwriting the one learners are mid-hunt on — see README §"Versioning".
--
-- ⭐ The `configuration` below is copied VERBATIM from
-- `src/features/arena/sandbox/scenarios/checkout-v1.json`, which is the single
-- source of truth for it. `node scripts/ws9-check-scenario.mjs` diffs the two.
-- Do not hand-edit the JSON here; edit the .json file and re-run that check.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into public.hunt_scenarios (
  organization_id, code, scenario_version, title, description,
  configuration, expected_findings, state
)
values (
  -- The one organization on this deployment (RPC_CONTRACTS §7).
  '01980a10-0000-7000-8000-000000000001',
  'checkout-v1',
  1,
  -- Course material. GERMAN ONLY (CONTENT_LOCALES === ["de"]).
  'Kassen-Jagd — Nordlicht Bürobedarf',
  'Ein Online-Shop kurz vor dem Bezahlen: Warenkorb, Adressformular und Bestellübersicht. In dieser Fassung sind vier Fehler eingebaut. Nicht alles, was ungewöhnlich aussieht, ist auch ein Fehler — entscheide bei jeder Beobachtung, ob sie ein Ticket wert ist.',
  $config${
  "engineVersion": 1,
  "appName": "Nordlicht Bürobedarf — Kasse",
  "store": {
    "checkout.lines": [
      {
        "id": "chair",
        "name": "Ergonomischer Schreibtischstuhl mit Lendenwirbelstütze",
        "sku": "NL-48120",
        "unitPriceCents": 32900,
        "quantity": 1
      },
      {
        "id": "headset",
        "name": "Kabelloses Bluetooth-Headset mit Geräuschunterdrückung",
        "sku": "NL-22074",
        "unitPriceCents": 8990,
        "quantity": 2
      },
      {
        "id": "stand",
        "name": "Höhenverstellbarer Monitorständer aus geöltem Bambusholz",
        "sku": "NL-31655",
        "unitPriceCents": 4450,
        "quantity": 1
      }
    ]
  },
  "surfaces": [
    {
      "id": "cart",
      "component": "checkout/line-item",
      "column": "main",
      "content": {
        "heading": "Ihr Warenkorb"
      }
    },
    {
      "id": "customer",
      "component": "checkout/customer-form",
      "column": "main",
      "content": {
        "heading": "Rechnungs- und Lieferadresse"
      }
    },
    {
      "id": "summary",
      "component": "checkout/cart-summary",
      "column": "aside",
      "content": {
        "heading": "Bestellübersicht",
        "couponCode": "WMC10",
        "couponPercent": 10,
        "shippingCents": 495,
        "freeShippingThresholdCents": 100000
      }
    }
  ],
  "defects": [
    {
      "code": "QTY_ACCEPTS_NEGATIVE",
      "kind": "planted",
      "severity": "medium",
      "surface": "cart",
      "effect": "quantity-allows-negative",
      "trigger": {
        "type": "always"
      },
      "params": {},
      "reproduction": "Im Warenkorb bei einer Position so oft auf „Menge verringern“ klicken, bis die Menge unter 1 fällt.",
      "expected": "Die Menge darf 1 nicht unterschreiten; zum Entfernen gibt es „Entfernen“. Eine negative Menge ergibt einen negativen Positionsbetrag."
    },
    {
      "code": "TOTAL_IGNORES_DISCOUNT",
      "kind": "planted",
      "severity": "high",
      "surface": "summary",
      "effect": "discount-ignored",
      "trigger": {
        "type": "always"
      },
      "params": {},
      "reproduction": "In der Bestellübersicht den Gutscheincode WMC10 eingeben und auf „Einlösen“ klicken.",
      "expected": "Die Rabattzeile wird angezeigt, die Gesamtsumme zieht den Rabatt jedoch nicht ab. Angezeigter Rabatt und berechnete Summe widersprechen sich."
    },
    {
      "code": "SHIPPING_DOUBLE_COUNTED",
      "kind": "planted",
      "severity": "critical",
      "surface": "summary",
      "effect": "shipping-double-counted",
      "trigger": {
        "type": "afterSignals",
        "signal": "quantity-changed",
        "count": 3
      },
      "params": {
        "factor": 2
      },
      "reproduction": "Mengen im Warenkorb insgesamt dreimal ändern und danach die Versandkosten in der Bestellübersicht prüfen.",
      "expected": "Die Versandkosten werden ab der dritten Mengenänderung doppelt berechnet — in der Versandzeile und in der Gesamtsumme. Beim Laden der Seite sind sie noch korrekt."
    },
    {
      "code": "EMAIL_VALIDATION_BYPASS",
      "kind": "planted",
      "severity": "low",
      "surface": "customer",
      "effect": "email-validation-bypass",
      "trigger": {
        "type": "whenInput",
        "field": "email",
        "pattern": "^[^\\s@]+@[^\\s@.]+$"
      },
      "params": {},
      "reproduction": "Als E-Mail-Adresse „kunde@beispiel“ eingeben, die übrigen Pflichtfelder ausfüllen und bestellen.",
      "expected": "Eine Adresse ohne Top-Level-Domain muss abgelehnt werden. Stattdessen wird die Bestellung angenommen."
    },
    {
      "code": "SLOW_THUMBNAIL",
      "kind": "decoy",
      "surface": "cart",
      "effect": "slow-thumbnail",
      "trigger": {
        "type": "always"
      },
      "params": {
        "delayMs": 1200
      },
      "reproduction": "Die Produktbilder im Warenkorb erscheinen erst gut eine Sekunde nach dem Rest der Seite.",
      "expected": "KEIN Fehler. Bilder werden bewusst nachgeladen; Layout, Größe und Platz bleiben dabei unverändert, es springt nichts. Wer das meldet, hat eine Beobachtung gemacht, aber keinen Fehler gefunden."
    },
    {
      "code": "SHIPPING_NOT_FREE_BELOW_THRESHOLD",
      "kind": "known_non_bug",
      "surface": "summary",
      "trigger": {
        "type": "always"
      },
      "params": {},
      "reproduction": "Es werden Versandkosten berechnet, obwohl der Warenkorb bereits mehrere hundert Euro enthält.",
      "expected": "KEIN Fehler. Die Versandkostenfreigrenze liegt bei 1.000,00 € und steht als Hinweis unter der Bestellübersicht."
    }
  ]
}$config$::jsonb,
  -- Planted defects only. Decoys and known non-bugs never count towards it.
  4,
  'active'
)
on conflict on constraint hunt_scenarios_code_version_unique do update
set title             = excluded.title,
    description       = excluded.description,
    configuration     = excluded.configuration,
    expected_findings = excluded.expected_findings,
    state             = excluded.state,
    organization_id   = excluded.organization_id,
    row_version       = public.hunt_scenarios.row_version + 1,
    updated_at        = statement_timestamp();

commit;

-- ─── Prove it landed the way the engine expects ─────────────────────────────
do $verify$
declare
  scenario_record public.hunt_scenarios%rowtype;
  planted_count integer;
begin
  select * into scenario_record
  from public.hunt_scenarios
  where code = 'checkout-v1' and scenario_version = 1;

  if not found then
    raise exception 'scenario checkout-v1 was not written' using errcode = '55000';
  end if;

  select count(*) into planted_count
  from jsonb_array_elements(scenario_record.configuration -> 'defects') as defect
  where defect ->> 'kind' = 'planted';

  if planted_count <> scenario_record.expected_findings then
    raise exception
      'expected_findings is % but the configuration plants % defects',
      scenario_record.expected_findings, planted_count
      using errcode = '55000';
  end if;

  raise notice 'scenario % v% active, % planted defects',
    scenario_record.code, scenario_record.scenario_version, planted_count;
end
$verify$;

-- ─── ⚠️ Still to do, and NOT WS-9's to do ───────────────────────────────────
-- The hunt task seeded by WS-8 (019f9100-0000-7000-8000-000000000001,
-- source_system='arena', external_id='checkout-v1') has a NULL target_url, so
-- the task workspace shows no practice panel and a learner cannot reach this
-- sandbox from the task. The value it needs is:
--
--   /de/arena/sandbox/checkout-v1?embed=1
--
-- WS-9 does not write it. `tasks` sits inside a published content version
-- behind five integrity triggers (WS-8's status file documents which), and
-- content is not this workstream's tree. Logged as ISSUES.md I-045 for WS-10,
-- which prefills the report's sourceUri from the same URL.
