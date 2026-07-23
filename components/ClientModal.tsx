"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Building2, Check, ChevronRight, Eye, EyeOff, Loader2, Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client, ClientTag } from "@/lib/types";
import { clientDisplayName } from "@/lib/clientDisplay";
import { useWorkspace } from "@/components/WorkspaceProvider";

// save_workspace_client only accepts client_type = individual | business.
const CLIENT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
];

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// formatPhone rebuilds the entire display string from scratch on every
// keystroke. For a controlled input, React then sets that whole string back
// as .value — which resets the cursor to the end unless something restores
// it. Appending digits at the end is invisibly fine (that's where the
// cursor already was), but editing a digit in the *middle* of an existing
// number silently breaks: the first keystroke lands where you clicked, the
// reformat snaps the cursor to the end, and every keystroke after that
// lands in the wrong place — corrupting or discarding the intended edit
// without any error. This is exactly the asymmetry reported: the email
// field is a plain passthrough with no reformatting, so it never hits this;
// phone is the only field in this form that reformats-on-every-keystroke.
// Fix: figure out how many digits sit before the cursor in the raw input,
// reformat, then place the cursor back after that same digit in the
// reformatted string.
function digitIndexToFormattedCursor(formatted: string, digitsBeforeCursor: number): number {
  if (digitsBeforeCursor <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === digitsBeforeCursor) return i + 1;
    }
  }
  return formatted.length;
}

function formatSSN(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length < 4) return digits;
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatEIN(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

// next build always bakes NODE_ENV=production into a Vercel deployment —
// preview and production builds are identical on that axis, so NODE_ENV
// can't tell them apart. Only treat this as "real production" when we can
// positively confirm it: either Vercel's own NEXT_PUBLIC_VERCEL_ENV says
// so, or the browser is actually on the production hostname. Anything
// else (preview, local dev, unset) defaults to showing full error detail,
// since hiding detail on an environment we can't positively identify as
// production would make preview failures undebuggable — which is exactly
// what happened before this was tightened.
const PRODUCTION_HOSTNAME = "verexa-hq-phi.vercel.app";
function computeIsPreviewOrDev(): boolean {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return false;
  if (typeof window !== "undefined" && window.location.hostname === PRODUCTION_HOSTNAME) return false;
  return true;
}
const IS_PREVIEW_OR_DEV = computeIsPreviewOrDev();

type SbError = { message: string; code?: string; details?: string | null; hint?: string | null };

// Every follow-up write in the save flow reports its own failure through
// this, tagged with a distinct step name, so a partial save always says
// exactly which step broke instead of one generic message. It never
// claims the session expired — that specific wording is only ever shown
// right after getSession() itself confirms there is no session, never
// guessed from an error string here.
function stepError(step: string, err: SbError): string {
  if (IS_PREVIEW_OR_DEV) {
    const parts = [`[${step}] ${err.message}`];
    if (err.code) parts.push(`code=${err.code}`);
    if (err.details) parts.push(`details=${err.details}`);
    if (err.hint) parts.push(`hint=${err.hint}`);
    return parts.join(" — ");
  }
  const lower = err.message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("not allowed") || lower.includes("permission")) {
    return "You don't have permission to complete this action. Contact a workspace admin if this seems wrong.";
  }
  // P0001 is the SQLSTATE Postgres assigns to a plain `raise exception` —
  // every business-rule validation error this app's own RPCs raise uses
  // that form, so its message is intentional and safe to show as-is. Any
  // other code is an unexpected/internal database error (a genuine bug,
  // not a validation message), which could name real tables or columns —
  // that's kept out of production and only shown in preview/dev above.
  if (err.code === "P0001") return err.message;
  return "There was a problem saving. Please try again, and contact support if it keeps happening.";
}

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

type LinkedAccountSummary = {
  id: string;
  client_type: string;
  status: string;
  label: string;
};
type ContactSearchResult = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  personal_email: string | null;
  personal_phone: string | null;
  business_email: string | null;
  business_phone: string | null;
  occupation: string | null;
  portal_access: boolean;
  linkedAccounts: LinkedAccountSummary[];
};
type MaskedIdentity = { vault_id: string; identity_type: string; masked_value: string; last_four: string | null };
type SetupOption = { option_code: string; option_label: string };

export default function ClientModal({
  client,
  onClose,
  onSaved,
  onDeleted,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const isEditing = !!client;
  const workspaceId = client?.workspace_id ?? activeWorkspaceId;

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    client_type: client?.client_type === "business" ? "business" : "individual",
    business_name: client?.business_name ?? "",
    address: client?.address ?? "",
    city: client?.city ?? "",
    state: client?.state ?? "",
    zip_code: client?.zip_code ?? "",
    status: client?.status ?? "lead",
    source: "",
    first_name: client?.first_name ?? "",
    middle_name: "",
    last_name: client?.last_name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    occupation: "",
    portal_access: false,
  });
  const [contactId, setContactId] = useState<string | null>(null);
  // The primary contact that was actually loaded from account_contacts when
  // editing — distinct from contactId, which changes as soon as the user
  // selects a different existing contact. Comparing the two is how we know
  // whether the primary is being replaced (needs the old link retired) or
  // just being re-saved (no old link to touch).
  const [originalContactId, setOriginalContactId] = useState<string | null>(null);
  const [originalContactLabel, setOriginalContactLabel] = useState<string>("");
  const [keepOldContactAsAdditional, setKeepOldContactAsAdditional] = useState(false);
  const [contactMode, setContactMode] = useState<"create" | "link">("create");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [includeArchivedContacts, setIncludeArchivedContacts] = useState(false);

  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [availableMembers, setAvailableMembers] = useState<{ user_id: string; label: string }[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [sourceOptions, setSourceOptions] = useState<SetupOption[]>([]);
  const [serviceOptions, setServiceOptions] = useState<SetupOption[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const isEntity = form.client_type === "business";
  const identityType = isEntity ? "ein" : "ssn";
  const identityLabel = isEntity ? "EIN" : "SSN";

  const [maskedIdentity, setMaskedIdentity] = useState<MaskedIdentity | null>(null);
  const [identityStage, setIdentityStage] = useState<"masked" | "input" | "reveal">("input");
  const [newIdentityValue, setNewIdentityValue] = useState("");
  const [identityPassword, setIdentityPassword] = useState("");
  const [identityReason, setIdentityReason] = useState("");
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // client_setup_options is a global reference table (no workspace scope),
  // so this loads once regardless of workspaceId.
  useEffect(() => {
    supabase
      .from("client_setup_options")
      .select("option_code, option_label")
      .eq("option_group", "client_source")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data, error: err }) => {
        if (err) return;
        setSourceOptions((data as SetupOption[]) ?? []);
      });
    supabase
      .from("client_setup_options")
      .select("option_code, option_label")
      .eq("option_group", "client_service_type")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data, error: err }) => {
        if (err) return;
        setServiceOptions((data as SetupOption[]) ?? []);
      });
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    supabase
      .from("client_tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("tag_name")
      .then(({ data }) => setAvailableTags((data as ClientTag[]) ?? []));
    supabase
      .from("workspace_members")
      .select("user_id, display_name, role")
      .eq("workspace_id", workspaceId)
      .then(({ data }) =>
        setAvailableMembers(
          ((data as any[]) ?? []).map((m) => ({
            user_id: m.user_id,
            label: m.display_name || m.role || "Team member",
          }))
        )
      );
  }, [workspaceId]);

  useEffect(() => {
    if (!isEditing || !client) return;
    supabase
      .from("client_tag_assignments")
      .select("tag_id")
      .eq("client_id", client.id)
      .then(({ data }) => setSelectedTagIds(((data as any[]) ?? []).map((r) => r.tag_id)));
    supabase
      .from("client_team_members")
      .select("user_id")
      .eq("client_id", client.id)
      .then(({ data }) => setSelectedMemberIds(((data as any[]) ?? []).map((r) => r.user_id)));
    supabase
      .from("client_service_interests")
      .select("service_type")
      .eq("client_id", client.id)
      .then(({ data }) => setSelectedServices(((data as any[]) ?? []).map((r) => r.service_type)));
    supabase
      .from("account_contacts")
      .select(
        "contact_id, contacts(first_name, middle_name, last_name, personal_email, personal_phone, occupation, portal_access)"
      )
      .eq("account_id", client.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const c = (data as any).contacts;
        const id = (data as any).contact_id as string;
        setContactId(id);
        setOriginalContactId(id);
        if (c) {
          setOriginalContactLabel([c.first_name, c.last_name].filter(Boolean).join(" "));
          // Source email/phone from the contact's own row, not client.email/
          // client.phone — those are the clients row's fields (the
          // business's own contact info for a business client), which can
          // drift from the linked person's actual personal_email/
          // personal_phone. The contacts row is the source of truth for the
          // linked person.
          setForm((f) => ({
            ...f,
            middle_name: c.middle_name ?? "",
            email: c.personal_email ?? f.email,
            phone: c.personal_phone ?? f.phone,
            occupation: c.occupation ?? "",
            portal_access: c.portal_access ?? false,
          }));
        }
      });
    supabase
      .rpc("get_client_identity_vault_masked", { p_workspace_id: client.workspace_id, p_client_id: client.id })
      .then(({ data }) => {
        const list = (data as MaskedIdentity[]) ?? [];
        const match = list.find((v) => v.identity_type === identityType) ?? list[0];
        if (match) {
          setMaskedIdentity(match);
          setIdentityStage("masked");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, client?.id]);

  // Root cause of "search returns no usable results": the previous query
  // only matched a single term against first_name OR last_name. Typing a
  // full name ("Krystal Beloney") never matched either column alone, so it
  // always came back empty — confirmed live: the old first_name-or-last_name
  // query returns zero rows for "Krystal Beloney" even though that contact
  // exists, while splitting into per-word AND (each word must match *some*
  // field) correctly finds them. It also silently discarded the query error
  // (`const { data } = await supabase...`), so an RLS or syntax failure
  // looked identical to "no matches" — that's fixed below too.
  async function searchContacts() {
    if (!workspaceId) return;
    const trimmed = contactQuery.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSearchedOnce(false);

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    let q = supabase
      .from("contacts")
      .select(
        "id, first_name, middle_name, last_name, personal_email, personal_phone, business_email, business_phone, occupation, portal_access, account_contacts(account_id, is_primary, clients(id, client_type, business_name, first_name, last_name, account_name, status))"
      )
      .eq("workspace_id", workspaceId);
    for (const token of tokens) {
      const t = token.replace(/[,()]/g, "");
      q = q.or(
        `first_name.ilike.%${t}%,middle_name.ilike.%${t}%,last_name.ilike.%${t}%,personal_email.ilike.%${t}%,personal_phone.ilike.%${t}%,business_email.ilike.%${t}%,business_phone.ilike.%${t}%`
      );
    }
    const { data, error: searchErr } = await q.limit(20);

    setSearching(false);
    setSearchedOnce(true);
    if (searchErr) {
      setSearchError(stepError("contact_search", searchErr));
      setContactResults([]);
      return;
    }

    const rows: ContactSearchResult[] = ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      first_name: r.first_name,
      middle_name: r.middle_name,
      last_name: r.last_name,
      personal_email: r.personal_email,
      personal_phone: r.personal_phone,
      business_email: r.business_email,
      business_phone: r.business_phone,
      occupation: r.occupation,
      portal_access: r.portal_access,
      linkedAccounts: ((r.account_contacts as any[]) ?? [])
        .map((ac) => ac.clients)
        .filter(Boolean)
        .map((cl: any) => ({
          id: cl.id,
          client_type: cl.client_type,
          status: cl.status,
          label:
            cl.account_name ||
            (cl.client_type === "business" ? cl.business_name : [cl.first_name, cl.last_name].filter(Boolean).join(" ")) ||
            "Unnamed account",
        })),
    }));

    const visible = includeArchivedContacts
      ? rows
      : rows.filter((r) => !r.linkedAccounts.some((a) => a.client_type === "individual" && a.status === "archived"));

    setContactResults(visible.slice(0, 8));
  }

  // Fully hydrates the form from the selected contact's own record — the
  // previous version only copied first/last name and email, so
  // phone/occupation/middle name/portal access were left holding whatever
  // was already in the form (stale data from a previously-loaded contact,
  // or blank). Saving with that partial hydration would have overwritten
  // the *newly selected* person's real phone/occupation with that leftover
  // data. contactResults and contactQuery are kept so the result list stays
  // visible with the selection highlighted, instead of vanishing.
  function selectExistingContact(c: ContactSearchResult) {
    setContactId(c.id);
    setForm((f) => ({
      ...f,
      first_name: c.first_name,
      middle_name: c.middle_name ?? "",
      last_name: c.last_name,
      email: c.personal_email ?? "",
      phone: c.personal_phone ?? "",
      occupation: c.occupation ?? "",
      portal_access: c.portal_access ?? false,
    }));
  }

  function clearSelectedContact(backToCreate: boolean) {
    setContactId(null);
    if (backToCreate) {
      setContactMode("create");
      setForm((f) => ({ ...f, first_name: "", middle_name: "", last_name: "", email: "", phone: "", occupation: "", portal_access: false }));
    }
  }

  function toggleTagId(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function addTag() {
    const name = tagInput.trim();
    if (!name || !workspaceId) return;
    const existing = availableTags.find((t) => t.tag_name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) toggleTagId(existing.id);
      setTagInput("");
      return;
    }
    const { data, error: tagCreateError } = await supabase
      .from("client_tags")
      .insert({ workspace_id: workspaceId, tag_name: name })
      .select("*")
      .single();
    if (tagCreateError) {
      setError(stepError("client_tags_insert", tagCreateError));
      return;
    }
    setAvailableTags((prev) => [...prev, data as ClientTag]);
    setSelectedTagIds((prev) => [...prev, (data as ClientTag).id]);
    setTagInput("");
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function toggleService(code: string) {
    setSelectedServices((prev) => (prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]));
  }

  function goToContacts(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.address.trim() || !form.city.trim() || !form.state.trim() || !form.zip_code.trim()) {
      setError("Address is required.");
      return;
    }
    if (selectedMemberIds.length === 0) {
      setError("Select at least one team member.");
      return;
    }
    setStep(2);
  }

  async function startReveal() {
    setIdentityError(null);
    setIdentityStage("reveal");
  }

  async function confirmReveal() {
    if (!client || !maskedIdentity) return;
    setIdentityBusy(true);
    setIdentityError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user.email;
    if (!email) {
      setIdentityBusy(false);
      setIdentityError("Not signed in.");
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: identityPassword });
    setIdentityPassword("");
    if (authError) {
      setIdentityBusy(false);
      setIdentityError("Incorrect password.");
      return;
    }
    if (identityReason.trim().length < 5) {
      setIdentityBusy(false);
      setIdentityError("Enter a reason for viewing this (at least 5 characters).");
      return;
    }
    const { data, error: revealError } = await supabase.rpc("get_identity_vault_value", {
      p_workspace_id: client.workspace_id,
      p_vault_id: maskedIdentity.vault_id,
      p_reason: identityReason,
    });
    setIdentityBusy(false);
    if (revealError) {
      setIdentityError(revealError.message);
      return;
    }
    setRevealedValue((data as any).value);
    setIdentityReason("");
    setTimeout(() => {
      setRevealedValue(null);
      setIdentityStage("masked");
    }, 30000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selectedServices.length === 0) {
      setError("Select at least one service.");
      return;
    }
    if (identityStage === "input" && !newIdentityValue.trim()) {
      setError(`Enter the client's ${identityLabel}.`);
      return;
    }

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setSaving(false);
      setError("Your session has expired. Refresh the page and sign in again.");
      return;
    }

    if (!workspaceId) {
      setSaving(false);
      setError("Could not determine your workspace. Close this and try again.");
      return;
    }

    // save_workspace_client is the approved write path for public.clients.
    // It validates permission, status/source/service-type values, and
    // upserts client_service_interests from p_service_types in one
    // transaction (deleting anything unchecked on edit). It does not
    // manage the legacy account_type/account_name display columns, so
    // those are intentionally left untouched by this form.
    const { data: saveResult, error: saveError } = await supabase.rpc("save_workspace_client", {
      p_workspace_id: workspaceId,
      p_client_id: client?.id ?? null,
      p_client_type: form.client_type,
      p_first_name: form.first_name,
      p_last_name: form.last_name,
      p_business_name: form.business_name,
      p_email: form.email,
      p_phone: form.phone,
      p_address: form.address,
      p_city: form.city,
      p_state: form.state,
      p_zip_code: form.zip_code,
      p_status: form.status,
      p_source: form.source || null,
      p_service_types: selectedServices,
    });
    if (saveError) {
      setSaving(false);
      setError(stepError("save_workspace_client", saveError));
      return;
    }
    const clientId: string | undefined = (saveResult as any)?.client_id;
    if (!clientId) {
      setSaving(false);
      setError("The client save did not return a client ID.");
      return;
    }

    if (form.first_name || form.last_name) {
      let activeContactId = contactId;

      if (!activeContactId) {
        const { data: newContact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            workspace_id: workspaceId,
            first_name: form.first_name,
            middle_name: form.middle_name || null,
            last_name: form.last_name,
            personal_email: form.email || null,
            personal_phone: form.phone || null,
            occupation: form.occupation || null,
            portal_access: form.portal_access,
          })
          .select("id")
          .single();
        if (contactError) {
          setSaving(false);
          setError(`Client saved, but creating the contact record failed: ${stepError("contact_create", contactError)}`);
          return;
        }
        activeContactId = newContact.id;
        setContactId(newContact.id);
      } else {
        // Whichever contact is currently selected — the original primary
        // being re-saved, or a different existing contact just picked from
        // search — the form was hydrated to match it exactly (see
        // selectExistingContact), so writing it back here never overwrites
        // a person with someone else's data.
        const { error: contactUpdateError } = await supabase
          .from("contacts")
          .update({
            first_name: form.first_name,
            middle_name: form.middle_name || null,
            last_name: form.last_name,
            personal_email: form.email || null,
            personal_phone: form.phone || null,
            occupation: form.occupation || null,
            portal_access: form.portal_access,
          })
          .eq("id", activeContactId);
        if (contactUpdateError) {
          setSaving(false);
          setError(`Client saved, but the contact record failed to update: ${stepError("contact_update", contactUpdateError)}`);
          return;
        }
      }

      const { data: existingLink, error: linkLookupError } = await supabase
        .from("account_contacts")
        .select("id, is_primary")
        .eq("account_id", clientId)
        .eq("contact_id", activeContactId)
        .maybeSingle();
      if (linkLookupError) {
        setSaving(false);
        setError(`Client saved, but checking the contact link failed: ${stepError("account_contacts_link", linkLookupError)}`);
        return;
      }
      if (existingLink) {
        const { error: linkUpdateError } = await supabase
          .from("account_contacts")
          .update({ is_primary: true, relationship_type: "primary", portal_access: form.portal_access })
          .eq("id", existingLink.id);
        if (linkUpdateError) {
          setSaving(false);
          setError(`Client saved, but updating the contact link failed: ${stepError("account_contacts_link", linkUpdateError)}`);
          return;
        }
      } else {
        const { error: linkInsertError } = await supabase.from("account_contacts").insert({
          workspace_id: workspaceId,
          account_id: clientId,
          contact_id: activeContactId,
          relationship_type: "primary",
          is_primary: true,
          portal_access: form.portal_access,
        });
        if (linkInsertError) {
          setSaving(false);
          setError(`Client saved, but linking the contact failed: ${stepError("account_contacts_link", linkInsertError)}`);
          return;
        }
      }

      // The primary contact was switched to a different existing person —
      // retire the old primary link so only one account_contacts row for
      // this business ever has is_primary = true. The old contact's own
      // record (name/email/phone) is never touched here. Per the user's
      // choice: either demote it to a non-primary "additional" relationship,
      // or remove just the relationship row (never the contact itself).
      if (isEditing && originalContactId && originalContactId !== activeContactId) {
        if (keepOldContactAsAdditional) {
          const { error: demoteError } = await supabase
            .from("account_contacts")
            .update({ is_primary: false, relationship_type: "additional" })
            .eq("account_id", clientId)
            .eq("contact_id", originalContactId);
          if (demoteError) {
            setSaving(false);
            setError(`Client saved, but updating the previous contact's relationship failed: ${stepError("account_contacts_demote", demoteError)}`);
            return;
          }
        } else {
          const { error: removeError } = await supabase
            .from("account_contacts")
            .delete()
            .eq("account_id", clientId)
            .eq("contact_id", originalContactId);
          if (removeError) {
            setSaving(false);
            setError(`Client saved, but removing the previous contact's relationship failed: ${stepError("account_contacts_remove", removeError)}`);
            return;
          }
        }
      }
    }

    const { error: tagDeleteError } = await supabase.from("client_tag_assignments").delete().eq("client_id", clientId);
    if (tagDeleteError) {
      setSaving(false);
      setError(`Client saved, but clearing old tags failed: ${stepError("client_tag_assignments_delete", tagDeleteError)}`);
      return;
    }
    if (selectedTagIds.length > 0) {
      const { error: tagInsertError } = await supabase
        .from("client_tag_assignments")
        .insert(selectedTagIds.map((tag_id) => ({ workspace_id: workspaceId, client_id: clientId, tag_id })));
      if (tagInsertError) {
        setSaving(false);
        setError(`Client saved, but saving tags failed: ${stepError("client_tag_assignments_insert", tagInsertError)}`);
        return;
      }
    }

    const { error: memberDeleteError } = await supabase.from("client_team_members").delete().eq("client_id", clientId);
    if (memberDeleteError) {
      setSaving(false);
      setError(`Client saved, but clearing team assignment failed: ${stepError("client_team_members_delete", memberDeleteError)}`);
      return;
    }
    if (selectedMemberIds.length > 0) {
      const { error: memberInsertError } = await supabase
        .from("client_team_members")
        .insert(selectedMemberIds.map((user_id) => ({ workspace_id: workspaceId, client_id: clientId, user_id })));
      if (memberInsertError) {
        setSaving(false);
        setError(`Client saved, but saving team assignment failed: ${stepError("client_team_members_insert", memberInsertError)}`);
        return;
      }
    }

    if (newIdentityValue.trim()) {
      // The full value is only ever sent to save_identity_vault_value,
      // which encrypts it server-side. If this fails, stop immediately —
      // do not fall through to saving the last-four digits below.
      const { error: idError } = await supabase.rpc("save_identity_vault_value", {
        p_workspace_id: workspaceId,
        p_client_id: clientId,
        p_related_contact_id: null,
        p_identity_type: identityType,
        p_plain_value: newIdentityValue,
        p_reason: "Saved via client form",
      });
      if (idError) {
        setSaving(false);
        setError(`Client saved, but the ${identityLabel} could not be stored securely: ${stepError("save_identity_vault_value", idError)}`);
        return;
      }
      if (identityType === "ssn") {
        const digits = newIdentityValue.replace(/\D/g, "");
        // save_client_profile_details overwrites date_of_birth on every
        // call rather than leaving it untouched — pass the client's
        // existing value straight through so this can't silently null it.
        const { error: profileError } = await supabase.rpc("save_client_profile_details", {
          p_workspace_id: workspaceId,
          p_client_id: clientId,
          p_date_of_birth: client?.date_of_birth ?? null,
          p_ssn_last_four: digits.slice(-4),
        });
        if (profileError) {
          setSaving(false);
          setError(
            `Client and SSN saved securely, but the last-four display value failed to save: ${stepError("save_client_profile_details", profileError)}`
          );
          return;
        }
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!client) return;
    const name = clientDisplayName(client);
    if (
      !window.confirm(
        `Delete ${name}? This removes the client record but not their services, tasks, or deadlines — remove those first if you want a clean delete.`
      )
    )
      return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from("clients").delete().eq("id", client.id);
    setDeleting(false);
    if (deleteError) {
      setError(stepError("clients_delete", deleteError));
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-2xl border border-line shadow-lg w-full max-w-2xl max-h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-slab text-lg font-bold text-ink">
            {isEditing ? "Edit Client" : "New Client"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 border-b border-line pb-4 mb-5">
          <StepBadge active={step === 1} done={step > 1}>1</StepBadge>
          <span className={`text-sm font-semibold ${step === 1 ? "text-ink" : "text-muted"}`}>Account info</span>
          <ChevronRight size={14} className="text-line" />
          <StepBadge active={step === 2} done={false}>2</StepBadge>
          <span className={`text-sm font-semibold ${step === 2 ? "text-ink" : "text-muted"}`}>Contact</span>
        </div>

        {step === 1 && (
          <form onSubmit={goToContacts} className="space-y-5">
            <Section label="Client type">
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {CLIENT_TYPES.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="client_type"
                      checked={form.client_type === t.value}
                      onChange={() => setForm({ ...form, client_type: t.value })}
                      className="h-4 w-4 accent-[#108A64]"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </Section>

            {isEntity ? (
              <Section label="Business name">
                <input
                  required
                  placeholder="Greenleaf Consulting LLC"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="client-input w-full"
                />
              </Section>
            ) : (
              <Section label="Client's name">
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    required
                    placeholder="First name"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="client-input w-full"
                  />
                  <input
                    placeholder="Middle name (optional)"
                    value={form.middle_name}
                    onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                    className="client-input w-full"
                  />
                  <input
                    required
                    placeholder="Last name"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="client-input w-full"
                  />
                </div>
              </Section>
            )}

            <Section label="Address">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  placeholder="Street address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="client-input w-full sm:col-span-2"
                />
                <input
                  required
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="client-input w-full"
                />
                <div className="flex gap-3">
                  <select
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="client-input w-1/2"
                  >
                    <option value="">State…</option>
                    {US_STATES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="ZIP code"
                    value={form.zip_code}
                    onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                    className="client-input w-1/2"
                  />
                </div>
              </div>
            </Section>

            <Section label="Team members (required)">
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedMemberIds.map((id) => {
                  const member = availableMembers.find((m) => m.user_id === id);
                  if (!member) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-paper-dim bg-paper border border-line text-xs font-semibold text-ink px-2.5 py-1"
                    >
                      {member.label}
                      <button type="button" onClick={() => toggleMember(id)} aria-label={`Remove ${member.label}`}>
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleMember(e.target.value);
                }}
                className="client-input w-full"
              >
                <option value="">Add a team member…</option>
                {availableMembers
                  .filter((m) => !selectedMemberIds.includes(m.user_id))
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </Section>

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-sm font-semibold py-2.5 px-3.5 rounded-xl border border-brick text-brick disabled:opacity-60 hover:bg-brick/5"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-sm font-semibold py-2.5 px-5 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555]"
              >
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {!contactId && (
              <div className="flex gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setContactMode("create")}
                  className={`rounded-xl px-3 py-1.5 ${contactMode === "create" ? "bg-[#108A64] text-white" : "border border-line text-muted"}`}
                >
                  Create new contact
                </button>
                <button
                  type="button"
                  onClick={() => setContactMode("link")}
                  className={`rounded-xl px-3 py-1.5 ${contactMode === "link" ? "bg-[#108A64] text-white" : "border border-line text-muted"}`}
                >
                  Link existing contact
                </button>
              </div>
            )}

            {contactId && (
              <div className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted block mb-0.5">
                      Selected existing contact
                    </span>
                    <strong className="text-ink">{form.first_name} {form.last_name}</strong>
                  </span>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => clearSelectedContact(false)} className="text-xs font-semibold text-muted hover:text-ink">
                      Clear
                    </button>
                    <button type="button" onClick={() => clearSelectedContact(true)} className="text-xs font-semibold text-muted hover:text-ink">
                      Create new instead
                    </button>
                  </div>
                </div>
                {isEditing && originalContactId && contactId !== originalContactId && (
                  <label className="flex items-start gap-2 text-xs text-ink pt-2 border-t border-line">
                    <input
                      type="checkbox"
                      checked={keepOldContactAsAdditional}
                      onChange={(e) => setKeepOldContactAsAdditional(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-[#108A64]"
                    />
                    Keep {originalContactLabel || "the previous contact"} linked as an additional (non-primary) contact
                    instead of removing them from this business
                  </label>
                )}
              </div>
            )}

            {contactMode === "link" && (
              <Section label="Find a contact">
                <p className="text-xs text-muted mb-2">
                  Searches contacts and people who are already Individual clients — by name, email, or phone.
                </p>
                <div className="flex gap-2">
                  <input
                    placeholder="Search by name, email, or phone…"
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchContacts();
                      }
                    }}
                    className="client-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={searchContacts}
                    disabled={searching}
                    className="flex items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-60"
                  >
                    {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    {searching ? "Searching…" : "Search"}
                  </button>
                </div>

                <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={includeArchivedContacts}
                    onChange={(e) => {
                      setIncludeArchivedContacts(e.target.checked);
                      if (contactQuery.trim().length >= 2) searchContacts();
                    }}
                    className="h-3.5 w-3.5 accent-[#108A64]"
                  />
                  Include archived
                </label>

                {searchError && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-brick">
                    <AlertCircle size={13} /> {searchError}
                  </div>
                )}

                {!searching && searchedOnce && !searchError && contactResults.length === 0 && (
                  <div className="mt-2 text-xs text-muted">No matching contacts found.</div>
                )}

                {contactResults.length > 0 && (
                  <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {contactResults.map((c) => {
                      const isSelected = c.id === contactId;
                      const isIndividualClient = c.linkedAccounts.some((a) => a.client_type === "individual");
                      const linkedClient = c.linkedAccounts.find((a) => a.client_type === "individual");
                      const businesses = c.linkedAccounts.filter((a) => a.client_type === "business");
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => selectExistingContact(c)}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-paper ${isSelected ? "bg-emerald-50" : ""}`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-ink">
                              {[c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ")}
                            </span>
                            {isSelected && <Check size={13} className="text-[#108A64]" />}
                            {isIndividualClient && (
                              <span className="rounded-full bg-sky-50 text-sky-700 text-[10px] font-semibold px-2 py-0.5">
                                Individual Client{linkedClient?.status ? ` · ${linkedClient.status}` : ""}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                            {(c.personal_email || c.business_email) && <span>{c.personal_email || c.business_email}</span>}
                            {(c.personal_phone || c.business_phone) && <span>{c.personal_phone || c.business_phone}</span>}
                          </div>
                          {businesses.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {businesses.map((b) => (
                                <span
                                  key={b.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-paper border border-line text-[10px] font-semibold text-muted px-2 py-0.5"
                                >
                                  <Building2 size={10} /> {b.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}

            {isEntity && !contactId && (
              <Section label="Contact name">
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    required
                    placeholder="First name"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="client-input w-full"
                  />
                  <input
                    placeholder="Middle name"
                    value={form.middle_name}
                    onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                    className="client-input w-full"
                  />
                  <input
                    required
                    placeholder="Last name"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="client-input w-full"
                  />
                </div>
              </Section>
            )}

            {!isEntity && !contactId && (
              <div className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink">
                Contact: <strong>{form.first_name} {form.last_name}</strong>
              </div>
            )}

            <Section label="Contact">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="client-input w-full"
                />
                <input
                  required
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.phone}
                  onChange={(e) => {
                    const input = e.target;
                    const rawCursor = input.selectionStart ?? input.value.length;
                    const digitsBeforeCursor = input.value.slice(0, rawCursor).replace(/\D/g, "").length;
                    const formatted = formatPhone(input.value);
                    const newCursor = digitIndexToFormattedCursor(formatted, digitsBeforeCursor);
                    setForm((f) => ({ ...f, phone: formatted }));
                    requestAnimationFrame(() => {
                      input.setSelectionRange(newCursor, newCursor);
                    });
                  }}
                  className="client-input w-full"
                />
                <input
                  placeholder="Occupation"
                  value={form.occupation}
                  onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                  className="client-input w-full"
                />
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="client-input w-full"
                >
                  <option value="">Referral source…</option>
                  {sourceOptions.map((o) => (
                    <option key={o.option_code} value={o.option_code}>
                      {o.option_label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.portal_access}
                  onChange={(e) => setForm({ ...form, portal_access: e.target.checked })}
                  className="h-4 w-4 accent-[#108A64]"
                />
                Give this contact portal access
              </label>
            </Section>

            {/* Tags lives here (Contact step, next to team members/portal access)
               rather than on Account info — team assignment stays on Step 1
               since it gates moving to this step. */}
            <Section label="Tags">
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTagIds.map((id) => {
                  const tag = availableTags.find((t) => t.id === id);
                  if (!tag) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-[#108A64] text-xs font-semibold px-2.5 py-1"
                    >
                      {tag.tag_name}
                      <button type="button" onClick={() => toggleTagId(id)} aria-label={`Remove ${tag.tag_name}`}>
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  list="tag-suggestions"
                  placeholder="Add a tag…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="client-input flex-1"
                />
                <datalist id="tag-suggestions">
                  {availableTags.map((t) => (
                    <option key={t.id} value={t.tag_name} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-paper"
                >
                  Add
                </button>
              </div>
            </Section>

            <Section label={`${identityLabel} (required)`}>
              {isEditing && identityStage === "masked" && maskedIdentity && (
                <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="font-mono text-ink">{maskedIdentity.masked_value}</span>
                  <div className="flex gap-3">
                    <button type="button" onClick={startReveal} className="text-xs font-semibold text-[#108A64] flex items-center gap-1">
                      <Eye size={13} /> Reveal
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdentityStage("input")}
                      className="text-xs font-semibold text-muted"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              )}

              {identityStage === "reveal" && (
                <div className="space-y-2 rounded-xl border border-line p-3">
                  {revealedValue ? (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-ink">{revealedValue}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRevealedValue(null);
                          setIdentityStage("masked");
                        }}
                        className="text-xs font-semibold text-muted flex items-center gap-1"
                      >
                        <EyeOff size={13} /> Hide
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted">Confirm your password and reason to view the full {identityLabel}.</p>
                      <input
                        type="password"
                        placeholder="Your account password"
                        value={identityPassword}
                        onChange={(e) => setIdentityPassword(e.target.value)}
                        className="client-input w-full"
                      />
                      <input
                        placeholder="Reason (e.g. Confirming for tax filing)"
                        value={identityReason}
                        onChange={(e) => setIdentityReason(e.target.value)}
                        className="client-input w-full"
                      />
                      {identityError && <p className="text-xs text-brick">{identityError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setIdentityStage("masked")}
                          className="text-xs font-semibold py-2 px-3 rounded-xl border border-line text-ink"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmReveal}
                          disabled={identityBusy}
                          className="text-xs font-semibold py-2 px-3 rounded-xl bg-[#108A64] text-white disabled:opacity-60"
                        >
                          {identityBusy ? "Verifying…" : "Confirm"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {identityStage === "input" && (
                <input
                  placeholder={isEntity ? "12-3456789" : "123-45-6789"}
                  value={newIdentityValue}
                  onChange={(e) =>
                    setNewIdentityValue(isEntity ? formatEIN(e.target.value) : formatSSN(e.target.value))
                  }
                  className="client-input w-full"
                />
              )}
            </Section>

            {isEditing && (
              <Section label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="client-input w-full"
                >
                  <option value="lead">Lead</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </Section>
            )}

            <Section label="Services (required)">
              <div className="grid gap-2 sm:grid-cols-2">
                {serviceOptions.map((opt) => (
                  <label
                    key={opt.option_code}
                    className="flex items-center gap-2 text-sm text-ink border border-line rounded-xl px-3 py-2.5 cursor-pointer hover:bg-paper"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(opt.option_code)}
                      onChange={() => toggleService(opt.option_code)}
                      className="w-4 h-4 accent-[#108A64]"
                    />
                    {opt.option_label}
                  </label>
                ))}
              </div>
            </Section>

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555] disabled:opacity-60"
              >
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
      <style jsx global>{`
        .client-input {
          border: 1px solid #ddeae5;
          border-radius: 0.75rem;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .client-input:focus {
          border-color: #108a64;
          box-shadow: 0 0 0 3px rgba(16, 138, 100, 0.12);
        }
        .client-input:disabled {
          background: #f5faf8;
        }
      `}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  );
}

function StepBadge({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span
      className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold"
      style={{
        backgroundColor: done ? "#108A64" : active ? "#108A64" : "#EEEAE0",
        color: done || active ? "white" : "#6E7268",
      }}
    >
      {done ? <Check size={13} /> : children}
    </span>
  );
}
