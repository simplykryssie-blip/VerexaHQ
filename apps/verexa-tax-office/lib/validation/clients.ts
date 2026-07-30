import { z } from "zod";

// public.client_type, verbatim from generated types.
export const CLIENT_TYPES = ["individual", "business", "household", "organization"] as const;
export const CLIENT_TYPE_LABELS: Record<(typeof CLIENT_TYPES)[number], string> = {
  individual: "Individual",
  business: "Business",
  household: "Household",
  organization: "Organization",
};

// public.contact_method
export const CONTACT_METHODS = ["email", "phone", "sms", "address", "other"] as const;

// clients.status has no DB check constraint (plain text), but this
// project's own client_status enum documents the intended value set —
// used here as the UI convention rather than inventing new ones.
export const CLIENT_STATUSES = ["lead", "active", "inactive", "archived"] as const;
export const CLIENT_STATUS_LABELS: Record<(typeof CLIENT_STATUSES)[number], string> = {
  lead: "Lead",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export const clientSchema = z.object({
  clientType: z.enum(CLIENT_TYPES),
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  personalEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  personalPhone: z.string().optional().or(z.literal("")),
  businessEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  businessPhone: z.string().optional().or(z.literal("")),
  preferredContactMethod: z.enum(CONTACT_METHODS).optional(),
  preferredLanguage: z.string().optional().or(z.literal("")),
  dateOfBirth: z.string().optional().or(z.literal("")),
  ssnLast4: z
    .string()
    .regex(/^\d{4}$/, "Must be exactly 4 digits")
    .optional()
    .or(z.literal("")),
  einLast4: z
    .string()
    .regex(/^\d{4}$/, "Must be exactly 4 digits")
    .optional()
    .or(z.literal("")),
  source: z.string().optional().or(z.literal("")),
  status: z.enum(CLIENT_STATUSES),
  notes: z.string().optional().or(z.literal("")),
});
export type ClientInput = z.infer<typeof clientSchema>;
