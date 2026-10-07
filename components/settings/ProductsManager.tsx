"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type ProductRow = {
  id: string;
  product_type: string;
  name: string | null;
  description: string | null;
  price: number | null;
  audience: string | null;
  status: string | null;
};

type ProductTypeFilter = "all" | "package" | "digital_product" | "service";

const TYPE_LABELS: Record<string, string> = {
  package: "Package",
  digital_product: "Digital Product",
  service: "Service",
};

const AUDIENCE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "independent_ptin", label: "PTIN" },
  { value: "ero_office", label: "ERO" },
  { value: "service_bureau", label: "Service Bureau" },
];

const inputClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

function ProductCard({ product }: { product: ProductRow }) {
  const editHref = product.product_type === "service" ? `/settings/services/${product.id}` : `/settings/packages/${product.id}`;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate">{product.name}</p>
            <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[11px] font-medium text-muted">
              {TYPE_LABELS[product.product_type] ?? product.product_type}
            </span>
          </div>
          {product.description && <p className="mt-1 text-sm text-muted">{product.description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-surfaceMuted px-2.5 py-1 text-xs font-medium capitalize text-ink">{product.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate">
        {product.price != null && <span className="rounded-lg bg-surfaceMuted px-2.5 py-1 font-medium">${product.price}</span>}
        {product.audience && <span className="rounded-lg bg-surfaceMuted px-2.5 py-1 font-medium">Audience: {product.audience.replace(/_/g, " ")}</span>}
      </div>
      <div className="mt-3">
        <Link href={editHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
          <Pencil size={13} /> Edit
        </Link>
      </div>
    </div>
  );
}

function NewProductForm({
  workspaceId,
  canCreatePackage,
  canCreateDigitalProduct,
  onCreated,
}: {
  workspaceId: string;
  canCreatePackage: boolean;
  canCreateDigitalProduct: boolean;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const initialType = canCreateDigitalProduct ? "digital_product" : canCreatePackage ? "package" : "digital_product";
  const [productType, setProductType] = useState<"digital_product" | "package">(initialType);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [audience, setAudience] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [billingCadence, setBillingCadence] = useState("one_time");
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("firm_packages").insert({
      workspace_id: workspaceId,
      name: name.trim(),
      description: description.trim() || null,
      product_type: productType,
      flat_price: price.trim() ? Number(price) : null,
      billing_cadence: price.trim() ? billingCadence : null,
      audience: audience || null,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Product created", "success");
    onCreated();
  }

  return (
    <form onSubmit={create} className="rounded-2xl border border-dashed border-border bg-surfaceMuted p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">New product</p>

      <label className={`${labelClass} mt-3`}>
        Product type
        <select value={productType} onChange={(e) => setProductType(e.target.value as "digital_product" | "package")} className={inputClass}>
          {canCreateDigitalProduct && <option value="digital_product">Digital Product</option>}
          {canCreatePackage && <option value="package">Package</option>}
        </select>
      </label>

      <label className={`${labelClass} mt-3`}>
        Product name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tax Season Survival Guide" className={inputClass} />
      </label>

      <label className={`${labelClass} mt-3`}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Price ($)
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Audience
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className={inputClass}>
            {AUDIENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-3 text-xs font-medium text-accent hover:underline"
      >
        {showAdvanced ? "Hide advanced settings" : "Advanced settings"}
      </button>

      {showAdvanced && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Billing cadence
            <select value={billingCadence} onChange={(e) => setBillingCadence(e.target.value)} disabled={!price.trim()} className={inputClass}>
              <option value="one_time">One time</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Creating..." : "Create product"}
      </button>
    </form>
  );
}

export function ProductsManager({
  workspaceId,
  products,
  canManage,
  canCreatePackage,
  canCreateDigitalProduct,
}: {
  workspaceId: string;
  products: ProductRow[];
  canManage: boolean;
  canCreatePackage: boolean;
  canCreateDigitalProduct: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ProductTypeFilter>("all");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => (filter === "all" ? products : products.filter((p) => p.product_type === filter)), [products, filter]);

  const tabs: { key: ProductTypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "package", label: "Package" },
    { key: "digital_product", label: "Digital Product" },
    { key: "service", label: "Service" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full bg-surfaceMuted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filter === tab.key ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {canManage && (canCreatePackage || canCreateDigitalProduct) && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            <Plus size={14} /> Add product
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4">
          <NewProductForm
            workspaceId={workspaceId}
            canCreatePackage={canCreatePackage}
            canCreateDigitalProduct={canCreateDigitalProduct}
            onCreated={() => {
              setCreating(false);
              router.refresh();
            }}
          />
          <p className="mt-2 text-xs text-muted">
            Selling a Service instead? Services keep their own setup (organizer, documents, booking) --{" "}
            <Link href="/settings/services" className="text-accent hover:underline">
              create one from Services
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {filtered.length === 0 && <p className="text-sm text-muted">No products yet in this category.</p>}
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
