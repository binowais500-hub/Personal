import { isAiConfigured } from "@/lib/ai/client";
import { FinanceChat } from "@/components/finance-chat";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Ask my finances"
        description="Questions are answered from local calculations — Claude explains the numbers, it never sees your raw transactions."
      />
      <FinanceChat configured={isAiConfigured()} />
    </div>
  );
}
