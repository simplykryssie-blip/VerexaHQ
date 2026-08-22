"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { AddressInput } from "@/components/AddressInput";
import { NameInput } from "@/components/NameInput";
import { parseAddressValue, parseNameValue, stringifyAddressValue, stringifyNameValue } from "@/lib/organizer/formatValue";
import { AuthError, authStyles as styles } from "@/components/auth/AuthShell";
import { useToast } from "@/components/Toast";

export type BasicInfoSnapshot = {
  client_type: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  date_of_birth: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  service_ids: string[] | null;
};

type ServiceCategory = { id: string; name: string; services: { id: string; name: string }[] };
type ServiceOption = { id: string; name: string };

// mode "onboarding" is the one-time gate a client can't get past until it's
// submitted (portal/basic-info): the service picker is required, and
// success moves them on to `next`. mode "profile" is the ongoing "review
// your info" card on the Profile page: no service picker (already asked
// once, and re-asking on every visit would be noise), success just toasts
// and refreshes in place.
export function BasicInfoForm({
  snapshot,
  next,
  mode = "onboarding",
}: {
  snapshot: BasicInfoSnapshot;
  next?: string;
  mode?: "onboarding" | "profile";
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const isBusiness = snapshot.client_type === "business";
  const isProfile = mode === "profile";

  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(snapshot.service_ids ?? []);

  useEffect(() => {
    if (isProfile) return;
    supabase.rpc("get_portal_service_options").then(({ data }) => {
      setServiceCategories((data as unknown as ServiceCategory[] | null) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flat, since services are now "basic" (one per organizer) -- there's no
  // more sub-service layer to cascade through at intake.
  const serviceOptions: ServiceOption[] = serviceCategories.flatMap((c) => c.services);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const [name, setName] = useState(
    stringifyNameValue({
      first: snapshot.first_name ?? "",
      middle: snapshot.middle_name ?? "",
      last: snapshot.last_name ?? "",
      suffix: snapshot.suffix ?? "",
    })
  );
  const [businessName, setBusinessName] = useState(snapshot.business_name ?? "");
  const [email, setEmail] = useState(snapshot.primary_email ?? "");
  const [phone, setPhone] = useState(snapshot.primary_phone ?? "");
  const [address, setAddress] = useState(
    stringifyAddressValue({
      street: snapshot.mailing_street ?? "",
      street2: "",
      city: snapshot.mailing_city ?? "",
      state: snapshot.mailing_state ?? "",
      zip: snapshot.mailing_zip ?? "",
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nameParts = parseNameValue(name);
    if (!isBusiness && (!nameParts.first.trim() || !nameParts.last.trim())) {
      setError("First and last name are required.");
      return;
    }
    if (!isProfile && selectedServiceIds.length === 0) {
      setError("Let us know what service you're interested in.");
      return;
    }
    setLoading(true);

    const addressParts = parseAddressValue(address);

    const { error } = await supabase.rpc("submit_portal_basic_info", {
      p_first_name: isBusiness ? undefined : nameParts.first.trim() || undefined,
      p_middle_name: isBusiness ? undefined : nameParts.middle.trim() || undefined,
      p_last_name: isBusiness ? undefined : nameParts.last.trim() || undefined,
      p_suffix: isBusiness ? undefined : nameParts.suffix.trim() || undefined,
      p_business_name: isBusiness ? businessName.trim() || undefined : undefined,
      p_primary_email: email.trim() || undefined,
      p_primary_phone: phone.trim() || undefined,
      p_mailing_street: addressParts.street.trim() || undefined,
      p_mailing_city: addressParts.city.trim() || undefined,
      p_mailing_state: addressParts.state.trim() || undefined,
      p_mailing_zip: addressParts.zip.trim() || undefined,
      p_service_ids: isProfile ? undefined : selectedServiceIds,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (isProfile) {
      toast.show("Info updated. Changes to anything already on file will need your firm's approval before they take effect.", "success");
      router.refresh();
      return;
    }
    router.push(next!);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {isBusiness ? (
        <div className={styles.field}>
          <label htmlFor="business_name">Business name</label>
          <input
            id="business_name"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={styles.input}
          />
        </div>
      ) : (
        <div className={styles.field}>
          <label>Name</label>
          <NameInput value={name} onChange={setName} />
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} />
      </div>

      <div className={styles.field}>
        <label htmlFor="phone">Phone</label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className={styles.input} />
      </div>

      <div className={styles.field}>
        <label>Mailing address</label>
        <AddressInput value={address} onChange={setAddress} />
      </div>

      {!isProfile && (
        <div className={styles.field}>
          <label>What do you need help with?</label>
          <p className="text-xs text-muted">Select everything that applies -- you can pick more than one.</p>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        </div>
      )}

      {error && <AuthError>{error}</AuthError>}

      <button type="submit" disabled={loading} className={styles.submit}>
        {loading && <span className={styles.spinner} />}
        {loading ? "Saving…" : isProfile ? "Save changes" : "Continue"}
      </button>
    </form>
  );
}
