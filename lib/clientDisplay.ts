import type { Client } from "@/lib/types";

export function clientDisplayName(
  c: Pick<Client, "client_type" | "business_name" | "first_name" | "last_name"> &
    Partial<Pick<Client, "account_name">>
) {
  if (c.account_name && c.account_name.trim()) return c.account_name;
  return c.client_type === "business" && c.business_name
    ? c.business_name
    : `${c.first_name} ${c.last_name}`.trim();
}

export function clientInitials(
  c: Pick<Client, "client_type" | "business_name" | "first_name" | "last_name"> &
    Partial<Pick<Client, "account_name">>
) {
  const name = clientDisplayName(c);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ACCOUNT_TYPE_META: Record<string, { label: string; badge: string }> = {
  individual: { label: "Individual", badge: "bg-sky-50 text-sky-700" },
  household: { label: "Household", badge: "bg-violet-50 text-violet-700" },
  business: { label: "Business", badge: "bg-emerald-50 text-[#108A64]" },
  trust: { label: "Trust", badge: "bg-amber-50 text-amber-700" },
  estate: { label: "Estate", badge: "bg-amber-50 text-amber-700" },
  nonprofit: { label: "Nonprofit", badge: "bg-teal-50 text-teal-700" },
  other: { label: "Other", badge: "bg-slate-100 text-slate-600" },
};

export function accountTypeMeta(accountType: string | null | undefined) {
  return ACCOUNT_TYPE_META[accountType ?? ""] ?? { label: accountType || "—", badge: "bg-slate-100 text-slate-600" };
}
