import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Use at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const settings = await db.appSettings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    return NextResponse.json({ error: "No password set up yet" }, { status: 409 });
  }

  const valid = await verifyPassword(parsed.data.currentPassword, settings.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.appSettings.update({ where: { id: "singleton" }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
