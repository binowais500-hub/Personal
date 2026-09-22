"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteMortgagePaymentButton({ id }: { id: string }) {
  const router = useRouter();

  async function handleDelete() {
    await fetch(`/api/mortgage/payments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="icon" aria-label="Delete payment" onClick={handleDelete}>
      <Trash2 className="text-muted-foreground size-3.5 hover:text-destructive" />
    </Button>
  );
}
