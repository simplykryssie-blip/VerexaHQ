import { z } from "zod";

// public.lead_status, verbatim from generated types — never invent a value.
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "consultation_scheduled",
  "consultation_completed",
  "proposal_sent",
  "won",
  "lost",
  "do_not_contact",
] as const;

export const LEAD_STATUS_LABELS: Record<(typeof LEAD_STATUSES)[number], string> = {
  new: "New",
  contacted: "Contacted",
  consultation_scheduled: "Consultation scheduled",
  consultation_completed: "Consultation completed",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
  do_not_contact: "Do not contact",
};

export const leadSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  source: z.string().optional().or(z.literal("")),
  serviceInterest: z.string().optional().or(z.literal("")),
  status: z.enum(LEAD_STATUSES),
  notes: z.string().optional().or(z.literal("")),
  consultationAt: z.string().optional().or(z.literal("")),
});
export type LeadInput = z.infer<typeof leadSchema>;
