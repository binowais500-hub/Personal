"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Tags } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not change password");
        return;
      }
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Password, categories, and your data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Protects this app on this machine. Nothing is sent anywhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label>Current password</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>New password</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
            </div>
            <Button type="submit" disabled={saving} className="self-start">
              {saving ? "Saving…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories & rules</CardTitle>
          <CardDescription>Manage spending categories and the merchant rules that auto-categorize transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/cards/categories">
            <Button variant="outline">
              <Tags className="size-4" /> Manage categories
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Everything lives in a local SQLite file (<code>prisma/dev.db</code>). Download a full backup as JSON any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/api/export" download>
            <Button variant="outline">
              <Download className="size-4" /> Download backup
            </Button>
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currency</CardTitle>
          <CardDescription>All amounts are tracked in AED, with the original currency shown for foreign transactions.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
