"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type Option = { value: string; label: string };
type RoutableField = { id: string; label: string; field_type: string; options: Option[] };
type Route = { id: string; routing_field_id: string; answer_value: string; service_id: string };
type ServiceOption = { id: string; name: string };

const ROUTABLE_FIELD_TYPES = ["dropdown", "radio_button"];

export function OrganizerServiceRouting({ workspaceId, organizerTemplateId }: { workspaceId: string; organizerTemplateId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<RoutableField[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [routingFieldId, setRoutingFieldId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: fieldRows }, { data: routeRows }, { data: serviceRows }] = await Promise.all([
        supabase
          .from("organizer_fields")
          .select("id, label, field_type, options")
          .eq("organizer_template_id", organizerTemplateId)
          .in("field_type", ROUTABLE_FIELD_TYPES)
          .order("display_order"),
        supabase.from("organizer_service_routes").select("id, routing_field_id, answer_value, service_id").eq("organizer_template_id", organizerTemplateId),
        supabase.from("services").select("id, name").eq("workspace_id", workspaceId).neq("status", "archived").order("name"),
      ]);
      if (cancelled) return;
      setFields((fieldRows as unknown as RoutableField[]) ?? []);
      const routeList = (routeRows as Route[]) ?? [];
      setRoutes(routeList);
      setServices(serviceRows ?? []);
      setEnabled(routeList.length > 0);
      setRoutingFieldId(routeList[0]?.routing_field_id ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizerTemplateId, workspaceId, supabase]);

  async function setMapping(answerValue: string, serviceId: string) {
    setError(null);
    if (!serviceId) {
      const existing = routes.find((r) => r.answer_value === answerValue);
      if (existing) {
        const { error: deleteError } = await supabase.from("organizer_service_routes").delete().eq("id", existing.id);
        if (deleteError) {
          setError(deleteError.message);
          return;
        }
        setRoutes((prev) => prev.filter((r) => r.id !== existing.id));
        toast.show("Routing removed", "success");
      }
      return;
    }
    const { data, error: upsertError } = await supabase
      .from("organizer_service_routes")
      .upsert(
        { workspace_id: workspaceId, organizer_template_id: organizerTemplateId, routing_field_id: routingFieldId, answer_value: answerValue, service_id: serviceId },
        { onConflict: "organizer_template_id,answer_value" }
      )
      .select("id, routing_field_id, answer_value, service_id")
      .single();
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setRoutes((prev) => [...prev.filter((r) => r.answer_value !== answerValue), data as Route]);
    toast.show("Routing saved", "success");
  }

  async function turnOff() {
    if (!window.confirm("Stop routing this form to more than one service? The service it connects to will go back to the single one set above.")) return;
    const { error: deleteError } = await supabase.from("organizer_service_routes").delete().eq("organizer_template_id", organizerTemplateId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRoutes([]);
    setRoutingFieldId("");
    setEnabled(false);
    toast.show("Routing turned off", "success");
  }

  async function chooseRoutingField(fieldId: string) {
    if (routes.length > 0 && fieldId !== routingFieldId) {
      if (!window.confirm("Changing the deciding question clears the service mappings you already set up for this form. Continue?")) return;
      const { error: deleteError } = await supabase.from("organizer_service_routes").delete().eq("organizer_template_id", organizerTemplateId);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setRoutes([]);
    }
    setRoutingFieldId(fieldId);
  }

  if (loading) return null;

  const routingField = fields.find((f) => f.id === routingFieldId);

  return (
    <div className="rounded-lg border border-border bg-surfaceMuted p-3">
      <label className="flex items-start gap-2 text-sm font-medium text-slate">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => (e.target.checked ? setEnabled(true) : turnOff())}
          disabled={fields.length === 0}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        This form collects information for more than one service
      </label>
      <p className="mt-1 text-xs text-muted">
        e.g. one intake form that covers both an individual return (1040) and a business return (1120).
        {fields.length === 0 && " This form has no dropdown or multiple-choice question to route on -- add one to use this."}
      </p>

      {enabled && fields.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Which question decides the service?
            <select
              value={routingFieldId}
              onChange={(e) => chooseRoutingField(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>
                Choose a question
              </option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {routingField && (
            <div className="space-y-2">
              <p className="text-xs text-muted">If they answer &quot;{routingField.label}&quot; as:</p>
              {(routingField.options ?? []).map((o) => {
                const currentServiceId = routes.find((r) => r.answer_value === o.value)?.service_id ?? "";
                return (
                  <div key={o.value} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 truncate text-slate">&quot;{o.label}&quot;</span>
                    <span className="text-muted">→</span>
                    <select
                      value={currentServiceId}
                      onChange={(e) => setMapping(o.value, e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="">Not linked to a service</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
