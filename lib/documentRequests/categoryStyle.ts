import {
  CreditCard,
  DollarSign,
  FileClock,
  Briefcase,
  Landmark,
  Home,
  Users,
  ReceiptText,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { IconChipTone } from "@/components/ui/IconChip";

type CategoryStyle = { icon: LucideIcon; tone: IconChipTone };

/** Keyword -> style, checked in order against the lowercased category text.
 * Categories are free text (set by whoever built the checklist), so this is
 * a best-effort match against common tax/bookkeeping checklist categories
 * rather than an exhaustive enum -- anything unmatched falls back to a
 * plain document icon. */
const CATEGORY_KEYWORDS: { keywords: string[]; style: CategoryStyle }[] = [
  { keywords: ["id", "identification", "license", "passport"], style: { icon: CreditCard, tone: "accent" } },
  { keywords: ["income", "w-2", "w2", "1099", "wage"], style: { icon: DollarSign, tone: "emerald" } },
  { keywords: ["prior", "previous year", "last year"], style: { icon: FileClock, tone: "violet" } },
  { keywords: ["business", "schedule c", "1120", "1065", "k-1", "k1"], style: { icon: Briefcase, tone: "amber" } },
  { keywords: ["bank", "financial", "statement", "1098"], style: { icon: Landmark, tone: "accent" } },
  { keywords: ["property", "mortgage", "home", "real estate"], style: { icon: Home, tone: "amber" } },
  { keywords: ["dependent", "family", "child"], style: { icon: Users, tone: "rose" } },
  { keywords: ["receipt", "expense", "deduction"], style: { icon: ReceiptText, tone: "violet" } },
];

const DEFAULT_STYLE: CategoryStyle = { icon: FileText, tone: "accent" };

export function getCategoryStyle(category: string | null | undefined): CategoryStyle {
  const normalized = category?.trim().toLowerCase();
  if (!normalized) return DEFAULT_STYLE;
  const match = CATEGORY_KEYWORDS.find((c) => c.keywords.some((k) => normalized.includes(k)));
  return match?.style ?? DEFAULT_STYLE;
}

/** Same soft-background/tone-text pairing as IconChip's internal
 * TONE_CLASSES (not exported there) -- for contexts too dense for IconChip's
 * fixed 36px size, where overriding its baked-in h-9/w-9 via className isn't
 * reliable since Tailwind's cascade order doesn't follow className string
 * order. */
export const TONE_BG_CLASSES: Record<IconChipTone, string> = {
  accent: "bg-accentSoft text-accent",
  emerald: "bg-emeraldSoft text-emerald",
  amber: "bg-amberSoft text-amber",
  violet: "bg-violetSoft text-violet",
  rose: "bg-roseSoft text-rose",
};
