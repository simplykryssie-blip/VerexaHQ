"use client";

import { useState } from "react";
import { Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeOptions } from "@/lib/organizer/formatValue";
import { AddressInput } from "@/components/AddressInput";
import { parseConditionalLogic, shouldShowField } from "@/lib/organizer/conditionalLogic";
import { splitIntoPages } from "@/lib/organizer/pages";
import { formatPhone } from "@/lib/phone";
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from "@/lib/passwordStrength";

type FieldRow = {
  id: string;
  field_type: string;
  label: string;
  help_text: string | null;
  is_required: boolean;
  options: unknown;
  parent_field_id: string | null;
  conditional_logic?: unknown;
  client_profile_field?: string | null;
};

type Branding = {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  support_email: string | null;
  support_phone: string | null;
} | null;

type TemplateData = {
  template: { id: string; name: string; description: string | null };
  workspace_name: string;
  requires_portal_signup: boolean;
  branding?: Branding;
  fields: FieldRow[];
};

// Standalone from OrganizerForm.tsx on purpose: that component persists
// progress incrementally against an already-created organizer_responses row
// (responseId) and uploads files to authenticated Storage. Here there's no
// response row (and no session) until the single atomic submit succeeds, and
// file uploads aren't possible pre-authentication -- different enough of a
// lifecycle that sharing the component would mean threading a lot of
// "is this the public flow?" branches through it instead.
export function PublicOrganizerForm({ token, data }: { token: string; data: TemplateData }) {
  const supabase = createClient();
  const { template, workspace_name, requires_portal_signup, branding, fields } = data;
  const accentColor = branding?.secondary_color || branding?.primary_color || undefined;

  const repeaterFields = fields.filter((f) => f.field_type === "repeating_section" && !f.parent_field_id);
  const childFieldsByParent = new Map(repeaterFields.map((r) => [r.id, fields.filter((f) => f.parent_field_id === r.id)]));
  const topLevelFields = fields.filter((f) => !f.parent_field_id);

  const [step, setStep] = useState<"contact" | "form" | "done">("contact");
  const [pageIndex, setPageIndex] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [repeaterRows, setRepeaterRows] = useState<Record<string, Record<string, string>[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);

  const visibleTopLevelFields = topLevelFields.filter((f) => shouldShowField(parseConditionalLogic(f.conditional_logic), answers));
  const pages = splitIntoPages(visibleTopLevelFields);
  const currentIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentIndex];
  const isLastPage = currentIndex === pages.length - 1;

  function setAnswer(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function submit() {
    if (!firstName.trim() || !email.trim()) {
      setError("Name and email are required.");
      setStep("contact");
      return;
    }
    setSubmitting(true);
    setError(null);

    const rows = Object.entries(answers).map(([field_id, value]) => ({ field_id, value, instance_index: 0 }));
    for (const repeater of repeaterFields) {
      const children = childFieldsByParent.get(repeater.id) ?? [];
      const repRows = repeaterRows[repeater.id] ?? [];
      for (const child of children) {
        repRows.forEach((row, i) => {
          if (row[child.id] !== undefined) rows.push({ field_id: child.id, value: row[child.id], instance_index: i });
        });
      }
    }

    if (requires_portal_signup) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/portal/dashboard")}`,
          data: { first_name: firstName.trim(), last_name: lastName.trim() || null },
        },
      });
      if (signUpError || !signUpData.user) {
        setSubmitting(false);
        setError(signUpError?.message ?? "Could not create your account.");
        return;
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc("submit_public_organizer_response_with_signup", {
        p_token: token,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_email: email.trim(),
        p_phone: phone.trim(),
        p_answers: rows,
        p_auth_user_id: signUpData.user.id,
      });
      setSubmitting(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      const responseId = (rpcData as { response_id?: string } | null)?.response_id;
      if (responseId) {
        fetch("/api/documents/file-organizer-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responseId }),
        }).catch(() => {});
      }
      setAccountCreated(true);
      setStep("done");
      return;
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("submit_public_organizer_response", {
      p_token: token,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_email: email.trim(),
      p_phone: phone.trim(),
      p_answers: rows,
    });

    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const responseId = (rpcData as { response_id?: string } | null)?.response_id;
    if (responseId) {
      fetch("/api/documents/file-organizer-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      }).catch(() => {
        // Best-effort -- the submission itself is already recorded; filing
        // it into Documents can be retried later if this fails.
      });
    }
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Thank you</h1>
        {accountCreated ? (
          <p className="mt-2 text-sm text-muted">
            Your information was submitted to {workspace_name}. Check your email at {email} to confirm your new client portal account, then log
            in to see your progress.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Your information was submitted to {workspace_name}. They&apos;ll be in touch soon.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-8">
      <div>
        {branding?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, per-workspace logo URL; not part of the Next.js image pipeline.
          <img src={branding.logo_url} alt={workspace_name} className="mb-3 h-12 w-auto object-contain" />
        ) : (
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{workspace_name}</p>
        )}
        <h1 className="text-lg font-semibold text-ink">{template.name}</h1>
        <div className="mt-1 h-0.5 w-10 rounded-full" style={{ backgroundColor: accentColor || "currentColor" }} />
        {template.description && <p className="mt-2 whitespace-pre-line text-sm text-muted">{template.description}</p>}
        {(branding?.support_phone || branding?.support_email) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate">
            {branding.support_phone && (
              <a href={`tel:${branding.support_phone}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                <Phone size={13} aria-hidden="true" /> {branding.support_phone}
              </a>
            )}
            {branding.support_email && (
              <a href={`mailto:${branding.support_email}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                <Mail size={13} aria-hidden="true" /> {branding.support_email}
              </a>
            )}
          </div>
        )}
      </div>

      {step === "contact" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">First name *</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            {requires_portal_signup && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ink">Create a password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="mt-1 text-xs text-muted">{PASSWORD_REQUIREMENTS_HINT}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink">Confirm password *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </>
            )}
          </div>
          {requires_portal_signup && (
            <p className="mt-2 text-xs text-muted">
              This form requires a free client portal account so you can track your progress -- it&apos;s created automatically when you continue.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => {
              if (!firstName.trim() || !email.trim()) {
                setError("Name and email are required.");
                return;
              }
              if (requires_portal_signup) {
                const strengthError = validatePasswordStrength(password);
                if (strengthError) {
                  setError(strengthError);
                  return;
                }
                if (password !== confirmPassword) {
                  setError("Passwords do not match.");
                  return;
                }
              }
              setError(null);
              // There's no client record yet to prefill from at this point
              // (find_or_create_public_lead only runs at final submit) --
              // carry forward what was just typed here instead, into
              // whichever form fields the builder mapped to it.
              setAnswers((prev) => {
                const next = { ...prev };
                for (const field of topLevelFields) {
                  if (next[field.id]) continue;
                  if (field.client_profile_field === "first_name") next[field.id] = firstName.trim();
                  else if (field.client_profile_field === "last_name") next[field.id] = lastName.trim();
                  else if (field.client_profile_field === "primary_email") next[field.id] = email.trim();
                  else if (field.client_profile_field === "primary_phone") next[field.id] = phone.trim();
                }
                return next;
              });
              setStep("form");
            }}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Continue
          </button>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          {pages.length > 1 && (
            <p className="text-xs font-medium text-muted">
              Page {currentIndex + 1} of {pages.length}
              {currentPage.title ? ` -- ${currentPage.title}` : ""}
            </p>
          )}
          {currentPage.fields.map((field) =>
            field.field_type === "repeating_section" ? (
              <PublicRepeatingSection
                key={field.id}
                field={field}
                childFields={childFieldsByParent.get(field.id) ?? []}
                rows={repeaterRows[field.id] ?? []}
                onChange={(rows) => setRepeaterRows((prev) => ({ ...prev, [field.id]: rows }))}
              />
            ) : (
              <PublicFieldInput key={field.id} field={field} value={answers[field.id] ?? ""} onChange={setAnswer} />
            )
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (currentIndex === 0 ? setStep("contact") : setPageIndex((i) => i - 1))}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent"
            >
              Back
            </button>
            {isLastPage ? (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPageIndex((i) => i + 1)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PublicRepeatingSection({
  field,
  childFields,
  rows,
  onChange,
}: {
  field: FieldRow;
  childFields: FieldRow[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-3 space-y-3">
        {rows.length === 0 && <p className="text-xs text-muted">None added yet.</p>}
        {rows.map((row, index) => (
          <div key={index} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {field.label} {index + 1}
              </p>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                className="text-xs font-medium text-danger hover:underline"
              >
                Remove
              </button>
            </div>
            <div className="mt-2 space-y-3">
              {childFields.map((child) => (
                <PublicFieldInput
                  key={child.id}
                  field={child}
                  value={row[child.id] ?? ""}
                  onChange={(fieldId, value) => onChange(rows.map((r, i) => (i === index ? { ...r, [fieldId]: value } : r)))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => onChange([...rows, {}])} className="mt-3 text-xs font-medium text-accent hover:underline">
        + Add another
      </button>
    </div>
  );
}

function PublicFieldInput({ field, value, onChange }: { field: FieldRow; value: string; onChange: (fieldId: string, value: string) => void }) {
  const options = normalizeOptions(field.options);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label htmlFor={`field-${field.id}`} className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-2">
        {field.field_type === "file_upload" ? (
          <p className="text-xs text-muted">File uploads aren&apos;t available before you&apos;re a client -- your preparer will follow up separately.</p>
        ) : field.field_type === "signature" ? (
          value ? (
            <p className="text-sm text-green-700">Signed by {JSON.parse(value).typed_name}</p>
          ) : (
            <div className="flex items-center gap-2">
              <input
                placeholder="Type your full name"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const target = e.target as HTMLInputElement;
                    if (target.value.trim()) onChange(field.id, JSON.stringify({ typed_name: target.value.trim(), signed_at: new Date().toISOString() }));
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.trim()) onChange(field.id, JSON.stringify({ typed_name: e.target.value.trim(), signed_at: new Date().toISOString() }));
                }}
              />
            </div>
          )
        ) : field.field_type === "dropdown" ? (
          <select
            id={`field-${field.id}`}
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
                  onChange={() => onChange(field.id, o.value)}
                  className="h-4 w-4 border-border text-accent focus:ring-accent"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : field.field_type === "multiple_choice" ? (
          <div className="space-y-1.5">
            {options.map((o, i) => {
              const selected = value ? value.split(",") : [];
              return (
                <label key={i} className="flex items-center gap-2 text-sm text-slate">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
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
        ) : field.field_type === "checkbox" ? (
          <input
            id={`field-${field.id}`}
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(field.id, e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
        ) : field.field_type === "date" ? (
          <input
            id={`field-${field.id}`}
            type="date"
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : field.field_type === "number" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : field.field_type === "currency" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : field.field_type === "ssn" || field.field_type === "ein" ? (
          <input
            id={`field-${field.id}`}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.field_type === "ssn" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : field.field_type === "address" ? (
          <AddressInput value={value} onChange={(v) => onChange(field.id, v)} />
        ) : (
          <textarea
            id={`field-${field.id}`}
            value={value}
            onChange={(e) => onChange(field.id, e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}
      </div>
    </div>
  );
}
