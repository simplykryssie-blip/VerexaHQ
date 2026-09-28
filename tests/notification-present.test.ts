import { describe, expect, it } from "vitest";
import { presentNotification, type NotificationRow } from "@/lib/notifications/present";

function row(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    id: "n1",
    event_type: null,
    template_key: "public_lead_created",
    payload: {},
    entity_type: "client",
    entity_id: "c1",
    workspace_id: "ws1",
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

describe("presentNotification", () => {
  it("marks a captured-but-unfinished lead as incomplete, by client name", () => {
    const { title } = presentNotification(
      row({ event_type: "PUBLIC_LEAD_CREATED", payload: { client_id: "c1", client_name: "Shavondali Cawthorne" } })
    );
    expect(title).toBe("Shavondali Cawthorne Lead - Form Incomplete");
  });

  it("falls back gracefully when a lead-created notification has no client name yet", () => {
    const { title } = presentNotification(row({ event_type: "PUBLIC_LEAD_CREATED", payload: { client_id: "c1" } }));
    expect(title).toBe("New lead -- form incomplete");
  });

  it("says a form was completed, naming both the client and the form, once actually submitted", () => {
    const { title } = presentNotification(
      row({
        event_type: "ORGANIZER_SUBMITTED",
        payload: { client_id: "c1", client_name: "Shavondali Cawthorne", organizer_template_name: "QuickBooks Setup Consultation" },
      })
    );
    expect(title).toBe("Shavondali Cawthorne completed QuickBooks Setup Consultation");
  });
});
