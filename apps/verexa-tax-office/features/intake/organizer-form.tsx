"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, CheckCircle2, MessageCircleWarning, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import { friendlyDbError } from "@/lib/errors";
import {
  isVisible,
  sectionAddButtonLabel,
  sectionDefaultVisible,
  sectionEntityType,
  sectionIsStaffOnly,
  isHouseholdSection,
  computeProgressPercent,
  type FormSectionRow,
  type FormFieldRow,
  type FormConditionRow,
} from "@/lib/intake/engine";
import { evaluateCalculation } from "@/lib/intake/calculation";
import { splitHouseholdPersonUpdate, householdPersonDisplayName } from "@/lib/intake/household-fields";
import { FieldInput, FieldLabel } from "@/features/intake/field-input";
import type { Tables } from "@/types/database";

type AnswerRow = Tables<"intake_answers">;
type HouseholdRow = Tables<"intake_household_people">;
type EntityRow = Tables<"intake_repeatable_entities">;
type CommentRow = Tables<"intake_review_comments">;
type CalculationRow = Tables<"form_calculations">;

export function OrganizerForm({
  submissionId,
  workspaceId,
  status,
  sections,
  fields,
  conditions,
  calculations = [],
  initialAnswers,
  initialHouseholdPeople,
  initialEntities,
  clarifications = [],
  readOnly = false,
  hideStaffOnly = false,
}: {
  submissionId: string;
  workspaceId: string;
  status: string;
  sections: FormSectionRow[];
  fields: FormFieldRow[];
  conditions: FormConditionRow[];
  calculations?: CalculationRow[];
  initialAnswers: AnswerRow[];
  initialHouseholdPeople: HouseholdRow[];
  initialEntities: EntityRow[];
  clarifications?: CommentRow[];
  readOnly?: boolean;
  hideStaffOnly?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<{ code: string; message: string }[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const map: Record<string, unknown> = {};
    for (const a of initialAnswers) map[a.field_key] = a.answer_value;
    return map;
  });
  const [answerIds, setAnswerIds] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) map[a.field_key] = a.id;
    return map;
  });
  const [household, setHousehold] = useState<HouseholdRow[]>(initialHouseholdPeople);
  const [entities, setEntities] = useState<EntityRow[]>(initialEntities);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fieldsBySection = useMemo(() => {
    const map = new Map<string, FormFieldRow[]>();
    for (const f of fields) {
      const list = map.get(f.section_id ?? "") ?? [];
      list.push(f);
      map.set(f.section_id ?? "", list);
    }
    Array.from(map.values()).forEach((list) => list.sort((a, b) => a.sort_order - b.sort_order));
    return map;
  }, [fields]);

  const fieldsByKey = useMemo(() => {
    const map = new Map<string, FormFieldRow>();
    for (const f of fields) map.set(f.field_key, f);
    return map;
  }, [fields]);

  const calculationsByField = useMemo(() => {
    const map = new Map<string, CalculationRow>();
    for (const c of calculations) map.set(c.target_field_id, c);
    return map;
  }, [calculations]);

  const clarificationsByField = useMemo(() => {
    const map = new Map<string, CommentRow[]>();
    for (const c of clarifications) {
      if (!c.field_id) continue;
      const list = map.get(c.field_id) ?? [];
      list.push(c);
      map.set(c.field_id, list);
    }
    return map;
  }, [clarifications]);

  const orderedSections = useMemo(() => [...sections].sort((a, b) => a.sort_order - b.sort_order), [sections]);

  function scheduleSave(key: string, fn: () => Promise<void>) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fn();
        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("error");
        toast.error(friendlyDbError(err instanceof Error ? err.message : undefined));
      }
    }, 700);
  }

  function handleAnswerChange(field: FormFieldRow, value: unknown) {
    setAnswers((prev) => ({ ...prev, [field.field_key]: value }));
    scheduleSave(`answer:${field.id}`, async () => {
      const existingId = answerIds[field.field_key];
      if (existingId) {
        const { error } = await supabase.from("intake_answers").update({ answer_value: value as never, updated_at: new Date().toISOString() }).eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("intake_answers")
          .insert({
            submission_id: submissionId,
            workspace_id: workspaceId,
            field_id: field.id,
            field_key: field.field_key,
            answer_value: value as never,
            source: readOnly ? "staff" : "portal",
          })
          .select("id")
          .single();
        if (error) throw error;
        if (data) setAnswerIds((prev) => ({ ...prev, [field.field_key]: data.id }));
      }
    });
  }

  async function addHouseholdPerson() {
    const { data, error } = await supabase
      .from("intake_household_people")
      .insert({ submission_id: submissionId, workspace_id: workspaceId, person_role: "dependent", sort_order: household.length })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    setHousehold((prev) => [...prev, data]);
  }

  function updateHouseholdField(personId: string, fieldKey: string, value: unknown) {
    setHousehold((prev) =>
      prev.map((p) => {
        if (p.id !== personId) return p;
        const mapped = splitHouseholdPersonUpdate(fieldKey, value);
        if (mapped) return { ...p, [mapped.column]: mapped.value } as HouseholdRow;
        return { ...p, details: { ...(p.details as Record<string, unknown>), [fieldKey]: value } } as HouseholdRow;
      }),
    );
    scheduleSave(`household:${personId}:${fieldKey}`, async () => {
      const mapped = splitHouseholdPersonUpdate(fieldKey, value);
      const current = household.find((p) => p.id === personId);
      const patch = mapped
        ? { [mapped.column]: mapped.value }
        : { details: { ...((current?.details as Record<string, unknown>) ?? {}), [fieldKey]: value } };
      const { error } = await supabase
        .from("intake_household_people")
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq("id", personId);
      if (error) throw error;
    });
  }

  async function removeHouseholdPerson(personId: string) {
    setHousehold((prev) => prev.filter((p) => p.id !== personId));
    const { error } = await supabase.from("intake_household_people").delete().eq("id", personId);
    if (error) toast.error(friendlyDbError(error.message));
  }

  async function addEntity(section: FormSectionRow) {
    const entityType = sectionEntityType(section);
    if (!entityType) return;
    const list = entities.filter((e) => e.entity_type === entityType);
    const { data, error } = await supabase
      .from("intake_repeatable_entities")
      .insert({ submission_id: submissionId, workspace_id: workspaceId, entity_type: entityType as never, sort_order: list.length, data: {} })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    setEntities((prev) => [...prev, data]);
  }

  function updateEntityField(entityId: string, fieldKey: string, value: unknown) {
    setEntities((prev) =>
      prev.map((e) => (e.id === entityId ? ({ ...e, data: { ...(e.data as Record<string, unknown>), [fieldKey]: value } } as EntityRow) : e)),
    );
    scheduleSave(`entity:${entityId}:${fieldKey}`, async () => {
      const current = entities.find((e) => e.id === entityId);
      const nextData = { ...((current?.data as Record<string, unknown>) ?? {}), [fieldKey]: value };
      const { error } = await supabase
        .from("intake_repeatable_entities")
        .update({ data: nextData, updated_at: new Date().toISOString() } as never)
        .eq("id", entityId);
      if (error) throw error;
    });
  }

  async function toggleEntityComplete(entityId: string, complete: boolean) {
    setEntities((prev) => prev.map((e) => (e.id === entityId ? { ...e, is_complete: complete } : e)));
    const { error } = await supabase.from("intake_repeatable_entities").update({ is_complete: complete }).eq("id", entityId);
    if (error) toast.error(friendlyDbError(error.message));
  }

  async function removeEntity(entityId: string) {
    setEntities((prev) => prev.filter((e) => e.id !== entityId));
    const { error } = await supabase.from("intake_repeatable_entities").delete().eq("id", entityId);
    if (error) toast.error(friendlyDbError(error.message));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitErrors(null);
    const { data, error } = await supabase.rpc("submit_intake", { p_submission_id: submissionId });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    const result = data as { valid?: boolean; errors?: { code: string; message: string }[] } | null;
    if (result && result.valid === false) {
      setSubmitErrors(result.errors ?? [{ code: "invalid", message: "This organizer has unresolved issues. Fix them and try again." }]);
      toast.error("Couldn't submit — see the issues below.");
      return;
    }
    toast.success("Organizer submitted");
    router.refresh();
  }

  // Global values used for section/field visibility conditions — top-level
  // answers only; conditions authored against fields inside a repeatable
  // section are evaluated per-instance below instead.
  const globalValues = answers;

  let visibleRequiredKeys: string[] = [];
  const answeredKeys = new Set(Object.keys(answers).filter((k) => answers[k] !== null && answers[k] !== undefined && answers[k] !== ""));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground h-4">
        {saveStatus === "saving" && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </>
        )}
        {saveStatus === "saved" && (
          <>
            <CheckCircle2 className="h-3 w-3 text-brand" /> Saved
          </>
        )}
        {saveStatus === "error" && <span className="text-destructive">Couldn&apos;t save — check your connection.</span>}
      </div>

      {orderedSections.map((section) => {
        if (hideStaffOnly && sectionIsStaffOnly(section)) return null;
        const sectionFields = fieldsBySection.get(section.id) ?? [];
        const visible =
          sectionDefaultVisible(section) && isVisible(conditions, globalValues, fieldsByKey, { sectionId: section.id });
        if (!visible) return null;

        for (const f of sectionFields) {
          if (f.is_required && !["heading", "paragraph", "divider"].includes(f.component_type)) visibleRequiredKeys.push(f.field_key);
        }

        const entityType = sectionEntityType(section);
        const isHousehold = isHouseholdSection(section);

        if (entityType && section.is_repeatable) {
          const sectionEntities = entities.filter((e) => e.entity_type === entityType);
          return (
            <RepeatableSectionCard
              key={section.id}
              title={section.title}
              description={section.description}
              addLabel={sectionAddButtonLabel(section)}
              readOnly={readOnly}
              onAdd={() => addEntity(section)}
              count={sectionEntities.length}
            >
              {sectionEntities.map((entity, idx) => (
                <EntityCard key={entity.id} index={idx} onRemove={() => removeEntity(entity.id)} readOnly={readOnly}>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Checkbox checked={entity.is_complete} disabled={readOnly} onCheckedChange={(v) => toggleEntityComplete(entity.id, v === true)} />
                    Mark this entry complete
                  </label>
                  <FieldGrid
                    fields={sectionFields}
                    conditions={conditions}
                    fieldsByKey={fieldsByKey}
                    calculationsByField={calculationsByField}
                    values={{ ...(entity.data as Record<string, unknown>), ...globalValues }}
                    clarificationsByField={clarificationsByField}
                    onChange={(field, value) => updateEntityField(entity.id, field.field_key, value)}
                    readOnly={readOnly}
                    hideStaffOnly={hideStaffOnly}
                  />
                </EntityCard>
              ))}
            </RepeatableSectionCard>
          );
        }

        if (isHousehold && section.is_repeatable) {
          return (
            <RepeatableSectionCard
              key={section.id}
              title={section.title}
              description={section.description}
              addLabel={sectionAddButtonLabel(section)}
              readOnly={readOnly}
              onAdd={addHouseholdPerson}
              count={household.length}
            >
              {household.map((person, idx) => (
                <EntityCard key={person.id} index={idx} onRemove={() => removeHouseholdPerson(person.id)} readOnly={readOnly} title={householdPersonDisplayName(person)}>
                  <FieldGrid
                    fields={sectionFields}
                    conditions={conditions}
                    fieldsByKey={fieldsByKey}
                    calculationsByField={calculationsByField}
                    values={{ ...(person.details as Record<string, unknown>), ...householdValuesFromColumns(person), ...globalValues }}
                    clarificationsByField={clarificationsByField}
                    onChange={(field, value) => updateHouseholdField(person.id, field.field_key, value)}
                    readOnly={readOnly}
                    hideStaffOnly={hideStaffOnly}
                  />
                </EntityCard>
              ))}
            </RepeatableSectionCard>
          );
        }

        return (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
              {section.description && <CardDescription>{section.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <FieldGrid
                fields={sectionFields}
                conditions={conditions}
                fieldsByKey={fieldsByKey}
                calculationsByField={calculationsByField}
                values={globalValues}
                clarificationsByField={clarificationsByField}
                onChange={handleAnswerChange}
                readOnly={readOnly}
                hideStaffOnly={hideStaffOnly}
              />
            </CardContent>
          </Card>
        );
      })}

      {!readOnly && ["not_started", "in_progress", "changes_requested"].includes(status) && (
        <div className="space-y-2">
          {submitErrors && submitErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-0.5">
                  {submitErrors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <Button type="button" variant="brand" disabled={submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Submit organizer
          </Button>
        </div>
      )}

      <ProgressFooter visibleRequiredKeys={visibleRequiredKeys} answeredKeys={answeredKeys} />
    </div>
  );
}

function householdValuesFromColumns(person: HouseholdRow): Record<string, unknown> {
  return {
    dependent_full_name: [person.first_name, person.last_name].filter(Boolean).join(" "),
    dependent_dob: person.date_of_birth,
    dependent_ssn_last4: person.ssn_last4,
    dependent_relationship: person.relationship,
    dependent_months_lived_with_you: person.months_in_home,
    dependent_student: person.is_student,
    dependent_disabled: person.is_disabled,
    dependent_identity_pin: person.identity_pin_last4,
  };
}

function FieldGrid({
  fields,
  conditions,
  fieldsByKey,
  calculationsByField,
  values,
  clarificationsByField,
  onChange,
  readOnly,
  hideStaffOnly,
}: {
  fields: FormFieldRow[];
  conditions: FormConditionRow[];
  fieldsByKey: Map<string, FormFieldRow>;
  calculationsByField: Map<string, CalculationRow>;
  values: Record<string, unknown>;
  clarificationsByField: Map<string, CommentRow[]>;
  onChange: (field: FormFieldRow, value: unknown) => void;
  readOnly: boolean;
  hideStaffOnly: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((field) => {
        if (hideStaffOnly && field.is_staff_only) return null;
        const visible = isVisible(conditions, values, fieldsByKey, { fieldId: field.id });
        if (!visible) return null;
        const isDisplayOnly = ["heading", "paragraph", "divider"].includes(field.component_type);
        const openClarifications = (clarificationsByField.get(field.id) ?? []).filter((c) => !c.resolved_at);

        let value = values[field.field_key];
        if (field.component_type === "calculation") {
          const calc = calculationsByField.get(field.id);
          if (calc) value = evaluateCalculation(calc.expression, values, calc.rounding_scale ?? null);
        }

        return (
          <div key={field.id} className={isDisplayOnly ? "sm:col-span-2" : ""}>
            <FieldLabel field={field} />
            <div className="mt-1">
              <FieldInput field={field} value={value} onChange={(v) => onChange(field, v)} disabled={readOnly || field.is_locked} />
            </div>
            {field.help_text && <p className="text-xs text-muted-foreground mt-1">{field.help_text}</p>}
            {openClarifications.map((c) => (
              <div key={c.id} className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                <MessageCircleWarning className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{c.comment}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function RepeatableSectionCard({
  title,
  description,
  addLabel,
  onAdd,
  count,
  readOnly,
  children,
}: {
  title: string;
  description?: string | null;
  addLabel: string;
  onAdd: () => void;
  count: number;
  readOnly: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {count === 0 ? <p className="text-sm text-muted-foreground">Nothing added yet.</p> : children}
      </CardContent>
    </Card>
  );
}

function EntityCard({
  index,
  title,
  onRemove,
  readOnly,
  children,
}: {
  index: number;
  title?: string;
  onRemove: () => void;
  readOnly: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{title ?? `#${index + 1}`}</Badge>
        {!readOnly && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

function ProgressFooter({ visibleRequiredKeys, answeredKeys }: { visibleRequiredKeys: string[]; answeredKeys: Set<string> }) {
  const percent = computeProgressPercent({ visibleRequiredFieldKeys: visibleRequiredKeys, answeredFieldKeys: answeredKeys });
  return (
    <div className="sticky bottom-0 rounded-lg border border-border bg-card p-3 flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-brand-gradient" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-24 text-right">{percent}% of required fields answered</span>
    </div>
  );
}
