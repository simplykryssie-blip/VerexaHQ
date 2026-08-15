"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { AddressInput } from "@/components/AddressInput";
import { NameInput } from "@/components/NameInput";
import { parseAddressValue, parseNameValue, stringifyAddressValue, stringifyNameValue } from "@/lib/organizer/formatValue";
import { AuthError, authStyles as styles } from "@/components/auth/AuthShell";

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
  service_category_id: string | null;
  service_id: string | null;
};

type ServiceCategory = { id: string; name: string; services: { id: string; name: string }[] };

export function BasicInfoForm({ snapshot, next }: { snapshot: BasicInfoSnapshot; next: string }) {
  const router = useRouter();
  const supabase = createClient();
  const isBusiness = snapshot.client_type === "business";

  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(snapshot.service_category_id ?? "");
  const [selectedServiceId, setSelectedServiceId] = useState(snapshot.service_id ?? "");

  useEffect(() => {
    supabase.rpc("get_portal_service_options").then(({ data }) => {
      setServiceCategories((data as unknown as ServiceCategory[] | null) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCategory = serviceCategories.find((c) => c.id === selectedCategoryId) ?? null;

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
    if (!selectedCategoryId || !selectedServiceId) {
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
      p_service_category_id: selectedCategoryId,
      p_service_id: selectedServiceId,
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

      <div className={styles.field}>
        <label htmlFor="service_category">What do you need help with?</label>
        <select
          id="service_category"
          required
          value={selectedCategoryId}
          onChange={(e) => {
            setSelectedCategoryId(e.target.value);
            setSelectedServiceId("");
          }}
          className={styles.input}
        >
          <option value="">Select a category...</option>
          {serviceCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="service">Specifically?</label>
        <select
          id="service"
          required
          value={selectedServiceId}
          onChange={(e) => setSelectedServiceId(e.target.value)}
          disabled={!selectedCategory}
          className={styles.input}
        >
          <option value="">{selectedCategory ? "Select a service..." : "Choose a category first"}</option>
          {(selectedCategory?.services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <AuthError>{error}</AuthError>}

      <button type="submit" disabled={loading} className={styles.submit}>
        {loading && <span className={styles.spinner} />}
        {loading ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
