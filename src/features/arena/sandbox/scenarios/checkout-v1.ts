import type { ScenarioConfiguration } from "../model";

/**
 * ⭐ The reference scenario — `checkout-v1`.
 *
 * This is the worked example the authoring contract in `../README.md` refers
 * to, and the **single source of truth** for the row in
 * `supabase/seed_arena_scenarios.sql`. The two are kept in step by
 * `scripts/ws9-check-scenario.mjs`, which diffs the JSON in the seed against
 * this object — a scenario that renders in a preview and something else in the
 * database is a bug that only ever appears in front of a learner.
 *
 * Everything a learner reads here is GERMAN and stays German:
 * `CONTENT_LOCALES === ["de"]`. The strings are deliberately long real German
 * compounds rather than short placeholders, because the checklist item that
 * catches the most layout defects is "German content at full length".
 *
 * It exercises every capability the contract claims:
 *  - a stateless planted defect        → QTY_ACCEPTS_NEGATIVE
 *  - a second stateless planted defect → TOTAL_IGNORES_DISCOUNT
 *  - a **stateful** planted defect     → SHIPPING_DOUBLE_COUNTED (afterSignals)
 *  - an **input-dependent** defect     → EMAIL_VALIDATION_BYPASS (whenInput)
 *  - a **decoy**                       → SLOW_THUMBNAIL
 *  - a **known non-bug**               → SHIPPING_NOT_FREE_BELOW_THRESHOLD
 */
export const CHECKOUT_V1: ScenarioConfiguration = {
  engineVersion: 1,
  appName: "Nordlicht Bürobedarf — Kasse",

  // Shared, mutable data. Seeded before the first render, so the summary never
  // shows a zero total and then jumps.
  store: {
    "checkout.lines": [
      {
        id: "chair",
        name: "Ergonomischer Schreibtischstuhl mit Lendenwirbelstütze",
        sku: "NL-48120",
        unitPriceCents: 32900,
        quantity: 1,
      },
      {
        id: "headset",
        name: "Kabelloses Bluetooth-Headset mit Geräuschunterdrückung",
        sku: "NL-22074",
        unitPriceCents: 8990,
        quantity: 2,
      },
      {
        id: "stand",
        name: "Höhenverstellbarer Monitorständer aus geöltem Bambusholz",
        sku: "NL-31655",
        unitPriceCents: 4450,
        quantity: 1,
      },
    ],
  },

  surfaces: [
    {
      id: "cart",
      component: "checkout/line-item",
      column: "main",
      content: {
        heading: "Ihr Warenkorb",
      },
    },
    {
      id: "customer",
      component: "checkout/customer-form",
      column: "main",
      content: {
        heading: "Rechnungs- und Lieferadresse",
      },
    },
    {
      id: "summary",
      component: "checkout/cart-summary",
      column: "aside",
      content: {
        heading: "Bestellübersicht",
        couponCode: "WMC10",
        couponPercent: 10,
        shippingCents: 495,
        freeShippingThresholdCents: 50_000,
      },
    },
  ],

  defects: [
    {
      code: "QTY_ACCEPTS_NEGATIVE",
      kind: "planted",
      severity: "medium",
      surface: "cart",
      effect: "quantity-allows-negative",
      trigger: { type: "always" },
      params: {},
      reproduction:
        "Im Warenkorb bei einer Position so oft auf „Menge verringern“ klicken, bis die Menge unter 1 fällt.",
      expected:
        "Die Menge darf 1 nicht unterschreiten; zum Entfernen gibt es „Entfernen“. Eine negative Menge ergibt einen negativen Positionsbetrag.",
    },
    {
      code: "TOTAL_IGNORES_DISCOUNT",
      kind: "planted",
      severity: "high",
      surface: "summary",
      effect: "discount-ignored",
      trigger: { type: "always" },
      params: {},
      reproduction:
        "In der Bestellübersicht den Gutscheincode WMC10 eingeben und auf „Einlösen“ klicken.",
      expected:
        "Die Rabattzeile wird angezeigt, die Gesamtsumme zieht den Rabatt jedoch nicht ab. Angezeigter Rabatt und berechnete Summe widersprechen sich.",
    },
    {
      code: "SHIPPING_DOUBLE_COUNTED",
      kind: "planted",
      severity: "critical",
      surface: "summary",
      effect: "shipping-double-counted",
      // Stateful: correct on load, wrong once the learner has been working.
      // A tester who checks the total once and moves on never sees it.
      trigger: { type: "afterSignals", signal: "quantity-changed", count: 3 },
      params: { factor: 2 },
      reproduction:
        "Mengen im Warenkorb insgesamt dreimal ändern und danach die Versandkosten in der Bestellübersicht prüfen.",
      expected:
        "Die Versandkosten werden ab der dritten Mengenänderung doppelt berechnet — in der Versandzeile und in der Gesamtsumme. Beim Laden der Seite sind sie noch korrekt.",
    },
    {
      code: "EMAIL_VALIDATION_BYPASS",
      kind: "planted",
      severity: "low",
      surface: "customer",
      effect: "email-validation-bypass",
      // Input-dependent: the validator only fails for an address whose domain
      // has no top-level domain, which is exactly the case it should refuse.
      trigger: { type: "whenInput", field: "email", pattern: "^[^\\s@]+@[^\\s@.]+$" },
      params: {},
      reproduction:
        "Als E-Mail-Adresse „kunde@beispiel“ eingeben, die übrigen Pflichtfelder ausfüllen und bestellen.",
      expected:
        "Eine Adresse ohne Top-Level-Domain muss abgelehnt werden. Stattdessen wird die Bestellung angenommen.",
    },
    {
      code: "SLOW_THUMBNAIL",
      kind: "decoy",
      surface: "cart",
      effect: "slow-thumbnail",
      trigger: { type: "always" },
      params: { delayMs: 1200 },
      reproduction:
        "Die Produktbilder im Warenkorb erscheinen erst gut eine Sekunde nach dem Rest der Seite.",
      expected:
        "KEIN Fehler. Bilder werden bewusst nachgeladen; Layout, Größe und Platz bleiben dabei unverändert, es springt nichts. Wer das meldet, hat eine Beobachtung gemacht, aber keinen Fehler gefunden.",
    },
    {
      code: "SHIPPING_NOT_FREE_BELOW_THRESHOLD",
      kind: "known_non_bug",
      surface: "summary",
      // No effect: this is a property of the design, not something the engine
      // switches on. It is recorded so a trainer answers it once here instead
      // of once per learner forever.
      trigger: { type: "always" },
      params: {},
      reproduction:
        "Es werden Versandkosten berechnet, obwohl der Warenkorb bereits mehrere hundert Euro enthält.",
      expected:
        "KEIN Fehler. Die Versandkostenfreigrenze liegt bei 500,00 € und steht als Hinweis unter der Bestellübersicht.",
    },
  ],
};

/** What `hunt_scenarios.expected_findings` must say for this scenario. */
export const CHECKOUT_V1_EXPECTED_FINDINGS = CHECKOUT_V1.defects.filter(
  (defect) => defect.kind === "planted",
).length;
