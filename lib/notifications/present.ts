export type NotificationRow = {
  id: string;
  event_type: string | null;
  template_key: string;
  payload: unknown;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};

type Payload = Record<string, unknown>;

function str(payload: Payload, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

const TITLES: Record<string, (p: Payload) => string> = {
  invoice_due: (p) => `Invoice ${str(p, "invoice_number")} is due soon`,
  funds_received_reminder: (p) => `Confirm funds received -- Invoice ${str(p, "invoice_number")}`,
  workflow_stage_due: (p) => `Stage "${str(p, "stage_name")}" is due soon`,
  appointment_reminder: (p) => `Reminder: ${str(p, "title", "Appointment")}`,
  subscription_renewal_reminder: () => "Your Verexa subscription renews soon",
  plan_price_change: (p) => `Your plan price is changing${p.effective_date ? ` on ${str(p, "effective_date")}` : ""}`,
  payment_receipt: (p) => `Payment received -- Invoice ${str(p, "invoice_number")}`,
  signature_due: (p) => `${str(p, "document_title", "A document")} needs a signature`,
  ENGAGEMENT_ASSIGNED: (p) => `You were assigned engagement ${str(p, "engagement_number")}`,
  ENGAGEMENT_WAITING_ON_REVIEW: (p) => `Engagement ${str(p, "engagement_number")} is waiting on your review`,
  ENGAGEMENT_SHARE_APPROVED: () => "Your engagement share was approved",
  ENGAGEMENT_SHARE_REJECTED: () => "Your engagement share was rejected",
  ENGAGEMENT_SHARE_CORRECTIONS_REQUESTED: () => "Corrections were requested on your engagement share",
  ORGANIZER_SUBMITTED: (p) => {
    const client = str(p, "client_name").trim();
    const organizer = str(p, "organizer_template_name", "an organizer");
    return client ? `${client} submitted ${organizer}` : `${organizer} was submitted`;
  },
  DOCUMENT_REQUEST_COMPLETED: (p) => {
    const client = str(p, "client_name").trim();
    const title = str(p, "request_title", "a document request");
    return client ? `${client} completed "${title}"` : `"${title}" was completed`;
  },
  ORGANIZER_REVIEWED: (p) => {
    const client = str(p, "client_name", "A client").trim() || "A client";
    const status = str(p, "review_status", "reviewed");
    return `${client}'s organizer was ${status.toLowerCase()}`;
  },
  ORGANIZER_INFORMATION_RESPONDED: (p) => {
    const client = str(p, "client_name", "A client").trim() || "A client";
    const count = str(p, "item_count");
    const n = Number(count);
    const questionWord = n === 1 ? "question" : "questions";
    return count ? `${client} responded to ${count} flagged ${questionWord}` : `${client} responded to flagged questions on their organizer`;
  },
  ORGANIZER_ERO_REVIEW_REQUESTED: (p) => {
    const client = str(p, "client_name", "A client").trim() || "A client";
    return `${client}'s organizer was sent to you for ERO review`;
  },
  PAYMENT_RECEIVED: (p) => {
    const client = str(p, "client_name", "A client").trim() || "A client";
    const amount = str(p, "amount");
    return amount ? `${client} paid $${amount}` : `A payment was received from ${client}`;
  },
  INVOICE_PAID: (p) => {
    const client = str(p, "client_name", "A client").trim() || "A client";
    const invoiceNumber = str(p, "invoice_number");
    return invoiceNumber ? `Invoice ${invoiceNumber} for ${client} is fully paid` : `${client}'s invoice is fully paid`;
  },
  APPOINTMENT_BOOKED_ONLINE: (p) => {
    const client = str(p, "client_name", "A client").trim() || "A client";
    const title = str(p, "appointment_title", "an appointment");
    return `${client} booked ${title}`;
  },
  automation: (p) => {
    const message = str(p, "message").trim();
    if (message) return message;
    const client = str(p, "client_name").trim();
    return client ? `Update on ${client}` : "You have a new automation update";
  },
};

// Types with no entity_id but a sensible fixed destination.
const STATIC_LINKS: Record<string, string> = {
  appointment_reminder: "/calendar",
};

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "engagement") return `/engagements/${entityId}`;
  if (entityType === "client") return `/clients/${entityId}`;
  if (entityType === "automation") return `/workflows/${entityId}`;
  if (entityType === "organizer_response") return `/organizers/${entityId}/review`;
  return null;
}

export function presentNotification(n: NotificationRow): { title: string; href: string | null } {
  const key = n.event_type ?? n.template_key;
  const payload = (n.payload ?? {}) as Payload;
  const titleFn = TITLES[key];
  const title = titleFn ? titleFn(payload) : key.replace(/_/g, " ");
  const href = entityHref(n.entity_type, n.entity_id) ?? STATIC_LINKS[key] ?? null;
  return { title, href };
}
