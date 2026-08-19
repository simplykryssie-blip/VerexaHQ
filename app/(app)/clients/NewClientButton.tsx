"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { DuplicateClientModal } from "@/components/DuplicateClientModal";
import { saveClientDraft, loadClientDraft, clearClientDraft } from "@/lib/clientDraft";
import { formatPhone } from "@/lib/phone";
import { useToast } from "@/components/Toast";

const DRAFT_KEY = "new-client-button";

type ServiceCategory = { id: string; name: string; services: { id: string; name: string }[] };
type ServiceOption = { id: string; name: string };

type Draft = {
  clientType: "individual" | "business";
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  contactFirstName: string;
  contactLastName: string;
  contactTitle: string;
  contactCustomTitle: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  selectedServiceIds: string[];
  ssn: string;
  itin: string;
  ein: string;
  inviteToPortal: boolean;
  linkContactAsClient: boolean;
  contactEmail: string;
  contactPhone: string;
  contactInviteToPortal: boolean;
};

const CONTACT_TITLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "partner", label: "Partner" },
  { value: "attorney", label: "Attorney" },
  { value: "officer", label: "Officer" },
  { value: "other", label: "Other" },
];

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

function formatSsnOrItin(value: string) {
  const d = digitsOnly(value);
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 9)].filter(Boolean).join("-");
}

function formatEin(value: string) {
  const d = digitsOnly(value);
  return [d.slice(0, 2), d.slice(2, 9)].filter(Boolean).join("-");
}

export function NewClientButton({
  workspaceId,
  workspaceName,
  serviceCategories,
}: {
  workspaceId: string;
  workspaceName: string;
  serviceCategories: ServiceCategory[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [clientType, setClientType] = useState<"individual" | "business">("individual");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactTitle, setContactTitle] = useState(CONTACT_TITLE_OPTIONS[0].value);
  const [contactCustomTitle, setContactCustomTitle] = useState("");
  const [linkContactAsClient, setLinkContactAsClient] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactInviteToPortal, setContactInviteToPortal] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [ssn, setSsn] = useState("");
  const [itin, setItin] = useState("");
  const [ein, setEin] = useState("");
  const [inviteToPortal, setInviteToPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<{ matchedOn: string[]; existingClientId: string } | null>(null);

  const isBusiness = clientType === "business";

  useEffect(() => {
    // Landed here from the global draft banner (which can surface this
    // resume option from any page, not just this one) -- reopen the form
    // pre-filled instead of requiring the user to notice and re-open it.
    if (searchParams.get("resumeClientDraft") !== DRAFT_KEY) return;
    const draft = loadClientDraft<Draft>(DRAFT_KEY);
    if (draft) applyDraft(draft);
    setOpen(true);
    router.replace("/clients");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function applyDraft(draft: Draft) {
    setClientType(draft.clientType);
    setFirstName(draft.firstName);
    setLastName(draft.lastName);
    setBusinessName(draft.businessName);
    setEmail(draft.email);
    setPhone(draft.phone);
    setContactFirstName(draft.contactFirstName);
    setContactLastName(draft.contactLastName);
    setContactTitle(draft.contactTitle);
    setContactCustomTitle(draft.contactCustomTitle);
    setLinkContactAsClient(draft.linkContactAsClient);
    setContactEmail(draft.contactEmail);
    setContactPhone(draft.contactPhone);
    setContactInviteToPortal(draft.contactInviteToPortal);
    setStreet(draft.street);
    setCity(draft.city);
    setState(draft.state);
    setZip(draft.zip);
    setSelectedServiceIds(draft.selectedServiceIds);
    setSsn(draft.ssn);
    setItin(draft.itin);
    setEin(draft.ein);
    setInviteToPortal(draft.inviteToPortal);
  }

  function currentDraft(): Draft {
    return {
      clientType,
      firstName,
      lastName,
      businessName,
      email,
      phone,
      contactFirstName,
      contactLastName,
      contactTitle,
      contactCustomTitle,
      street,
      city,
      state,
      zip,
      selectedServiceIds,
      ssn,
      itin,
      ein,
      inviteToPortal,
      linkContactAsClient,
      contactEmail,
      contactPhone,
      contactInviteToPortal,
    };
  }

  const serviceOptions: ServiceOption[] = serviceCategories.flatMap((c) => c.services);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit(false);
  }

  async function submit(forceCreate: boolean) {
    setError(null);

    if (!email || !phone) {
      setError("Email and phone are required.");
      return;
    }
    if (!street || !city || !state || !zip) {
      setError("Mailing address is required.");
      return;
    }
    if (isBusiness && (!contactFirstName || !contactLastName)) {
      setError("Contact person's first and last name are required.");
      return;
    }
    if (isBusiness && contactTitle === "other" && !contactCustomTitle.trim()) {
      setError("Enter a title for this contact.");
      return;
    }
    if (isBusiness && linkContactAsClient && !contactEmail) {
      setError("An email for the contact is required to give them their own client profile.");
      return;
    }
    if (isBusiness && contactInviteToPortal && !contactEmail) {
      setError("An email for the contact is required to invite them to the portal.");
      return;
    }
    if (inviteToPortal && !email) {
      setError("An email is required to invite this client to the portal.");
      return;
    }
    if (clientType === "individual" && ssn && digitsOnly(ssn).length !== 9) {
      setError("SSN must be exactly 9 digits.");
      return;
    }
    if (clientType === "individual" && itin && digitsOnly(itin).length !== 9) {
      setError("ITIN must be exactly 9 digits.");
      return;
    }
    if (clientType === "business" && ein && digitsOnly(ein).length !== 9) {
      setError("EIN must be exactly 9 digits.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.rpc("create_client", {
      p_workspace_id: workspaceId,
      p_client_type: clientType,
      p_first_name: clientType === "individual" ? firstName : undefined,
      p_last_name: clientType === "individual" ? lastName : undefined,
      p_business_name: clientType === "business" ? businessName : undefined,
      p_date_of_birth: undefined,
      p_primary_email: email || undefined,
      p_primary_phone: phone || undefined,
      p_ssn: clientType === "individual" ? ssn || undefined : undefined,
      p_ein: clientType === "business" ? ein || undefined : undefined,
      p_itin: clientType === "individual" ? itin || undefined : undefined,
      p_force_create: forceCreate,
    });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const result = data as { client_id: string; is_new: boolean; duplicate_matched_on: string[] };
    setLoading(false);

    if (!result.is_new) {
      // Matched an existing client -- stop here. No address, contact,
      // engagement, or portal invite gets attached until the user confirms
      // this genuinely isn't a duplicate (either by viewing the existing
      // client, or by explicitly choosing "create anyway" -- e.g. spouses
      // or business partners who legitimately share an email/phone --
      // which re-submits with forceCreate: true and skips this branch).
      setDuplicateMatch({ matchedOn: result.duplicate_matched_on ?? [], existingClientId: result.client_id });
      return;
    }

    setLoading(true);

    const { error: addressError } = await supabase.from("client_addresses").insert({
      client_id: result.client_id,
      workspace_id: workspaceId,
      address_type: "mailing",
      street,
      city,
      state,
      zip,
    });
    if (addressError) {
      setLoading(false);
      setError(addressError.message);
      return;
    }

    const contactTitleLabel = contactTitle === "other" ? contactCustomTitle.trim() || "Other" : CONTACT_TITLE_OPTIONS.find((o) => o.value === contactTitle)?.label ?? contactTitle;

    if (isBusiness) {
      const { error: contactError } = await supabase.from("client_contacts").insert({
        client_id: result.client_id,
        workspace_id: workspaceId,
        first_name: contactFirstName,
        last_name: contactLastName,
        title: contactTitleLabel,
        email: contactEmail || email || null,
        phone: contactPhone || phone || null,
        is_primary: true,
      });
      if (contactError) {
        setLoading(false);
        setError(contactError.message);
        return;
      }

      if (linkContactAsClient) {
        const { data: contactClientData, error: contactClientError } = await supabase.rpc("create_client", {
          p_workspace_id: workspaceId,
          p_client_type: "individual",
          p_first_name: contactFirstName,
          p_last_name: contactLastName,
          p_primary_email: contactEmail || undefined,
          p_primary_phone: contactPhone || phone || undefined,
        });
        if (contactClientError) {
          setLoading(false);
          setError(contactClientError.message);
          return;
        }
        const contactResult = contactClientData as { client_id: string; is_new: boolean };

        const { error: relationshipError } = await supabase.rpc("create_client_relationship", {
          p_client_id: result.client_id,
          p_workspace_id: workspaceId,
          p_relationship_type: contactTitle,
          p_custom_relationship_title: contactTitle === "other" ? contactCustomTitle.trim() : undefined,
          p_related_name: `${contactFirstName} ${contactLastName}`,
          p_related_client_id: contactResult.client_id,
        });
        if (relationshipError) {
          setLoading(false);
          setError(relationshipError.message);
          return;
        }

        if (contactInviteToPortal) {
          const { data: contactInvite, error: contactInviteError } = await supabase
            .from("client_portal_users")
            .insert({
              client_id: contactResult.client_id,
              workspace_id: workspaceId,
              invited_name: `${contactFirstName} ${contactLastName}`,
              invited_email: contactEmail,
            })
            .select("invitation_token")
            .single();
          if (contactInviteError) {
            setLoading(false);
            setError(contactInviteError.message);
            return;
          }

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          const contactAcceptUrl = `${appUrl}/portal/accept-invitation?token=${contactInvite.invitation_token}`;

          const contactEmailRes = await fetch("/api/portal-invitations/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: contactResult.client_id,
              invitedEmail: contactEmail,
              invitedName: `${contactFirstName} ${contactLastName}`,
              acceptUrl: contactAcceptUrl,
            }),
          });
          const contactEmailResult = await contactEmailRes.json().catch(() => null);
          if (!contactEmailRes.ok || !contactEmailResult?.sent) {
            toast.show(`Contact's invite created, but the email couldn't be sent. Share this link with them directly: ${contactAcceptUrl}`, "error");
          }
        }
      }
    }

    // Records what they want, not a commitment yet -- this is the same
    // client_service_interests signal the public organizer link's own
    // "what do you need help with" step writes, so each selection fires the
    // same automation (e.g. auto-sending the matching organizer). A lead can
    // need more than one at once (bookkeeping + payroll, say), so this loops
    // one call per selected service. Engagements get created later, once
    // there's an actual scope to work from.
    for (const serviceId of selectedServiceIds) {
      const { error: interestError } = await supabase.rpc("record_client_service_interest", {
        p_client_id: result.client_id,
        p_workspace_id: workspaceId,
        p_service_id: serviceId,
      });
      if (interestError) {
        setLoading(false);
        setError(interestError.message);
        return;
      }
    }

    if (inviteToPortal) {
      const { data: invite, error: inviteError } = await supabase
        .from("client_portal_users")
        .insert({
          client_id: result.client_id,
          workspace_id: workspaceId,
          invited_name: clientType === "individual" ? [firstName, lastName].filter(Boolean).join(" ") : `${contactFirstName} ${contactLastName}`,
          invited_email: email,
        })
        .select("invitation_token")
        .single();
      if (inviteError) {
        setLoading(false);
        setError(inviteError.message);
        return;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const acceptUrl = `${appUrl}/portal/accept-invitation?token=${invite.invitation_token}`;
      const invitedName = clientType === "individual" ? [firstName, lastName].filter(Boolean).join(" ") : `${contactFirstName} ${contactLastName}`;

      const emailRes = await fetch("/api/portal-invitations/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: result.client_id,
          invitedEmail: email,
          invitedName,
          acceptUrl,
        }),
      });
      const emailResult = await emailRes.json().catch(() => null);
      if (!emailRes.ok || !emailResult?.sent) {
        toast.show(`Invite created, but the email couldn't be sent. Share this link with them directly: ${acceptUrl}`, "error");
      }
    }

    setLoading(false);
    setOpen(false);
    clearClientDraft(DRAFT_KEY);
    router.push(`/clients/${result.client_id}`);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} /> New Client
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <h2 className="text-base font-semibold text-ink">New client</h2>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="flex gap-2">
                {(["individual", "business"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setClientType(t)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                      clientType === t
                        ? "border-accent bg-accentSoft text-accent"
                        : "border-border text-slate hover:bg-surfaceMuted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {clientType === "individual" ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    required
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ) : (
                <input
                  required
                  placeholder="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}

              {clientType === "individual" ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="SSN (optional, XXX-XX-XXXX)"
                    value={ssn}
                    onChange={(e) => setSsn(formatSsnOrItin(e.target.value))}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="ITIN (optional, XXX-XX-XXXX)"
                    value={itin}
                    onChange={(e) => setItin(formatSsnOrItin(e.target.value))}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ) : (
                <input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="EIN (optional, XX-XXXXXXX)"
                  value={ein}
                  onChange={(e) => setEin(formatEin(e.target.value))}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
              <p className="text-xs text-muted">Stored encrypted. Only staff with reveal permission can view the full number later.</p>

              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                type="tel"
                required
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Mailing address</p>
                <div className="mt-2 space-y-2">
                  <input
                    required
                    placeholder="Street"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      required
                      placeholder="City"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <input
                      required
                      placeholder="State"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <input
                      required
                      placeholder="ZIP"
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              {isBusiness && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Contact person</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <input
                      required
                      placeholder="First name"
                      value={contactFirstName}
                      onChange={(e) => setContactFirstName(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <input
                      required
                      placeholder="Last name"
                      value={contactLastName}
                      onChange={(e) => setContactLastName(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <select
                      value={contactTitle}
                      onChange={(e) => setContactTitle(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      {CONTACT_TITLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {contactTitle === "other" && (
                      <input
                        placeholder="Custom title"
                        value={contactCustomTitle}
                        onChange={(e) => setContactCustomTitle(e.target.value)}
                        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    )}
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate">
                    <input
                      type="checkbox"
                      checked={linkContactAsClient}
                      onChange={(e) => setLinkContactAsClient(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Give this contact their own client profile
                  </label>
                  {linkContactAsClient && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted">
                        They&apos;ll get a separate client record with their own client ID, kept apart from {businessName || "this business"}&apos;s.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="email"
                          required
                          placeholder="Contact's email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          onBlur={(e) => setContactEmail(e.target.value.trim().toLowerCase())}
                          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <input
                          type="tel"
                          placeholder="Contact's phone (optional)"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate">
                        <input
                          type="checkbox"
                          checked={contactInviteToPortal}
                          onChange={(e) => setContactInviteToPortal(e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        Invite this contact to the client portal (separate login)
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-border pt-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-muted">What do they need help with?</label>
                {serviceOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">No services are set up yet -- add one under Services first.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {serviceOptions.map((s) => (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          selectedServiceIds.includes(s.id) ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surfaceMuted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedServiceIds.includes(s.id)}
                          onChange={() => toggleService(s.id)}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-muted">
                  Same choices they&apos;d see picking a service themselves -- select everything that applies. Optional, and just notes interest
                  for now (no engagement is created yet).
                </p>
              </div>


              <div className="border-t border-border pt-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate">
                  <input type="checkbox" checked={inviteToPortal} onChange={(e) => setInviteToPortal(e.target.checked)} className="h-4 w-4 rounded border-border" />
                  Invite to client portal
                </label>
                {inviteToPortal && (
                  <p className="mt-2 text-xs text-muted">
                    We&apos;ll email {email || "the client"} a secure link to set up their portal login and password.
                    To change the wording of that email, go to Templates in the sidebar and edit &quot;Client Portal
                    Invite.&quot;
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create client"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {duplicateMatch && (
        <DuplicateClientModal
          matchedOn={duplicateMatch.matchedOn}
          existingClientId={duplicateMatch.existingClientId}
          onCancel={() => setDuplicateMatch(null)}
          onViewExisting={() => {
            saveClientDraft(DRAFT_KEY, currentDraft());
            router.push(`/clients/${duplicateMatch.existingClientId}`);
          }}
          onCreateAnyway={() => {
            setDuplicateMatch(null);
            void submit(true);
          }}
        />
      )}
    </>
  );
}
