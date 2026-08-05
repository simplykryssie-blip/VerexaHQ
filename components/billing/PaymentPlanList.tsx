import { PaymentLinkButton } from "@/components/PaymentLinkButton";

export type PaymentPlanRow = { id: string; installment_number: number; amount: number; due_date: string; status: string };

const STATUS_STYLE: Record<string, string> = {
  pending: "text-accent",
  paid: "text-green-700",
  overdue: "text-danger",
  cancelled: "text-muted",
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
              <span className={`capitalize font-medium ${STATUS_STYLE[p.status] ?? "text-muted"}`}>{p.status}</span>
              {showPayLink && p.status === "pending" && <PaymentLinkButton paymentPlanId={p.id} />}
            </span>
          </li>
        ))}
    </ul>
  );
}
