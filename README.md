# Ledger — personal finance dashboard

A private, local-only dashboard for tracking UAE credit card spending and a
mortgage. Everything runs on your own machine: the database is a single
SQLite file on disk, there are no cloud services, no bank logins, and no
external APIs — the app never makes an outbound network request with your
financial data.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). That's it — one command.

The first `npm run dev` automatically:
- generates a random session secret into `.env` (used to sign your login session)
- creates the local SQLite database (`prisma/dev.db`) and applies the schema
- seeds it with realistic fake cards, transactions, categories, and a sample
  mortgage, so there's something to look at before you import real statements

On first visit you'll be asked to **create a password** — this is a local
lock screen only (bcrypt-hashed, stored in the SQLite file); there's no
account, no email, nothing leaves your machine.

To start over with a clean database and fresh demo data:

```bash
npm run db:reset
```

## What it does

**Credit cards**
- Import statements as CSV, Excel (`.xlsx`/`.xls`), or PDF. A guided wizard
  maps each bank's columns (or, for PDF, a text pattern) once and remembers
  it for next time. Duplicate transactions are detected before anything is
  saved, and you get a full preview you can edit before committing.
- Merchant names are auto-categorized by rule, and correcting a category by
  hand teaches the app a new rule for that merchant.
- Dashboards for monthly spend trends, spend by category vs. your trailing
  average, top merchants, recurring subscriptions, unusually large or
  unfamiliar transactions, and foreign-currency spend/fees.
- Monthly budgets per category with progress bars and an over-budget flag.

**Mortgage**
- Enter your loan once (principal, fixed rate and period, margin over EIBOR,
  current EIBOR assumption, monthly payment) and get a full amortization
  schedule, split by principal vs. interest, month by month.
- A rate-reset view shows what your payment becomes once the fixed period
  ends, with a slider to explore different EIBOR scenarios.
- An early-repayment simulator models a lump sum or a higher monthly
  payment, showing months cut and interest saved net of the bank's early
  settlement fee (capped, UAE-style, as a percentage of the amount prepaid).
- A payment log tracks actual payments and prepayments; logged prepayments
  automatically feed back into the amortization schedule so the outstanding
  balance reflects reality, not just the original loan terms.

**Overview**
- One home screen with this month's spend vs. budget, mortgage balance,
  next payment, interest paid year-to-date, and a savings trend — laid out
  cleanly enough to screenshot, or print/export to PDF with the button in
  the top right (uses your browser's native print-to-PDF, no server round
  trip).

## Tech stack

Next.js (App Router) + TypeScript, Tailwind CSS v4, Radix UI primitives
(hand-built in the shadcn/ui style), Recharts, Prisma + SQLite, `date-fns`,
`papaparse`/`xlsx`/`pdf-parse` for statement parsing, `jose` + `bcryptjs`
for the password lock.

## Development

```bash
npm run test    # mortgage math + analytics unit tests (vitest)
npm run lint    # eslint
npm run build   # production build
npm run start   # run the production build
```

The mortgage amortization engine (`src/lib/mortgage.ts`) is covered by unit
tests in `src/lib/mortgage.test.ts`, including a check against the standard
closed-form amortization payment formula, and against `analytics.test.ts`
for the spend/insights math.

## Data & privacy

- The database is a single file: `prisma/dev.db`. Delete it (or run
  `npm run db:reset`) to wipe everything and start over.
- `.env` (your session secret) and `prisma/dev.db` are both git-ignored —
  never commit them.
- Uploaded statement files are parsed in memory during import and are not
  written to disk; only the resulting transactions are stored.
- The `xlsx` package on npm hasn't published SheetJS's latest security
  patches for its own registry listing; since this app only ever parses
  spreadsheet files you choose to upload yourself, the risk is low, but
  worth knowing if you're auditing dependencies.

## Project structure

```
prisma/schema.prisma       Data model
prisma/seed.ts             Demo data generator
src/lib/mortgage.ts        Amortization math (pure, unit-tested)
src/lib/analytics.ts       Spend trends, recurring/unusual detection, FX
src/lib/import/            Statement parsers + column-mapping engine
src/app/                   Pages and API routes
src/components/            UI components (ui/ = design-system primitives)
```
