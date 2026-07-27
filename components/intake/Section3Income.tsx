"use client";

import { Plus, Trash2 } from "lucide-react";
import { Card, SubHeading, TextField, NumberField, YesNo, Checkbox } from "./fields";
import { getBool, getStr, getArray, type AnyRecord } from "@/lib/intakeAnswers";

const INCOME_SOURCES = [
  { key: "w2", label: "W-2 wages" },
  { key: "self_employment", label: "Self-employment / 1099" },
  { key: "k1", label: "Partnership / S-corp / trust (K-1)" },
  { key: "rental", label: "Rental income" },
  { key: "retirement", label: "Retirement distributions" },
  { key: "social_security", label: "Social Security" },
  { key: "unemployment", label: "Unemployment" },
  { key: "investments", label: "Investment income" },
  { key: "stock_sales", label: "Stock / asset sales" },
  { key: "interest_dividends", label: "Interest & dividends" },
  { key: "crypto", label: "Cryptocurrency / digital assets" },
  { key: "foreign_income", label: "Foreign income" },
];

function emptyBusiness(): AnyRecord {
  return {
    name: "", ein: "", address: "", activity: "", start_date: "", closure_date: "",
    accounting_method: "", mileage: false, home_office: false, inventory: false,
    employees: false, contractors: false, payment_processor_forms: false,
    prior_depreciation: false, bookkeeping_status: "", estimated_payments: false,
  };
}
function emptyRental(): AnyRecord {
  return {
    address: "", ownership_pct: 100, rental_dates: "", personal_use_days: 0,
    property_manager: false, short_term: false, sale_or_conversion: false, prior_depreciation: false,
  };
}

export function Section3Income({ answers, setAnswer }: { answers: AnyRecord; setAnswer: (path: string[], value: unknown) => void }) {
  const incomeSources = getArray<string>(answers, ["income_sources"]);
  const has = (k: string) => incomeSources.includes(k);

  function toggleSource(key: string) {
    setAnswer(["income_sources"], has(key) ? incomeSources.filter((k) => k !== key) : [...incomeSources, key]);
    if (key === "crypto") setAnswer(["has_cryptocurrency"], !has(key));
    if (key === "foreign_income") setAnswer(["has_foreign_income"], !has(key));
  }

  const w2 = (answers.w2_detail as AnyRecord) || {};
  const se = (answers.self_employment_detail as AnyRecord) || {};
  const businesses = getArray<AnyRecord>(se, ["businesses"]);
  const bizOwnership = (answers.business_ownership as AnyRecord) || {};
  const rentals = getArray<AnyRecord>(answers, ["rentals"]);
  const investments = (answers.investments_detail as AnyRecord) || {};
  const crypto = (answers.crypto_detail as AnyRecord) || {};
  const retirement = (answers.retirement_detail as AnyRecord) || {};
  const ss = (answers.social_security_detail as AnyRecord) || {};
  const unemployment = (answers.unemployment_detail as AnyRecord) || {};
  const intDiv = (answers.interest_dividends_detail as AnyRecord) || {};
  const other = (answers.other_income as AnyRecord) || {};

  function updateSelfEmploymentFlags(nextBusinesses: AnyRecord[]) {
    setAnswer(["self_employment_detail", "businesses"], nextBusinesses);
    setAnswer(["business_count"], nextBusinesses.length);
    setAnswer(["self_employment_detail", "any_mileage"], nextBusinesses.some((b) => b.mileage));
    setAnswer(["self_employment_detail", "any_home_office"], nextBusinesses.some((b) => b.home_office));
    setAnswer(["self_employment_detail", "any_prior_depreciation"], nextBusinesses.some((b) => b.prior_depreciation));
  }
  function updateBusiness(i: number, key: string, value: unknown) {
    const next = businesses.slice();
    next[i] = { ...next[i], [key]: value };
    updateSelfEmploymentFlags(next);
  }
  function updateRentals(next: AnyRecord[]) {
    setAnswer(["rentals"], next);
    setAnswer(["rental_count"], next.length);
    setAnswer(["rentals_summary", "any_prior_depreciation"], next.some((r) => r.prior_depreciation));
  }
  function updateRental(i: number, key: string, value: unknown) {
    const next = rentals.slice();
    next[i] = { ...next[i], [key]: value };
    updateRentals(next);
  }

  return (
    <div className="space-y-4">
      <SubHeading title="Income sources" />
      <Card>
        <p className="text-sm text-muted mb-2">Select everything that applies to your tax year.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {INCOME_SOURCES.map((s) => (
            <Checkbox key={s.key} label={s.label} checked={has(s.key)} onChange={() => toggleSource(s.key)} />
          ))}
        </div>
      </Card>

      {has("w2") && (
        <Card>
          <SubHeading title="W-2 wages" />
          <NumberField label="Number of employers" value={Number(w2.employer_count || 0)} onChange={(v) => setAnswer(["w2_detail", "employer_count"], v)} />
          <div className="mt-2 divide-y divide-line">
            <YesNo label="Worked in more than one state" value={getBool(w2, ["multi_state"])} onChange={(v) => setAnswer(["w2_detail", "multi_state"], v)} />
            <YesNo label="Have unreimbursed employee expenses" value={getBool(w2, ["unreimbursed_expenses"])} onChange={(v) => setAnswer(["w2_detail", "unreimbursed_expenses"], v)} />
            <YesNo label="Clergy income" value={getBool(w2, ["clergy"])} onChange={(v) => setAnswer(["w2_detail", "clergy"], v)} />
            <YesNo label="Military income" value={getBool(w2, ["military"])} onChange={(v) => setAnswer(["w2_detail", "military"], v)} />
            <YesNo label="Paid a household employee (nanny, caregiver, etc.)" value={getBool(w2, ["household_employee"])} onChange={(v) => setAnswer(["w2_detail", "household_employee"], v)} />
            <YesNo label="Any employer based outside the U.S." value={getBool(w2, ["foreign_employer"])} onChange={(v) => setAnswer(["w2_detail", "foreign_employer"], v)} />
          </div>
        </Card>
      )}

      {has("self_employment") && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <SubHeading title="Self-employment / businesses" />
            <button type="button" onClick={() => updateSelfEmploymentFlags([...businesses, emptyBusiness()])} className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
              <Plus size={14} /> Add business
            </button>
          </div>
          {businesses.length === 0 && <p className="text-sm text-muted">No businesses added yet.</p>}
          <div className="space-y-4">
            {businesses.map((b, i) => (
              <div key={i} className="border border-line rounded-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted">Business {i + 1}</span>
                  <button type="button" onClick={() => updateSelfEmploymentFlags(businesses.filter((_, idx) => idx !== i))} className="text-brick" aria-label="Remove business">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Business name" value={String(b.name || "")} onChange={(v) => updateBusiness(i, "name", v)} />
                  <TextField label="EIN (if applicable)" value={String(b.ein || "")} onChange={(v) => updateBusiness(i, "ein", v)} />
                  <TextField label="Business address" value={String(b.address || "")} onChange={(v) => updateBusiness(i, "address", v)} />
                  <TextField label="Business activity" value={String(b.activity || "")} onChange={(v) => updateBusiness(i, "activity", v)} />
                  <TextField label="Start date (if new)" type="date" value={String(b.start_date || "")} onChange={(v) => updateBusiness(i, "start_date", v)} />
                  <TextField label="Closure date (if closed)" type="date" value={String(b.closure_date || "")} onChange={(v) => updateBusiness(i, "closure_date", v)} />
                  <TextField label="Accounting method" value={String(b.accounting_method || "")} onChange={(v) => updateBusiness(i, "accounting_method", v)} placeholder="Cash, accrual…" />
                  <TextField label="Bookkeeping status" value={String(b.bookkeeping_status || "")} onChange={(v) => updateBusiness(i, "bookkeeping_status", v)} placeholder="Up to date, needs cleanup…" />
                </div>
                <div className="mt-1 divide-y divide-line">
                  <YesNo label="Have income records" value={!!b.income_records} onChange={(v) => updateBusiness(i, "income_records", v)} />
                  <YesNo label="Have expense records" value={!!b.expense_records} onChange={(v) => updateBusiness(i, "expense_records", v)} />
                  <YesNo label="Track business mileage" value={!!b.mileage} onChange={(v) => updateBusiness(i, "mileage", v)} />
                  <YesNo label="Claim a home office" value={!!b.home_office} onChange={(v) => updateBusiness(i, "home_office", v)} />
                  <YesNo label="Carry inventory" value={!!b.inventory} onChange={(v) => updateBusiness(i, "inventory", v)} />
                  <YesNo label="Have employees" value={!!b.employees} onChange={(v) => updateBusiness(i, "employees", v)} />
                  <YesNo label="Use contractors" value={!!b.contractors} onChange={(v) => updateBusiness(i, "contractors", v)} />
                  <YesNo label="Received payment-processor forms (1099-K, etc.)" value={!!b.payment_processor_forms} onChange={(v) => updateBusiness(i, "payment_processor_forms", v)} />
                  <YesNo label="Has prior-year depreciation to continue" value={!!b.prior_depreciation} onChange={(v) => updateBusiness(i, "prior_depreciation", v)} />
                  <YesNo label="Made estimated tax payments for this business" value={!!b.estimated_payments} onChange={(v) => updateBusiness(i, "estimated_payments", v)} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-line">
            <YesNo
              label="Bookkeeping needs cleanup before this return can be prepared"
              value={getBool(answers, ["bookkeeping_cleanup_needed"])}
              onChange={(v) => setAnswer(["bookkeeping_cleanup_needed"], v)}
            />
          </div>
        </Card>
      )}

      {has("k1") && (
        <Card>
          <SubHeading title="Business ownership" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField label="Entity type" value={getStr(bizOwnership, ["entity_type"])} onChange={(v) => setAnswer(["business_ownership", "entity_type"], v)} placeholder="Partnership, S-corp, trust…" />
            <TextField label="Ownership percentage" value={getStr(bizOwnership, ["ownership_pct"])} onChange={(v) => setAnswer(["business_ownership", "ownership_pct"], v)} />
          </div>
          <div className="mt-2 divide-y divide-line">
            <YesNo label="Expecting a K-1" value={getBool(bizOwnership, ["k1_expected"])} onChange={(v) => setAnswer(["business_ownership", "k1_expected"], v)} />
            <YesNo label="Have basis information available" value={getBool(bizOwnership, ["basis_info"])} onChange={(v) => setAnswer(["business_ownership", "basis_info"], v)} />
            <YesNo label="Made capital contributions this year" value={getBool(bizOwnership, ["capital_contributions"])} onChange={(v) => setAnswer(["business_ownership", "capital_contributions"], v)} />
            <YesNo label="Received distributions" value={getBool(bizOwnership, ["distributions"])} onChange={(v) => setAnswer(["business_ownership", "distributions"], v)} />
            <YesNo label="Have loans to/from the business" value={getBool(bizOwnership, ["loans"])} onChange={(v) => setAnswer(["business_ownership", "loans"], v)} />
            <YesNo label="Business was sold or closed this year" value={getBool(bizOwnership, ["sale_or_closure"])} onChange={(v) => setAnswer(["business_ownership", "sale_or_closure"], v)} />
          </div>
        </Card>
      )}

      {has("rental") && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <SubHeading title="Rental properties" />
            <button type="button" onClick={() => updateRentals([...rentals, emptyRental()])} className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1">
              <Plus size={14} /> Add property
            </button>
          </div>
          {rentals.length === 0 && <p className="text-sm text-muted">No rental properties added yet.</p>}
          <div className="space-y-4">
            {rentals.map((p, i) => (
              <div key={i} className="border border-line rounded-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted">Property {i + 1}</span>
                  <button type="button" onClick={() => updateRentals(rentals.filter((_, idx) => idx !== i))} className="text-brick" aria-label="Remove property">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Property address" value={String(p.address || "")} onChange={(v) => updateRental(i, "address", v)} />
                  <NumberField label="Ownership %" value={Number(p.ownership_pct ?? 100)} onChange={(v) => updateRental(i, "ownership_pct", v)} />
                  <TextField label="Rental dates" value={String(p.rental_dates || "")} onChange={(v) => updateRental(i, "rental_dates", v)} placeholder="All year, Jun–Dec…" />
                  <NumberField label="Personal-use days" value={Number(p.personal_use_days || 0)} onChange={(v) => updateRental(i, "personal_use_days", v)} />
                </div>
                <div className="mt-1 divide-y divide-line">
                  <YesNo label="Have income records" value={!!p.income} onChange={(v) => updateRental(i, "income", v)} />
                  <YesNo label="Have expense records" value={!!p.expenses} onChange={(v) => updateRental(i, "expenses", v)} />
                  <YesNo label="Made improvements this year" value={!!p.improvements} onChange={(v) => updateRental(i, "improvements", v)} />
                  <YesNo label="Uses a property manager" value={!!p.property_manager} onChange={(v) => updateRental(i, "property_manager", v)} />
                  <YesNo label="Short-term rental (Airbnb, VRBO, etc.)" value={!!p.short_term} onChange={(v) => updateRental(i, "short_term", v)} />
                  <YesNo label="Sold or converted to personal use this year" value={!!p.sale_or_conversion} onChange={(v) => updateRental(i, "sale_or_conversion", v)} />
                  <YesNo label="Has prior-year depreciation to continue" value={!!p.prior_depreciation} onChange={(v) => updateRental(i, "prior_depreciation", v)} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(has("investments") || has("stock_sales")) && (
        <Card>
          <SubHeading title="Investments" />
          <div className="divide-y divide-line">
            <YesNo label="Have one or more brokerage accounts" value={getBool(investments, ["brokerage_accounts"])} onChange={(v) => setAnswer(["investments_detail", "brokerage_accounts"], v)} />
            <YesNo label="Sold stock this year" value={getBool(investments, ["stock_sales"])} onChange={(v) => setAnswer(["investments_detail", "stock_sales"], v)} />
            <YesNo label="Have cost-basis records" value={getBool(investments, ["cost_basis"])} onChange={(v) => setAnswer(["investments_detail", "cost_basis"], v)} />
            <YesNo label="Received employee stock (RSUs, options, ESPP)" value={getBool(investments, ["employee_stock"])} onChange={(v) => setAnswer(["investments_detail", "employee_stock"], v)} />
            <YesNo label="Had worthless securities" value={getBool(investments, ["worthless_securities"])} onChange={(v) => setAnswer(["investments_detail", "worthless_securities"], v)} />
            <YesNo label="May have wash sales" value={getBool(investments, ["wash_sales"])} onChange={(v) => setAnswer(["investments_detail", "wash_sales"], v)} />
          </div>
        </Card>
      )}

      {has("crypto") && (
        <Card>
          <SubHeading title="Cryptocurrency / digital assets" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {["bought", "sold", "exchanged", "mined", "staked", "received_as_payment", "airdrops", "nfts"].map((k) => (
              <Checkbox
                key={k}
                label={k.replace(/_/g, " ")}
                checked={getBool(crypto, [k])}
                onChange={(v) => setAnswer(["crypto_detail", k], v)}
              />
            ))}
          </div>
          <div className="mt-2">
            <YesNo label="Exchange/wallet reports available" value={getBool(crypto, ["reports_available"])} onChange={(v) => setAnswer(["crypto_detail", "reports_available"], v)} />
          </div>
        </Card>
      )}

      {has("retirement") && (
        <Card>
          <SubHeading title="Retirement income" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {["pension", "ira", "k401", "early_withdrawal", "rollover", "roth_conversion", "rmd", "disability_retirement"].map((k) => (
              <Checkbox key={k} label={k.replace(/_/g, " ")} checked={getBool(retirement, [k])} onChange={(v) => setAnswer(["retirement_detail", k], v)} />
            ))}
          </div>
        </Card>
      )}

      {has("social_security") && (
        <Card>
          <SubHeading title="Social Security" />
          <div className="divide-y divide-line">
            <YesNo label="You received benefits" value={getBool(ss, ["taxpayer"])} onChange={(v) => setAnswer(["social_security_detail", "taxpayer"], v)} />
            <YesNo label="Spouse received benefits" value={getBool(ss, ["spouse"])} onChange={(v) => setAnswer(["social_security_detail", "spouse"], v)} />
            <YesNo label="A dependent received benefits" value={getBool(ss, ["dependent"])} onChange={(v) => setAnswer(["social_security_detail", "dependent"], v)} />
          </div>
        </Card>
      )}

      {has("unemployment") && (
        <Card>
          <SubHeading title="Unemployment" />
          <TextField label="State" value={getStr(unemployment, ["state"])} onChange={(v) => setAnswer(["unemployment_detail", "state"], v)} />
          <div className="mt-2">
            <YesNo label="Had tax withheld from benefits" value={getBool(unemployment, ["withholding"])} onChange={(v) => setAnswer(["unemployment_detail", "withholding"], v)} />
          </div>
        </Card>
      )}

      {has("interest_dividends") && (
        <Card>
          <SubHeading title="Interest & dividends" />
          <div className="divide-y divide-line">
            <YesNo label="From one or more banks" value={getBool(intDiv, ["banks"])} onChange={(v) => setAnswer(["interest_dividends_detail", "banks"], v)} />
            <YesNo label="From a brokerage account" value={getBool(intDiv, ["brokerage"])} onChange={(v) => setAnswer(["interest_dividends_detail", "brokerage"], v)} />
            <YesNo label="From a foreign account" value={getBool(intDiv, ["foreign_accounts"])} onChange={(v) => setAnswer(["interest_dividends_detail", "foreign_accounts"], v)} />
            <YesNo label="Includes tax-exempt interest" value={getBool(intDiv, ["tax_exempt"])} onChange={(v) => setAnswer(["interest_dividends_detail", "tax_exempt"], v)} />
            <YesNo label="Includes nominee interest" value={getBool(intDiv, ["nominee"])} onChange={(v) => setAnswer(["interest_dividends_detail", "nominee"], v)} />
          </div>
        </Card>
      )}

      <Card>
        <SubHeading title="Other income" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {[
            ["gambling", "Gambling winnings"], ["alimony_received", "Alimony received"], ["prizes", "Prizes or awards"],
            ["jury_duty", "Jury duty pay"], ["scholarships", "Scholarships / fellowships"], ["cancellation_of_debt", "Cancellation of debt"],
            ["lawsuit_settlements", "Lawsuit settlements"], ["royalties", "Royalties"], ["hobby", "Hobby income"],
            ["bartering", "Bartering"], ["crowdfunding", "Crowdfunding"], ["personal_property_rental", "Rental of personal property"],
            ["tips", "Unreported tips"], ["cash_income", "Cash income"], ["other", "Other income"],
          ].map(([k, label]) => (
            <Checkbox key={k} label={label} checked={getBool(other, [k])} onChange={(v) => setAnswer(["other_income", k], v)} />
          ))}
        </div>
        {getBool(other, ["other"]) && (
          <div className="mt-2">
            <TextField label="Describe the other income" value={getStr(other, ["other_description"])} onChange={(v) => setAnswer(["other_income", "other_description"], v)} />
          </div>
        )}
      </Card>
    </div>
  );
}
