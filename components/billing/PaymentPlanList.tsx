import { PaymentLinkButton } from "@/components/PaymentLinkButton";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export type PaymentPlanRow = { id: string; installment_number: number; amount: number; due_date: string; status: string };

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "accent",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};

export function PaymentPlanList({ plans, showPayLink = true }: { plans: PaymentPlanRow[]; showPayLink?: boolean }) {
  if (plans.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
      {plans
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((p) => (
          <li key={p.id} className="flex items-center justify-between text-xs">
            <span className="text-slate">
              Installment {p.installment_number} -- ${p.amount.toFixed(2)} due {new Date(p.due_date).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="capitalize">
                {p.status}
              </Badge>
              {showPayLink && p.status === "pending" && <PaymentLinkButton paymentPlanId={p.id} />}
            </span>
          </li>
        ))}
    </ul>
  );
}
