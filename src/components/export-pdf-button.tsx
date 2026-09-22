"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportPdfButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Printer className="size-4" /> Export / print
    </Button>
  );
}
