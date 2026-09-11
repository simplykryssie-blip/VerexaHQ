import {
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Calendar,
  ToggleLeft,
  List,
  CircleDot,
  ListChecks,
  CheckSquare,
  ShieldAlert,
  Building2,
  PenTool,
  Upload,
  Heading1,
  Pilcrow,
  Layers,
  SeparatorHorizontal,
  type LucideIcon,
} from "lucide-react";
import { FIELD_TYPE_GROUPS, type OrganizerFieldType } from "./fieldTypes";
import type { IconChipTone } from "@/components/ui/IconChip";

/** One icon per field type, for the palette and placed field blocks --
 * purely visual, keyed to the same vocabulary as FIELD_TYPE_LABELS. */
export const FIELD_TYPE_ICONS: Record<OrganizerFieldType, LucideIcon> = {
  name: User,
  email: Mail,
  phone: Phone,
  website: Globe,
  address: MapPin,
  short_text: Type,
  paragraph: AlignLeft,
  number: Hash,
  currency: DollarSign,
  date: Calendar,
  yes_no: ToggleLeft,
  dropdown: List,
  radio_button: CircleDot,
  multiple_choice: ListChecks,
  checkbox: CheckSquare,
  ssn: ShieldAlert,
  ein: Building2,
  signature: PenTool,
  file_upload: Upload,
  section: Heading1,
  rich_text: Pilcrow,
  repeating_section: Layers,
  page_break: SeparatorHorizontal,
};

/** One categorical color per palette group -- matches the group labels in
 * FIELD_TYPE_GROUPS exactly. Only 5 tones exist (IconChipTone); Structure
 * reuses "accent" rather than introducing a 6th. */
export const FIELD_TYPE_GROUP_TONE: Record<string, IconChipTone> = {
  "Name & contact": "accent",
  Text: "emerald",
  Choice: "violet",
  Sensitive: "rose",
  Upload: "amber",
  Structure: "accent",
};

/** Per-type tone, derived from the group each type belongs to -- lets
 * FieldCanvas look up a tone straight from a field's type without knowing
 * which group it came from. */
export const FIELD_TYPE_TONE: Record<OrganizerFieldType, IconChipTone> = Object.fromEntries(
  FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.type, FIELD_TYPE_GROUP_TONE[g.group]]))
) as Record<OrganizerFieldType, IconChipTone>;
