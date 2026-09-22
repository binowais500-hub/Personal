import Link from "next/link";
import { Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export function NoMortgageSetup() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="pt-6">
        <EmptyState
          icon={Landmark}
          title="No mortgage set up yet"
          description="Add your loan terms first — principal, rate, and tenor — and everything else is calculated from there."
          action={
            <Link href="/mortgage">
              <Button>Set up mortgage</Button>
            </Link>
          }
        />
      </CardContent>
    </Card>
  );
}
