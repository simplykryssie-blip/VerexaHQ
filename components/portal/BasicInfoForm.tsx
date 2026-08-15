"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { US_STATES } from "@/lib/usStates";
import { AuthError, authStyles as styles } from "@/components/auth/AuthShell";

export type BasicInfoSnapshot = {
  client_type: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  date_of_birth: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
};

const inputClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function BasicInfoForm({ snapshot, next }: { snapshot: BasicInfoSnapshot; next: string }) {
  const router = useRouter();
  const supabase = createClient();
  const isBusiness = snapshot.client_type === "business";

  const [firstName, setFirstName] = useState(snapshot.first_name ?? "");
  const [lastName, setLastName] = useState(snapshot.last_name ?? "");
  const [businessName, setBusinessName] = useState(snapshot.business_name ?? "");
  const [email, setEmail] = useState(snapshot.primary_email ?? "");
  const [phone, setPhone] = useState(snapshot.primary_phone ?? "");
  const [street, setStreet] = useState(snapshot.mailing_street ?? "");
  const [city, setCity] = useState(snapshot.mailing_city ?? "");
  const [state, setState] = useState(snapshot.mailing_state ?? "");
  const [zip, setZip] = useState(snapshot.mailing_zip ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.rpc("submit_portal_basic_info", {
      p_first_name: isBusiness ? undefined : firstName.trim() || undefined,
      p_last_name: isBusiness ? undefined : lastName.trim() || undefined,
      p_business_name: isBusiness ? businessName.trim() || undefined : undefined,
      p_primary_email: email.trim() || undefined,
      p_primary_phone: phone.trim() || undefined,
      p_mailing_street: street.trim() || undefined,
      p_mailing_city: city.trim() || undefined,
      p_mailing_state: state.trim() || undefined,
      p_mailing_zip: zip.trim() || undefined,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className={styles.field}>
            <label htmlFor="first_name">First name</label>
            <input id="first_name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.field}>
            <label htmlFor="last_name">Last name</label>
            <input id="last_name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={styles.input} />
          </div>
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
        <div className="space-y-2">
          <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street address" className={inputClass} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={`${inputClass} sm:col-span-2`} />
            <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Zip code" className={inputClass} />
          </div>
        </div>
      </div>

      {error && <AuthError>{error}</AuthError>}

      <button type="submit" disabled={loading} className={styles.submit}>
        {loading && <span className={styles.spinner} />}
        {loading ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
