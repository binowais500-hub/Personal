import { PrismaClient } from "@prisma/client";
import { addMonths, subMonths } from "date-fns";
import { computeDedupeHash } from "../src/lib/dedupe";
import { normalizeMerchant } from "../src/lib/merchant";
import { buildAmortizationSchedule, calcMonthlyPayment } from "../src/lib/mortgage";

const db = new PrismaClient();

const CATEGORIES = [
  { name: "Groceries", color: "#16a34a", icon: "shopping-cart", sortOrder: 1 },
  { name: "Dining", color: "#f97316", icon: "utensils", sortOrder: 2 },
  { name: "Travel", color: "#0ea5e9", icon: "plane", sortOrder: 3 },
  { name: "Fuel", color: "#78716c", icon: "fuel", sortOrder: 4 },
  { name: "Shopping", color: "#a855f7", icon: "shopping-bag", sortOrder: 5 },
  { name: "Utilities", color: "#eab308", icon: "zap", sortOrder: 6 },
  { name: "Kids/School", color: "#ec4899", icon: "graduation-cap", sortOrder: 7 },
  { name: "Subscriptions", color: "#6366f1", icon: "repeat", sortOrder: 8 },
  { name: "Health", color: "#ef4444", icon: "heart-pulse", sortOrder: 9 },
  { name: "Other", color: "#64748b", icon: "circle", sortOrder: 10 },
] as const;

const SEED_RULES: { category: string; patterns: string[] }[] = [
  { category: "Groceries", patterns: ["CARREFOUR", "SPINNEYS", "WAITROSE", "LULU", "UNION COOP", "CHOITHRAM", "ZOOM"] },
  {
    category: "Dining",
    patterns: ["TALABAT", "ZOMATO", "DELIVEROO", "STARBUCKS", "MCDONALD", "KFC", "SHAKE SHACK", "COSTA", "TIM HORTONS", "RESTAURANT", "CAFE"],
  },
  {
    category: "Travel",
    patterns: ["EMIRATES AIRLINE", "ETIHAD", "FLYDUBAI", "AIR ARABIA", "BOOKING.COM", "AIRBNB", "HOTEL", "MARRIOTT", "HILTON", "UBER", "CAREEM"],
  },
  { category: "Fuel", patterns: ["ENOC", "EPPCO", "ADNOC", "EMARAT"] },
  { category: "Shopping", patterns: ["AMAZON.AE", "NOON", "SHEIN", "IKEA", "H&M", "ZARA", "SHARAF DG", "VIRGIN MEGASTORE"] },
  { category: "Utilities", patterns: ["DEWA", "ETISALAT", "DU TELECOM", "SEWA", "EMPOWER"] },
  { category: "Kids/School", patterns: ["GEMS", "NURSERY", "SCHOOL"] },
  { category: "Subscriptions", patterns: ["NETFLIX", "SPOTIFY", "APPLE.COM/BILL", "AMAZON PRIME", "DISNEY", "OSN", "ANGHAMI"] },
  { category: "Health", patterns: ["LIFE PHARMACY", "ASTER PHARMACY", "MEDICLINIC", "CLINIC", "PHARMACY"] },
];

const BUDGETS: Record<string, number> = {
  Groceries: 2500,
  Dining: 1800,
  Travel: 3000,
  Fuel: 700,
  Shopping: 2000,
  Utilities: 1200,
  "Kids/School": 3500,
  Subscriptions: 300,
  Health: 800,
  Other: 500,
};

type SpendTemplate = {
  merchant: string;
  category: string;
  min: number;
  max: number;
  currency?: "USD" | "EUR" | "GBP";
  frequency: "every" | "often" | "sometimes" | "rare";
};

const SPEND_TEMPLATES: SpendTemplate[] = [
  { merchant: "CARREFOUR HYPERMARKET", category: "Groceries", min: 120, max: 480, frequency: "every" },
  { merchant: "SPINNEYS", category: "Groceries", min: 60, max: 260, frequency: "often" },
  { merchant: "TALABAT", category: "Dining", min: 35, max: 130, frequency: "every" },
  { merchant: "STARBUCKS COFFEE", category: "Dining", min: 18, max: 45, frequency: "often" },
  { merchant: "ZOMATO", category: "Dining", min: 40, max: 150, frequency: "often" },
  { merchant: "MCDONALDS", category: "Dining", min: 25, max: 70, frequency: "sometimes" },
  { merchant: "CAREEM", category: "Travel", min: 20, max: 90, frequency: "often" },
  { merchant: "UBER TRIP", category: "Travel", min: 20, max: 95, frequency: "often" },
  { merchant: "ENOC FUEL STATION", category: "Fuel", min: 120, max: 220, frequency: "every" },
  { merchant: "ADNOC FUEL", category: "Fuel", min: 120, max: 220, frequency: "sometimes" },
  { merchant: "NOON.COM", category: "Shopping", min: 60, max: 650, frequency: "often" },
  { merchant: "AMAZON.AE", category: "Shopping", min: 45, max: 520, frequency: "often" },
  { merchant: "SHARAF DG", category: "Shopping", min: 200, max: 1800, frequency: "rare" },
  { merchant: "DEWA", category: "Utilities", min: 420, max: 680, frequency: "every" },
  { merchant: "ETISALAT", category: "Utilities", min: 280, max: 420, frequency: "every" },
  { merchant: "GEMS WELLINGTON SCHOOL", category: "Kids/School", min: 3200, max: 3200, frequency: "sometimes" },
  { merchant: "NETFLIX.COM", category: "Subscriptions", min: 39, max: 39, frequency: "every" },
  { merchant: "SPOTIFY", category: "Subscriptions", min: 21, max: 21, frequency: "every" },
  { merchant: "AMAZON PRIME", category: "Subscriptions", min: 15, max: 15, frequency: "every" },
  { merchant: "LIFE PHARMACY", category: "Health", min: 30, max: 220, frequency: "sometimes" },
  { merchant: "MEDICLINIC", category: "Health", min: 150, max: 900, frequency: "rare" },
  { merchant: "BOOKING.COM HOTEL", category: "Travel", min: 400, max: 2200, currency: "USD", frequency: "rare" },
  { merchant: "AIRBNB LONDON", category: "Travel", min: 300, max: 1400, currency: "GBP", frequency: "rare" },
  { merchant: "ZARA.COM", category: "Shopping", min: 200, max: 900, currency: "EUR", frequency: "rare" },
];

const FX_RATES: Record<string, number> = { USD: 3.6725, EUR: 4.0, GBP: 4.65 };
const FX_FEE_PCT = 0.021;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

async function seedCategoriesAndRules() {
  const categoryByName = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await db.category.upsert({
      where: { name: c.name },
      update: { color: c.color, icon: c.icon, sortOrder: c.sortOrder, isSystem: true },
      create: { ...c, isSystem: true },
    });
    categoryByName.set(c.name, row.id);
  }

  for (const group of SEED_RULES) {
    const categoryId = categoryByName.get(group.category)!;
    for (const pattern of group.patterns) {
      const existing = await db.categoryRule.findFirst({ where: { pattern, source: "seed" } });
      if (!existing) {
        await db.categoryRule.create({
          data: { pattern, categoryId, priority: 10, source: "seed" },
        });
      }
    }
  }

  return categoryByName;
}

async function seedBudgets(categoryByName: Map<string, string>) {
  for (const [name, amount] of Object.entries(BUDGETS)) {
    const categoryId = categoryByName.get(name);
    if (!categoryId) continue;
    await db.budget.upsert({
      where: { categoryId },
      update: {},
      create: { categoryId, amountAED: amount },
    });
  }
}

async function seedCardsAndTransactions(categoryByName: Map<string, string>) {
  const existingCards = await db.card.count();
  if (existingCards > 0) {
    console.log("Cards already exist — skipping demo transaction seed.");
    return;
  }

  const cards = await Promise.all([
    db.card.create({
      data: { bankName: "Emirates NBD", cardName: "Visa Signature", last4: "4821", currency: "AED", color: "#0f6e5b" },
    }),
    db.card.create({
      data: { bankName: "ADCB", cardName: "Traveller Card", last4: "7734", currency: "AED", color: "#1d4ed8" },
    }),
    db.card.create({
      data: { bankName: "Mashreq", cardName: "NEO Card", last4: "2290", currency: "AED", color: "#b45309" },
    }),
  ]);

  const today = new Date();
  const monthsBack = 13;

  for (const card of cards) {
    const batch = await db.importBatch.create({
      data: {
        cardId: card.id,
        fileName: "seed-demo-data.csv",
        fileType: "seed",
        rowCount: 0,
        importedAt: subMonths(today, monthsBack),
      },
    });

    let rowCount = 0;

    for (let m = monthsBack; m >= 0; m--) {
      const monthDate = subMonths(today, m);
      const isCurrentMonth = m === 0;
      const daysInMonth = isCurrentMonth ? today.getDate() : 28;

      for (const template of SPEND_TEMPLATES) {
        const chance = { every: 1, often: 0.75, sometimes: 0.4, rare: 0.15 }[template.frequency];
        if (rand() > chance) continue;
        // Not every card carries every merchant — spreads spend across cards realistically.
        if (rand() > 0.6) continue;

        const day = Math.max(1, Math.floor(rand() * daysInMonth));
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const merchantNormalized = normalizeMerchant(template.merchant);
        const categoryId = categoryByName.get(template.category) ?? null;

        const baseAmount = template.min + rand() * (template.max - template.min);
        let amountAED = Math.round(baseAmount * 100) / 100;
        let amountOriginal = amountAED;
        let currencyOriginal = "AED";
        let fxFee: number | null = null;

        if (template.currency) {
          currencyOriginal = template.currency;
          amountOriginal = Math.round((baseAmount / FX_RATES[template.currency]) * 100) / 100;
          fxFee = Math.round(amountAED * FX_FEE_PCT * 100) / 100;
          amountAED = Math.round((amountAED + fxFee) * 100) / 100;
        }

        const description = `${template.merchant} ${currencyOriginal !== "AED" ? currencyOriginal + " " : ""}PURCHASE`;
        const dedupeHash = await computeDedupeHash({ date, amountAED, description });

        try {
          await db.transaction.create({
            data: {
              cardId: card.id,
              date,
              description,
              merchantRaw: template.merchant,
              merchantNormalized,
              amountAED,
              amountOriginal,
              currencyOriginal,
              fxFee: fxFee ?? undefined,
              categoryId,
              dedupeHash,
              importBatchId: batch.id,
            },
          });
          rowCount++;
        } catch {
          // Skip on the rare hash collision within the same card/day.
        }
      }
    }

    // A couple of deliberately large, unfamiliar one-off charges to populate "unusual transactions".
    const unusualDate = subMonths(today, pick([1, 2, 4]));
    const unusualDesc = pick(["APPLE STORE DUBAI MALL", "SAMSUNG EXPERIENCE STORE", "ROLEX BOUTIQUE"]);
    const amountAED = 3200 + rand() * 4800;
    const unusualHash = await computeDedupeHash({ date: unusualDate, amountAED, description: unusualDesc });
    await db.transaction.create({
      data: {
        cardId: card.id,
        date: unusualDate,
        description: `${unusualDesc} PURCHASE`,
        merchantRaw: unusualDesc,
        merchantNormalized: normalizeMerchant(unusualDesc),
        amountAED: Math.round(amountAED * 100) / 100,
        amountOriginal: Math.round(amountAED * 100) / 100,
        currencyOriginal: "AED",
        categoryId: categoryByName.get("Shopping") ?? null,
        dedupeHash: unusualHash,
        importBatchId: batch.id,
      },
    });
    rowCount++;

    await db.importBatch.update({ where: { id: batch.id }, data: { rowCount } });
  }
}

async function seedMortgage() {
  const existing = await db.mortgage.count();
  if (existing > 0) {
    console.log("Mortgage already exists — skipping.");
    return;
  }

  const today = new Date();
  const principal = 2_000_000;
  const fixedRateAPR = 3.99;
  const tenorMonths = 300; // 25 years
  const startDate = subMonths(today, 34);
  const fixedPeriodEndDate = addMonths(startDate, 36);
  const monthlyPayment = calcMonthlyPayment(principal, fixedRateAPR, tenorMonths);

  const mortgage = await db.mortgage.create({
    data: {
      bankName: "ADCB",
      principal,
      startDate,
      tenorMonths,
      fixedRateAPR,
      fixedPeriodEndDate,
      marginBps: 195,
      eiborAssumptionBps: 405,
      monthlyPayment,
      earlySettlementFeeCapPct: 1.0,
    },
  });

  const schedule = buildAmortizationSchedule({
    principal,
    startDate,
    tenorMonths,
    fixedRateAPR,
    fixedPeriodEndDate,
    marginBps: 195,
    eiborAssumptionBps: 405,
    monthlyPayment,
  });

  const pastRows = schedule.filter((r) => r.date <= today);
  for (const row of pastRows) {
    await db.mortgagePayment.create({
      data: {
        mortgageId: mortgage.id,
        date: row.date,
        amount: Math.round(row.payment * 100) / 100,
        type: "scheduled",
        principalPortion: Math.round(row.principal * 100) / 100,
        interestPortion: Math.round(row.interest * 100) / 100,
      },
    });
  }

  const lumpSumDate = addMonths(startDate, 14);
  if (lumpSumDate <= today) {
    await db.mortgagePayment.create({
      data: {
        mortgageId: mortgage.id,
        date: lumpSumDate,
        amount: 100_000,
        type: "lump_sum",
        principalPortion: 100_000,
        interestPortion: 0,
        feeCharged: 1_000,
        notes: "Partial prepayment — annual bonus",
      },
    });
  }
}

async function main() {
  const categoryByName = await seedCategoriesAndRules();
  await seedBudgets(categoryByName);
  await seedCardsAndTransactions(categoryByName);
  await seedMortgage();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
