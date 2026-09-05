"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageCircleWarning, Paperclip, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { answerToString as answerToStringByType, normalizeOptions, parseAddressValue, parseNameValue } from "@/lib/organizer/formatValue";
import { AddressInput } from "@/components/AddressInput";
import { NameInput } from "@/components/NameInput";
import { parseConditionalLogic, shouldShowField } from "@/lib/organizer/conditionalLogic";
import { splitIntoPages } from "@/lib/organizer/pages";
import { formatPhone } from "@/lib/phone";
import { fieldColSpanClass } from "@/lib/organizer/layoutWidth";
import { RichTextEditor } from "@/components/settings/RichTextEditor";
import { OrganizerPrintSummary } from "@/components/portal/OrganizerPrintSummary";
import { SignaturePad } from "@/components/SignaturePad";
import type { Json } from "@/lib/database.types";

const YES_NO_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

type FieldRow = {
  id: string;
  field_type: string;
  label: string;
  help_text: string | null;
  body_html?: string | null;
  is_required: boolean;
  options: unknown;
  parent_field_id: string | null;
  conditional_logic?: unknown;
  client_profile_field?: string | null;
  layout_width?: string | null;
};

type AnswerRow = { organizer_field_id: string; value: unknown; instance_index?: number };

export type InfoRequestItemRow = {
  id: string;
  organizer_field_id: string;
  instance_index: number;
  note: string | null;
  status: "pending" | "client_responded" | "rejected";
  was_answered_when_flagged: boolean;
  decision_note: string | null;
};

function isFieldAnswered(field: FieldRow, value: string, repeaterRowCount?: number): boolean {
  if (field.field_type === "repeating_section") return (repeaterRowCount ?? 0) > 0;
  return value.trim() !== "";
}

// Mirrors OrganizerForm's own answerFromString, but keyed directly off a
// field_type instead of the id->type map that only exists in that closure --
// FieldInput already has field.field_type on hand wherever it needs this.
function toOrganizerJsonValue(fieldType: string, value: string): Json {
  if (fieldType === "signature" || fieldType === "file_upload" || fieldType === "name" || fieldType === "address") {
    try {
      return JSON.parse(value) as Json;
    } catch {
      return value;
    }
  }
  return value;
}

export function OrganizerForm({
  responseId,
  templateName,
  fields,
  initialAnswers,
  readOnly,
  workspaceId,
  entityType,
  entityId,
  infoRequestItems = [],
}: {
  responseId: string;
  templateName: string;
  fields: FieldRow[];
  initialAnswers: AnswerRow[];
  readOnly: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
  infoRequestItems?: InfoRequestItemRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  // Keyed by "<field id>:<instance index>" so a flagged field stays
  // actionable (and shows the preparer's note) even while the rest of an
  // already-submitted organizer is otherwise read-only -- this is the only
  // way a client can respond once the response has moved past
  // not_started/in_progress, since that's what the RLS on
  // organizer_response_answers/organizer_responses locks down at that point.
  const infoItemsByKey = new Map(infoRequestItems.map((i) => [`${i.organizer_field_id}:${i.instance_index}`, i]));
  // Items the client can still act on -- client_responded is already sent
  // and awaiting the preparer's decision, so it's excluded from both the
  // "still needs an answer" validation and the batch submit below.
  const actionableInfoItems = infoRequestItems.filter((i) => i.status === "pending" || i.status === "rejected");
  const fieldLabelById = new Map(fields.map((f) => [f.id, f.label]));

  const repeaterFields = fields.filter((f) => f.field_type === "repeating_section" && !f.parent_field_id);
  const childFieldsByParent = new Map(repeaterFields.map((r) => [r.id, fields.filter((f) => f.parent_field_id === r.id)]));
  const repeaterChildIds = new Set(repeaterFields.flatMap((r) => (childFieldsByParent.get(r.id) ?? []).map((c) => c.id)));
  const childToParentId = new Map(repeaterFields.flatMap((r) => (childFieldsByParent.get(r.id) ?? []).map((c) => [c.id, r.id])));

  const fieldTypeById = new Map(fields.map((f) => [f.id, f.field_type]));
  // Delegates address/name/phone to the shared helper; signature and
  // file_upload keep a JSON-encoded string in local state (see
  // PublicSignatureField / the file_upload uploader) so a stored value can
  // come back either as that same string (legacy double-encoded rows) or as
  // a real object (once saveAll stops double-encoding) -- normalize both to
  // the string shape the rest of this component expects.
  const answerToString = (fieldId: string, value: unknown): string => {
    const type = fieldTypeById.get(fieldId);
    if (type === "signature" || type === "file_upload") {
      return typeof value === "string" ? value : JSON.stringify(value);
    }
    return answerToStringByType(type, value);
  };
  // Inverse of the above, applied right before an answer is written back to
  // the jsonb answer column so signature/file_upload/name/address values are
  // stored as real objects, not a JSON string nested inside jsonb.
  // name/address fall back to a plain string on parse failure, matching
  // parseNameValue/parseAddressValue's own graceful handling of legacy
  // pre-structured plain-text answers.
  const answerFromString = (fieldId: string, value: string): Json => {
    const type = fieldTypeById.get(fieldId);
    if (type === "signature" || type === "file_upload" || type === "name" || type === "address") {
      try {
        return JSON.parse(value) as Json;
      } catch {
        return value;
      }
    }
    return value;
  };

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      if (repeaterChildIds.has(a.organizer_field_id)) continue;
      if (a.value !== null && a.value !== undefined) map[a.organizer_field_id] = answerToString(a.organizer_field_id, a.value);
    }
    return map;
  });
  const [repeaterRows, setRepeaterRows] = useState<Record<string, Record<string, string>[]>>(() => {
    const result: Record<string, Record<string, string>[]> = {};
    for (const repeater of repeaterFields) {
      const childIds = new Set((childFieldsByParent.get(repeater.id) ?? []).map((c) => c.id));
      const relevant = initialAnswers.filter((a) => childIds.has(a.organizer_field_id));
      const maxInstance = relevant.reduce((max, a) => Math.max(max, a.instance_index ?? 0), -1);
      const rows: Record<string, string>[] = [];
      for (let i = 0; i <= maxInstance; i++) {
        const row: Record<string, string> = {};
        for (const a of relevant) {
          if ((a.instance_index ?? 0) === i && a.value !== null && a.value !== undefined) {
            row[a.organizer_field_id] = answerToString(a.organizer_field_id, a.value);
          }
        }
        rows.push(row);
      }
      result[repeater.id] = rows;
    }
    return result;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submittingFlags, setSubmittingFlags] = useState(false);
  const [justSubmittedFlags, setJustSubmittedFlags] = useState(false);

  // A lightweight local draft, separate from the real save/submit RPCs --
  // typing into a flagged field only updates React state until "Submit
  // changes" is clicked, so without this a refresh (accidental, or from
  // impatience during a slow submit) would silently wipe everything not
  // yet sent. Restored once on mount rather than in the useState
  // initializer since localStorage isn't available during SSR.
  const draftKey = `verexa-organizer-draft:${responseId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        answers?: Record<string, string>;
        repeaterRows?: Record<string, Record<string, string>[]>;
      };
      if (draft.answers) setAnswers((prev) => ({ ...prev, ...draft.answers }));
      if (draft.repeaterRows) setRepeaterRows((prev) => ({ ...prev, ...draft.repeaterRows }));
    } catch {
      // Best-effort -- a missing/corrupt draft just means nothing to restore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ answers, repeaterRows }));
    } catch {
      // Best-effort -- storage full or unavailable (private browsing) just
      // means no draft safety net, not something to surface to the client.
    }
  }, [answers, repeaterRows, draftKey]);
  // Discourages navigating away mid-batch -- each item in the loop below is
  // its own RPC call, so leaving partway through is what produced the
  // "some answers reverted" report: everything before the interruption was
  // already saved for good, everything after it was still only in memory.
  useEffect(() => {
    if (!submittingFlags) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [submittingFlags]);

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Best-effort, same as above.
    }
  }

  // Snapshot of every flagged field's value exactly as the page loaded --
  // never updated after mount. Used only to tell "the client typed a real
  // answer/correction" apart from "this is just what was already there" for
  // the checklist and submit-changes validation below; a live answers/
  // repeaterRows read would give the same value for both cases.
  const [initialAnswerSnapshot] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const a of initialAnswers) {
      const key = `${a.organizer_field_id}:${a.instance_index ?? 0}`;
      map.set(key, a.value !== null && a.value !== undefined ? answerToString(a.organizer_field_id, a.value) : "");
    }
    return map;
  });

  function currentValueFor(fieldId: string, instanceIndex: number): string {
    if (repeaterChildIds.has(fieldId)) {
      const parentId = childToParentId.get(fieldId);
      return (parentId && repeaterRows[parentId]?.[instanceIndex]?.[fieldId]) ?? "";
    }
    return answers[fieldId] ?? "";
  }

  // "Answered" for a flagged item means the client has actually typed
  // something different from what was there when the page loaded -- for a
  // previously-blank field any non-empty value qualifies; for a correction
  // to an already-answered field, retyping the same value doesn't count as
  // having reviewed it.
  function isLocallyAnswered(item: InfoRequestItemRow): boolean {
    const current = currentValueFor(item.organizer_field_id, item.instance_index);
    const initial = initialAnswerSnapshot.get(`${item.organizer_field_id}:${item.instance_index}`) ?? "";
    return current.trim() !== "" && current !== initial;
  }

  async function submitFlaggedChanges() {
    const unanswered = actionableInfoItems.filter((item) => !isLocallyAnswered(item));
    const unansweredDynamic = dynamicRequiredFields.filter((f) => !(answers[f.id] ?? "").trim());
    if (unanswered.length > 0 || unansweredDynamic.length > 0) {
      const labels = [
        ...unanswered.map((i) => fieldLabelById.get(i.organizer_field_id) ?? "a flagged question"),
        ...unansweredDynamic.map((f) => f.label),
      ];
      toast.show(`Please answer: ${labels.join(", ")}`, "error");
      return;
    }
    setSubmittingFlags(true);
    try {
      for (const item of actionableInfoItems) {
        const value = currentValueFor(item.organizer_field_id, item.instance_index);
        const fieldType = fieldTypeById.get(item.organizer_field_id) ?? "short_text";
        const jsonValue = toOrganizerJsonValue(fieldType, value);
        const { error } = item.was_answered_when_flagged
          ? await supabase.rpc("propose_organizer_answer_correction", { p_item_id: item.id, p_proposed_value: jsonValue })
          : await supabase.rpc("save_organizer_reopened_field_answer", { p_item_id: item.id, p_value: jsonValue });
        if (error) {
          toast.show(error.message, "error");
          return;
        }
      }
      // Required fields a flagged answer revealed but that were never
      // themselves flagged by staff -- no info-request item exists for
      // these yet, so they go through their own RPC that creates one.
      for (const field of dynamicRequiredFields) {
        const value = answers[field.id] ?? "";
        const jsonValue = toOrganizerJsonValue(field.field_type, value);
        const { error } = await supabase.rpc("save_organizer_dynamic_required_answer", {
          p_response_id: responseId,
          p_organizer_field_id: field.id,
          p_value: jsonValue,
        });
        if (error) {
          toast.show(error.message, "error");
          return;
        }
      }
      // Best-effort and deliberately not awaited into the same try block --
      // the client's answers are already safely saved above regardless of
      // whether staff actually gets told about them, so a notification
      // failure here must never surface as "your submission failed".
      supabase
        .rpc("notify_staff_organizer_information_responded", {
          p_response_id: responseId,
          p_item_count: actionableInfoItems.length + dynamicRequiredFields.length,
        })
        .then(({ error }) => {
          if (error) console.error("notify_staff_organizer_information_responded failed:", error.message);
        });
      clearDraft();
      setJustSubmittedFlags(true);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not submit -- please try again.", "error");
    } finally {
      setSubmittingFlags(false);
    }
  }

  async function saveAnswer(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  // Wrapped in try/finally so an unexpected throw (a network failure, or a
  // parse error out of parseAddressValue/parseNameValue on unusual input)
  // can never leave `saving` stuck true -- previously that left the Save
  // button spinning forever with no toast, since setSaving(false) was only
  // reached on the normal-completion and clean-.error paths.
  async function saveAll(): Promise<boolean> {
    setSaving(true);
    try {
      const rows = Object.entries(answers).map(([organizer_field_id, value]) => ({
        organizer_response_id: responseId,
        organizer_field_id,
        value: answerFromString(organizer_field_id, value),
        instance_index: 0,
      }));

      for (const repeater of repeaterFields) {
        const children = childFieldsByParent.get(repeater.id) ?? [];
        const repRows = repeaterRows[repeater.id] ?? [];
        for (const child of children) {
          // Clear out any rows beyond the current count (e.g. a dependent was
          // removed) so stale answers don't linger under a dropped instance.
          const { error: deleteError } = await supabase
            .from("organizer_response_answers")
            .delete()
            .eq("organizer_response_id", responseId)
            .eq("organizer_field_id", child.id)
            .gte("instance_index", repRows.length);
          if (deleteError) {
            toast.show(deleteError.message, "error");
            return false;
          }
          repRows.forEach((row, i) => {
            if (row[child.id] !== undefined) {
              rows.push({
                organizer_response_id: responseId,
                organizer_field_id: child.id,
                value: answerFromString(child.id, row[child.id]),
                instance_index: i,
              });
            }
          });
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from("organizer_response_answers")
          .upsert(rows, { onConflict: "organizer_response_id,organizer_field_id,instance_index" });
        if (error) {
          toast.show(error.message, "error");
          return false;
        }
      }

      // Fields the builder tagged as "prefill from client profile" propose
      // their current value back to the client record -- applied immediately
      // if the client record has nothing there yet, otherwise queued for
      // staff approval. Repeater children are never mapped (a repeating
      // section can't correspond to a single client-record field). Errors
      // here are surfaced but non-fatal to the save itself -- the answers
      // above are already safely stored regardless.
      for (const field of fields) {
        if (!field.client_profile_field || repeaterChildIds.has(field.id)) continue;
        const value = answers[field.id];
        if (!value) continue;

        const result =
          field.client_profile_field === "mailing_address"
            ? await (() => {
                const parts = parseAddressValue(value);
                return supabase.rpc("propose_client_mailing_address", {
                  p_street: parts.street,
                  p_city: parts.city,
                  p_state: parts.state,
                  p_zip: parts.zip,
                  p_organizer_response_id: responseId,
                  p_organizer_field_id: field.id,
                });
              })()
            : field.client_profile_field === "full_name"
              ? await (() => {
                  const parts = parseNameValue(value);
                  return supabase.rpc("propose_client_full_name", {
                    p_first_name: parts.first,
                    p_middle_name: parts.middle,
                    p_last_name: parts.last,
                    p_suffix: parts.suffix,
                    p_organizer_response_id: responseId,
                    p_organizer_field_id: field.id,
                  });
                })()
              : field.client_profile_field === "date_of_birth"
                ? await supabase.rpc("propose_client_date_of_birth", {
                    p_new_value: value,
                    p_organizer_response_id: responseId,
                    p_organizer_field_id: field.id,
                  })
                : field.client_profile_field === "ssn"
                  ? await supabase.rpc("propose_client_sensitive_field", {
                      p_field: "ssn",
                      p_new_value: value,
                      p_organizer_response_id: responseId,
                      p_organizer_field_id: field.id,
                    })
                  : await supabase.rpc("propose_client_contact_field", {
                      p_field: field.client_profile_field,
                      p_new_value: value,
                      p_organizer_response_id: responseId,
                      p_organizer_field_id: field.id,
                    });
        if (result.error) toast.show(result.error.message, "error");
      }

      toast.show("Progress saved", "success");
      router.refresh();
      return true;
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not save -- please try again.", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    const saved = await saveAll();
    if (!saved) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_organizer_response", { p_response_id: responseId });
      if (error) {
        toast.show(error.message, "error");
        return;
      }
      fetch("/api/documents/file-organizer-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      }).catch(() => {
        // Best-effort -- the submission itself is already recorded; filing
        // it into Documents can be retried later if this fails.
      });
      fetch("/api/documents/sync-organizer-document-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      }).catch(() => {
        // Best-effort, same reasoning -- the VA can still see the raw
        // organizer answers even if this auto-checklist sync fails.
      });
      // A toast alone was easy to miss -- nothing on screen told the client
      // their organizer actually went through. This blocks on an explicit
      // "OK" instead, then sends them back to the dashboard rather than
      // leaving them looking at the (now read-only) form they just finished.
      clearDraft();
      setJustSubmitted(true);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not submit -- please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function backToDashboard() {
    router.push("/portal/dashboard");
    router.refresh();
  }

  // A staff-flagged question stays visible even when its own conditional
  // logic would otherwise hide it -- that's the entire point of being able
  // to flag a conditionally-hidden question (see ReviewWorkspace). The
  // condition it depends on may not evaluate true yet: a correction that
  // would flip it is only ever a *proposed* value until approved (see
  // propose_organizer_answer_correction -- it never touches
  // organizer_response_answers), so gating visibility on the live
  // conditional-logic result would hide the very question the client
  // needs to answer to make that correction land.
  const topLevelFields = fields
    .filter((f) => !f.parent_field_id)
    .filter((f) => infoItemsByKey.has(`${f.id}:0`) || shouldShowField(parseConditionalLogic(f.conditional_logic), answers));
  // Required fields that are only visible/required because of how a
  // flagged field was answered -- staff never flagged these directly (no
  // organizer_information_request_items row exists for them), but they
  // still need an answer before the client's corrections can be
  // considered complete. Gated on infoRequestItems (not actionableInfoItems)
  // -- the underlying information request stays open, and the RPC below
  // still has somewhere to attach a new item, for as long as ANY item on
  // it is non-terminal (pending/client_responded/rejected), even after
  // every originally-flagged question has been answered. Gating on
  // actionableInfoItems instead cut this off the moment the last flagged
  // question was answered, right when answering it could reveal yet
  // another conditional-required field -- exactly the case this exists
  // for. "Unanswered when the page loaded" is what marks a field as
  // belonging here rather than being pre-existing content nothing asked
  // the client to touch.
  const dynamicRequiredFields =
    infoRequestItems.length > 0
      ? topLevelFields.filter((f) => {
          if (!f.is_required) return false;
          if (infoItemsByKey.has(`${f.id}:0`)) return false;
          return (initialAnswerSnapshot.get(`${f.id}:0`) ?? "") === "";
        })
      : [];
  const dynamicRequiredFieldIds = new Set(dynamicRequiredFields.map((f) => f.id));
  const pages = splitIntoPages(topLevelFields);
  const currentIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentIndex];
  const isLastPage = currentIndex === pages.length - 1;

  function unmetRequiredOnCurrentPage(): FieldRow[] {
    return currentPage.fields.filter(
      (f) => f.is_required && !isFieldAnswered(f, answers[f.id] ?? "", repeaterRows[f.id]?.length)
    );
  }

  function goNext() {
    const unmet = unmetRequiredOnCurrentPage();
    if (unmet.length > 0) {
      toast.show(`Please answer: ${unmet.map((f) => f.label).join(", ")}`, "error");
      return;
    }
    setPageIndex((i) => Math.min(pages.length - 1, i + 1));
  }

  function submitWithValidation() {
    const unmet = unmetRequiredOnCurrentPage();
    if (unmet.length > 0) {
      toast.show(`Please answer: ${unmet.map((f) => f.label).join(", ")}`, "error");
      return;
    }
    submit();
  }

  return (
    <div className="space-y-4">
      {justSubmitted && (
        <Modal title="Organizer submitted" onClose={backToDashboard}>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
            <p className="text-sm text-slate">
              Your organizer has been submitted. Your firm has been notified and will review your answers.
            </p>
            <button
              type="button"
              onClick={backToDashboard}
              className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              OK
            </button>
          </div>
        </Modal>
      )}
      {justSubmittedFlags && (
        <Modal title="Response submitted" onClose={backToDashboard}>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
            <p className="text-sm text-slate">Your responses have been submitted. Your preparer will review them.</p>
            <button
              type="button"
              onClick={backToDashboard}
              className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              OK
            </button>
          </div>
        </Modal>
      )}
      {readOnly && (infoRequestItems.length > 0 || dynamicRequiredFields.length > 0) && (
        <div className="mb-6 rounded-2xl border border-border bg-surface p-4 print:hidden">
          <p className="text-sm font-semibold text-ink">Flagged questions</p>
          <p className="mt-0.5 text-xs text-muted">
            {actionableInfoItems.length === 0 && dynamicRequiredFields.length === 0
              ? "All caught up -- nothing left for you to answer here."
              : `${
                  actionableInfoItems.filter(isLocallyAnswered).length +
                  dynamicRequiredFields.filter((f) => (answers[f.id] ?? "").trim()).length
                } of ${actionableInfoItems.length + dynamicRequiredFields.length} answered`}
          </p>
          <ul className="mt-3 space-y-2">
            {infoRequestItems.map((item) => {
              const label = fieldLabelById.get(item.organizer_field_id) ?? "Question";
              const done = item.status === "client_responded" || isLocallyAnswered(item);
              return (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  {done ? (
                    <CheckCircle2
                      size={16}
                      className={`mt-0.5 shrink-0 ${item.status === "client_responded" ? "text-muted" : "text-success"}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                  )}
                  <span className={done ? "text-muted line-through decoration-border" : "text-slate"}>{label}</span>
                  {item.status === "client_responded" && <span className="text-xs text-muted">(waiting for review)</span>}
                </li>
              );
            })}
            {dynamicRequiredFields.map((field) => {
              const done = Boolean((answers[field.id] ?? "").trim());
              return (
                <li key={field.id} className="flex items-start gap-2 text-sm">
                  {done ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                  )}
                  <span className={done ? "text-muted line-through decoration-border" : "text-slate"}>{field.label}</span>
                  {!done && <span className="text-xs text-muted">(now required)</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {readOnly && (
        <OrganizerPrintSummary
          templateName={templateName}
          topLevelFields={topLevelFields}
          childrenByParent={childFieldsByParent}
          answers={answers}
          repeaterRows={repeaterRows}
        />
      )}
      <div className="print:hidden">
        {pages.length > 1 && (
          <p className="mb-4 text-xs font-medium text-muted">
            Page {currentIndex + 1} of {pages.length}
            {currentPage.title ? ` -- ${currentPage.title}` : ""}
          </p>
        )}
        <div className="@container grid grid-cols-12 gap-x-5 gap-y-6">
        {currentPage.fields.map((field) =>
          field.field_type === "repeating_section" ? (
            <RepeatingSectionInput
              key={field.id}
              field={field}
              childFields={childFieldsByParent.get(field.id) ?? []}
              rows={repeaterRows[field.id] ?? []}
              onChange={(rows) => setRepeaterRows((prev) => ({ ...prev, [field.id]: rows }))}
              disabled={readOnly}
              workspaceId={workspaceId}
              entityType={entityType}
              entityId={entityId}
              responseId={responseId}
              infoItemsByKey={infoItemsByKey}
            />
          ) : (
            <FieldInput
              key={field.id}
              field={field}
              value={answers[field.id] ?? ""}
              onChange={saveAnswer}
              disabled={readOnly}
              workspaceId={workspaceId}
              entityType={entityType}
              entityId={entityId}
              responseId={responseId}
              infoRequestItem={infoItemsByKey.get(`${field.id}:0`)}
              dynamicRequired={dynamicRequiredFieldIds.has(field.id)}
            />
          )
        )}
        </div>
      </div>

      {pages.length > 1 && (
        <div className="flex items-center gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Back
          </button>
          {!isLastPage && (
            <button
              type="button"
              // Once submitted, there's no "unmet required field" left to
              // block on -- readOnly navigation just pages through freely so
              // a flagged field on a later page is actually reachable.
              onClick={() => (readOnly ? setPageIndex((i) => Math.min(pages.length - 1, i + 1)) : goNext())}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent"
            >
              Next
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || submitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save progress"}
          </button>
          {(pages.length === 1 || isLastPage) && (
            <button
              type="button"
              onClick={submitWithValidation}
              disabled={saving || submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit organizer"}
            </button>
          )}
        </div>
      )}

      {readOnly && (actionableInfoItems.length > 0 || dynamicRequiredFields.length > 0) && (pages.length === 1 || isLastPage) && (
        <div className="flex items-center gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={submitFlaggedChanges}
            disabled={submittingFlags}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {submittingFlags ? "Submitting..." : "Submit changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function RepeatingSectionInput({
  field,
  childFields,
  rows,
  onChange,
  disabled,
  workspaceId,
  entityType,
  entityId,
  responseId,
  infoItemsByKey,
}: {
  field: FieldRow;
  childFields: FieldRow[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
  disabled: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
  responseId: string;
  infoItemsByKey: Map<string, InfoRequestItemRow>;
}) {
  function updateRow(index: number, childFieldId: string, value: string) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [childFieldId]: value } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="col-span-12 rounded-2xl border border-border bg-surfaceMuted/60 p-5">
      <label className="block text-sm font-semibold text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-3 space-y-3">
        {rows.length === 0 && <p className="text-xs text-muted">None added yet.</p>}
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {field.label} {index + 1}
              </p>
              {!disabled && (
                <button type="button" onClick={() => removeRow(index)} className="text-xs font-medium text-danger hover:underline">
                  Remove
                </button>
              )}
            </div>
            <div className="@container mt-3 grid grid-cols-12 gap-x-4 gap-y-4">
              {childFields
                .filter(
                  (child) =>
                    shouldShowField(parseConditionalLogic(child.conditional_logic), row) || infoItemsByKey.has(`${child.id}:${index}`)
                )
                .map((child) => (
                  <FieldInput
                    key={child.id}
                    field={child}
                    value={row[child.id] ?? ""}
                    onChange={(fieldId, value) => updateRow(index, fieldId, value)}
                    disabled={disabled}
                    workspaceId={workspaceId}
                    entityType={entityType}
                    entityId={entityId}
                    responseId={responseId}
                    infoRequestItem={infoItemsByKey.get(`${child.id}:${index}`)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {!disabled && (
        <button type="button" onClick={() => onChange([...rows, {}])} className="mt-3 text-xs font-semibold text-accent hover:underline">
          + Add another
        </button>
      )}
    </div>
  );
}

function FileUploadField({
  fieldId,
  value,
  onChange,
  disabled,
  workspaceId,
  entityType,
  entityId,
}: {
  fieldId: string;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  let parsed: { attachment_id: string; file_name: string } | null = null;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }

  async function handleFile(file: File) {
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = `${workspaceId}/${entityId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("client-documents").upload(path, file);
    if (uploadError) {
      setUploading(false);
      toast.show(uploadError.message, "error");
      return;
    }
    const { data: attachment, error: insertError } = await supabase
      .from("attachments")
      .insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        uploaded_by: user?.id,
        visibility: "client_visible",
      })
      .select("id")
      .single();
    setUploading(false);
    if (insertError || !attachment) {
      toast.show(insertError?.message ?? "Could not save the upload.", "error");
      return;
    }
    onChange(fieldId, JSON.stringify({ attachment_id: attachment.id, file_name: file.name }));
    toast.show("File uploaded", "success");
  }

  if (parsed) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Paperclip size={14} className="text-muted" aria-hidden="true" />
        <span className="text-slate">{parsed.file_name}</span>
        {!disabled && (
          <label className="cursor-pointer text-xs font-medium text-accent hover:underline">
            Replace
            <input
              type="file"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <label className={`flex w-fit items-center gap-1.5 text-sm font-medium ${disabled ? "text-muted" : "cursor-pointer text-accent hover:underline"}`}>
      <Paperclip size={14} aria-hidden="true" />
      {uploading ? "Uploading..." : "Upload file"}
      {!disabled && (
        <input type="file" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      )}
    </label>
  );
}

// No client-side Storage RLS insert here either -- goes through
// /api/portal/organizer/[id]/signature-image (service role) instead, same
// reasoning as the public organizer form's PublicSignatureField.
function SignatureField({
  responseId,
  fieldId,
  value,
  onChange,
  disabled,
}: {
  responseId: string;
  fieldId: string;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
}) {
  const [typedName, setTypedName] = useState("");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let parsed: { typed_name?: string; signature_image_path?: string; signed_at: string } | null = null;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }

  if (parsed) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-green-700">
        <PenLine size={14} aria-hidden="true" />
        {parsed.typed_name ? `Signed by ${parsed.typed_name}` : "Signed (drawn signature)"} on{" "}
        {new Date(parsed.signed_at).toLocaleDateString()}
      </p>
    );
  }

  if (disabled) {
    return <p className="text-xs text-muted">Not signed.</p>;
  }

  async function sign() {
    if (!typedName.trim() || !drawnDataUrl) return;
    setError(null);

    setUploading(true);
    const res = await fetch(`/api/portal/organizer/${responseId}/signature-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: drawnDataUrl }),
    });
    const result = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(result.error ?? "Could not save your signature.");
      return;
    }
    onChange(fieldId, JSON.stringify({ typed_name: typedName.trim(), signature_image_path: result.path, signed_at: new Date().toISOString() }));
  }

  return (
    <div className="space-y-2">
      <SignaturePad typedName={typedName} onTypedNameChange={setTypedName} onDrawnChange={setDrawnDataUrl} typedLabel="Type your full name" />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="button"
        onClick={sign}
        disabled={uploading || !typedName.trim() || !drawnDataUrl}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {uploading ? "Saving..." : "Sign"}
      </button>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled: disabledProp,
  workspaceId,
  entityType,
  entityId,
  responseId,
  infoRequestItem,
  dynamicRequired,
}: {
  field: FieldRow;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
  responseId: string;
  infoRequestItem?: InfoRequestItemRow;
  dynamicRequired?: boolean;
}) {
  // A flagged field stays editable (and shows the preparer's note) even
  // when the rest of the organizer is otherwise locked -- see the
  // infoItemsByKey comment in OrganizerForm for why. Once the client has
  // submitted a response (status=client_responded) it goes back to
  // disabled until the preparer approves or rejects it. Saving/submitting
  // happens once, for every flagged field at once, via OrganizerForm's
  // "Submit changes" button -- not per field here. dynamicRequired is the
  // same idea for a field that only became required because of how a
  // flagged field was answered -- staff never flagged it directly.
  const isActionable = infoRequestItem?.status === "pending" || infoRequestItem?.status === "rejected";
  const disabled = isActionable || dynamicRequired ? false : disabledProp;
  const needsAnswer = (isActionable || dynamicRequired) && !value.trim();

  const infoPanel = infoRequestItem ? (
    <div
      className={`mt-2 rounded-xl border p-3 ${
        infoRequestItem.status === "client_responded" ? "border-border bg-surfaceMuted" : "border-danger/40 bg-danger/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <MessageCircleWarning size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">Your preparer flagged this question</p>
          {infoRequestItem.note && <p className="mt-0.5 text-xs text-slate">{infoRequestItem.note}</p>}
          {infoRequestItem.status === "rejected" && infoRequestItem.decision_note && (
            <p className="mt-1 text-xs text-danger">Sent back: {infoRequestItem.decision_note}</p>
          )}
          {infoRequestItem.status === "client_responded" ? (
            <p className="mt-1.5 text-xs text-muted">Submitted -- waiting for your preparer to review it.</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">
              {value.trim() ? "Answered -- included when you submit your changes." : "Answer this, then use \"Submit changes\" below."}
            </p>
          )}
        </div>
      </div>
    </div>
  ) : dynamicRequired ? (
    <div className="mt-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
      <div className="flex items-start gap-2">
        <MessageCircleWarning size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">Now required based on your updated answer</p>
          <p className="mt-1.5 text-xs text-muted">
            {value.trim() ? "Answered -- included when you submit your changes." : "Answer this, then use \"Submit changes\" below."}
          </p>
        </div>
      </div>
    </div>
  ) : null;

  const options = normalizeOptions(field.options);
  const inputClass =
    "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-surfaceMuted disabled:text-muted";

  if (field.field_type === "section") {
    return (
      <div className="col-span-12 border-l-[3px] border-accent py-1 pl-3.5">
        <h3 className="text-lg font-semibold text-ink">{field.label}</h3>
        {field.help_text && <p className="mt-0.5 text-sm text-muted">{field.help_text}</p>}
      </div>
    );
  }
  if (field.field_type === "rich_text") {
    return (
      <div className="col-span-12">
        <RichTextEditor content={field.body_html ?? ""} editable={false} bare />
      </div>
    );
  }

  const showHeader = !(field.field_type === "checkbox" && !field.label.trim());

  return (
    <div className={fieldColSpanClass(field.field_type, field.layout_width)}>
      {showHeader && (
        <>
          <label
            htmlFor={`field-${field.id}`}
            className={`block text-sm font-semibold ${needsAnswer ? "text-danger" : "text-ink"}`}
          >
            {field.label} {field.is_required && <span className="text-danger">*</span>}
          </label>
          {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}
        </>
      )}

      <div className={`${showHeader ? "mt-1.5" : ""} ${needsAnswer ? "rounded-xl ring-2 ring-danger/60" : ""}`}>
        {field.field_type === "name" ? (
          <NameInput value={value} onChange={(v) => onChange(field.id, v)} disabled={disabled} />
        ) : field.field_type === "email" ? (
          <input
            id={`field-${field.id}`}
            type="email"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "phone" ? (
          <input
            id={`field-${field.id}`}
            type="tel"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, formatPhone(e.target.value))}
            className={inputClass}
          />
        ) : field.field_type === "website" ? (
          <input
            id={`field-${field.id}`}
            type="url"
            value={value}
            disabled={disabled}
            placeholder="https://"
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "yes_no" ? (
          <div className="flex gap-4">
            {YES_NO_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-slate">
                <input
                  type="radio"
                  name={`field-${field.id}`}
                  checked={value === o.value}
                  disabled={disabled}
                  onChange={() => onChange(field.id, o.value)}
                  className="h-4 w-4 border-border text-accent focus:ring-accent"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : field.field_type === "file_upload" ? (
          <FileUploadField
            fieldId={field.id}
            value={value}
            onChange={onChange}
            disabled={disabled}
            workspaceId={workspaceId}
            entityType={entityType}
            entityId={entityId}
          />
        ) : field.field_type === "signature" ? (
          <SignatureField responseId={responseId} fieldId={field.id} value={value} onChange={onChange} disabled={disabled} />
        ) : field.field_type === "dropdown" ? (
          <select
            id={`field-${field.id}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          >
            <option value="">Select...</option>
            {options.map((o, i) => (
              <option key={i} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : field.field_type === "radio_button" ? (
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-slate">
                <input
                  type="radio"
                  name={`field-${field.id}`}
                  checked={value === o.value}
                  disabled={disabled}
                  onChange={() => onChange(field.id, o.value)}
                  className="h-4 w-4 border-border text-accent focus:ring-accent"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : field.field_type === "multiple_choice" || field.field_type === "checkbox" ? (
          <div className="space-y-1.5">
            {options.map((o, i) => {
              const selected = value ? value.split(",") : [];
              return (
                <label key={i} className="flex items-center gap-2 text-sm text-slate">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value);
                      onChange(field.id, next.join(","));
                    }}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        ) : field.field_type === "date" ? (
          <input
            id={`field-${field.id}`}
            type="date"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "number" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "currency" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            step="0.01"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "ssn" || field.field_type === "ein" ? (
          <input
            id={`field-${field.id}`}
            type="text"
            inputMode="numeric"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.field_type === "ssn" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
            className={inputClass}
          />
        ) : field.field_type === "address" ? (
          <AddressInput value={value} onChange={(v) => onChange(field.id, v)} disabled={disabled} />
        ) : field.field_type === "short_text" ? (
          <input
            id={`field-${field.id}`}
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : (
          <textarea
            id={`field-${field.id}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            rows={3}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            className={`${inputClass} resize-none overflow-hidden`}
          />
        )}
      </div>
      {infoPanel}
    </div>
  );
}

