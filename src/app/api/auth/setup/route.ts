import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

const bodySchema = z.object({
  password: z.string().min(8, "Use at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const existing = await db.appSettings.findUnique({ where: { id: "singleton" } });
  if (existing) {
    return NextResponse.json({ error: "Password already set" }, { status: 409 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.appSettings.create({ data: { id: "singleton", passwordHash } });

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
