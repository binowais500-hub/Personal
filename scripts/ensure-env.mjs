// Ensures a local .env exists with a DATABASE_URL and a random SESSION_SECRET
// before Next.js, the Prisma CLI, and edge middleware start up. Runs as predev/prebuild.
// Uses .env (not .env.local) so the Prisma CLI picks it up too.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");

let lines = [];
if (existsSync(envPath)) {
  lines = readFileSync(envPath, "utf8").split("\n").filter(Boolean);
}

const has = (key) => lines.some((l) => l.startsWith(`${key}=`));

if (!has("DATABASE_URL")) {
  lines.push(`DATABASE_URL="file:./dev.db"`);
}

if (!has("SESSION_SECRET")) {
  const secret = randomBytes(32).toString("hex");
  lines.push(`SESSION_SECRET=${secret}`);
  console.log("Generated a new SESSION_SECRET in .env");
}

writeFileSync(envPath, lines.join("\n") + "\n");
