// Regression coverage for the MKB "Customized Tax Refund Calculator" ($150)
// digital-product intake. Follows this repo's established convention for
// migration-heavy features (see contact-sharing-schema.test.ts): source-text
// assertions against the migration/route files themselves, since this suite
// runs without live DB credentials in CI, plus real unit tests for the
// pure client-side validation module (lib/digitalProductIntake/validation.ts)
// via React Testing Library-free logic testing (no component-rendering
// setup exists in this repo -- see partner-onboarding-application-form.test.ts).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isFieldActive, validateIntakeAnswers, type IntakeFieldDef } from "@/lib/digitalProductIntake/validation";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20261102120000_mkb_calculator_digital_product_intake.sql"),
  "utf8"
);
const webhookRoute = readFileSync(join(repoRoot, "app/api/digital-product-webhook/[token]/route.ts"), "utf8");
const uploadRoute = readFileSync(join(repoRoot, "app/api/digital-product-intake/[token]/upload/route.ts"), "utf8");
const uploadHelper = readFileSync(join(repoRoot, "lib/documents/uploadDigitalProductIntakeFile.ts"), "utf8");
const handlePurchase = readFileSync(join(repoRoot, "lib/stripe/handleDigitalProductPurchase.ts"), "utf8");

describe("architecture boundary -- no Firm/Workspace/Tax Client/Engagement/Partner/ERO creation", () => {
  it("never creates a firm, a second workspace, or a partner/ERO relationship anywhere in the migration", () => {
    expect(migration).not.toMatch(/insert into public\.firms\b/i);
    expect(migration).not.toMatch(/insert into public\.workspaces\b/i);
    expect(migration).not.toMatch(/insert into public\.firm_connections\b/i);
    expect(migration).not.toMatch(/insert into public\.partner_onboardings\b/i);
    expect(migration).not.toMatch(/insert into public\.partner_prospects\b/i);
  });

  it("never creates an engagement -- the lead only ever enters a pipeline as entity_type 'client'", () => {
    expect(migration).not.toMatch(/insert into public\.engagements\b/i);
    expect(migration).toContain("start_pipeline_run('client', v_client_id, v_product.target_process_id)");
  });

  it("the Contact Lead is the existing clients/lifecycle_status='lead' model via find_or_create_public_lead, not a new parallel table", () => {
    expect(migration).not.toMatch(/create table public\.(contact_leads|digital_product_leads|dpi_contacts)\b/i);
    expect(migration).toContain("public.find_or_create_public_lead(");
    // called from both the webhook-driven purchase recorder and the public
    // submission RPC -- both are the ONLY places a client_id is produced.
    const calls = migration.match(/public\.find_or_create_public_lead\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not reuse organizer infrastructure in any actual SQL statement (mentioning it in an explanatory comment is fine and expected)", () => {
    const codeOnly = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(codeOnly).not.toMatch(/organizer_templates|organizer_fields|organizer_responses/);
  });
});

describe("public RPC surface -- no client-suppliable internal/authorization fields", () => {
  it("get_public_digital_product_intake_form only ever takes a token", () => {
    const sig = migration.match(/create or replace function public\.get_public_digital_product_intake_form\(([^)]*)\)/);
    expect(sig?.[1].trim()).toBe("p_token uuid");
  });

  it("submit_digital_product_intake only ever takes a token and the answers blob -- no workspace_id/client_id/status/stripe ids", () => {
    const sig = migration.match(/create or replace function public\.submit_digital_product_intake\(([^)]*)\)/);
    expect(sig?.[1].replace(/\s+/g, " ").trim()).toBe("p_token uuid, p_answers jsonb");
  });

  it("record_verified_digital_product_purchase (the PAID entrypoint) is locked to service_role only -- never anon/authenticated", () => {
    const revoke = migration.match(/revoke all on function public\.record_verified_digital_product_purchase\([^)]*\) from ([^;]*);/);
    expect(revoke?.[1]).toContain("public");
    expect(revoke?.[1]).toContain("anon");
    expect(revoke?.[1]).toContain("authenticated");
    expect(migration).toMatch(/grant execute on function public\.record_verified_digital_product_purchase\([^)]*\) to service_role;/);
  });

  it("the two public form RPCs are granted to anon -- and only those two, plus nothing sensitive is granted to anon anywhere else in this file", () => {
    const anonGrants = [...migration.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to anon,? ?authenticated;/g)].map((m) => m[1]);
    expect(anonGrants.sort()).toEqual(["get_public_digital_product_intake_form", "submit_digital_product_intake"]);
  });
});

describe("file upload trust boundary", () => {
  it("submit_digital_product_intake rejects any file path that isn't under this workspace/form's own prefix", () => {
    expect(migration).toContain("v_path_prefix := v_form.workspace_id::text || '/' || v_form.id::text || '/';");
    expect(migration).toContain("if left(v_path, length(v_path_prefix)) <> v_path_prefix then");
    expect(migration).toContain('raise exception \'Invalid file reference for field "%"\', v_field.label;');
  });

  it("the upload endpoint resolves workspace_id/form_id from the server-side token lookup, never from the request body", () => {
    expect(uploadRoute).toContain('.eq("public_token", params.token)');
    expect(uploadRoute).toContain('.eq("status", "published")');
    expect(uploadRoute).not.toMatch(/workspace_id.*form\.get|form\.get\(.workspace_id.\)/);
  });

  it("the upload endpoint is rate-limited", () => {
    expect(uploadRoute).toContain("checkRateLimit(`dpi-upload:");
  });

  it("uploaded content is sniffed against its declared type, not trusted from the browser's Content-Type/extension alone", () => {
    expect(uploadHelper).toContain("sniffFileType(bytes, declaredType, textContent)");
    expect(uploadHelper).toContain("if (!accept.includes(declaredType))");
  });

  it("SVG uploads are checked against a script-injection deny-list", () => {
    expect(uploadHelper).toContain("containsSuspiciousSvgContent");
    expect(uploadHelper).toMatch(/<script/);
  });

  it("the storage bucket enforces its own size limit and MIME allowlist independent of the app layer", () => {
    expect(migration).toMatch(/insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)/);
    expect(migration).toContain("'digital-product-intake'");
  });
});

describe("disclaimer and acknowledgment", () => {
  it("the exact required disclaimer text is present verbatim", () => {
    expect(migration).toContain(
      "This calculator provides estimates for informational purposes only. Results are not a tax return, tax advice, or a guarantee of a refund or balance due."
    );
  });

  it("the estimate acknowledgment checkbox is required", () => {
    expect(migration).toMatch(/'estimate_acknowledgment', 'I understand that the calculator provides estimates only\.', 'checkbox_acknowledgment', null, null, null, true,/);
  });

  it("the client_approval checkbox is required and uses the exact authorization text", () => {
    expect(migration).toContain("I confirm that the information and materials I provided are accurate and that I authorize MKB Financial Group to use them to customize my tax refund calculator.");
  });

  it("submit_digital_product_intake enforces checkbox_acknowledgment fields as real booleans, not just non-empty strings", () => {
    expect(migration).toContain("if coalesce(p_answers ->> v_field.field_key, 'false') <> 'true' then");
  });
});

describe("pipeline -- 19 named stages, is_lead_funnel, entered at Paid", () => {
  const expectedStages = [
    "Paid",
    "Contact Lead Created/Updated",
    "Intake Sent",
    "Intake Submitted",
    "Intake Review",
    "Needs Information",
    "Email Request",
    "Waiting for Client",
    "Resubmitted",
    "Approved",
    "Customization In Progress",
    "Customization Complete",
    "Internal QA",
    "Corrections Needed",
    "Ready for Delivery",
    "Delivered",
    "Delivery Confirmation",
    "Follow-Up",
    "Completed",
  ];

  it("seeds exactly these 19 stages, in this order, for the MKB workspace", () => {
    for (const stage of expectedStages) {
      expect(migration).toContain(`'${stage}',`);
    }
    const stageBlock = migration.slice(
      migration.indexOf("insert into public.process_stages"),
      migration.indexOf("on conflict (id) do update set name = excluded.name, display_order")
    );
    const names = [...stageBlock.matchAll(/'([^']+)',\s*\d+\),?/g)].map((m) => m[1]);
    expect(names).toEqual(expectedStages);
  });

  it("is flagged is_lead_funnel = true and scoped to the MKB workspace id", () => {
    expect(migration).toContain("'Customized Tax Refund Calculator', 'customized-tax-refund-calculator', 'published', true)");
    expect(migration).toContain("'2896bf43-95db-420f-9bb5-8854f537bbd1'");
  });

  it("a verified purchase advances Paid -> Contact Lead Created/Updated -> Intake Sent synchronously", () => {
    expect(migration).toContain("_advance_digital_product_pipeline_stage(v_run_id, 'Contact Lead Created/Updated')");
    expect(migration).toContain("_advance_digital_product_pipeline_stage(v_run_id, 'Intake Sent')");
  });

  it("an intake submission advances the linked purchase's run to Intake Submitted", () => {
    expect(migration).toContain("_advance_digital_product_pipeline_stage(v_purchase_pipeline_run_id, 'Intake Submitted')");
  });

  it("the stage-advance helper never moves backward and is locked to service_role only", () => {
    expect(migration).toContain("if v_target_order <= v_current_order then\n    return;");
    expect(migration).toMatch(/revoke all on function public\._advance_digital_product_pipeline_stage\(uuid, text\) from public, anon, authenticated;/);
  });
});

describe("Stripe purchase entrypoint", () => {
  it("uses the exact existing Stripe identifiers for the $150 product, unaltered", () => {
    expect(migration).toContain("'prod_VMBCP0gCslkAgM', 'price_1ULSqePos8bgFzRfhZk83LOE', 'plink_1ULSvNPos8bgFzRfuY0N8cFa'");
    expect(migration).toContain("15000"); // $150.00 in cents
  });

  it("is idempotent on external_payment_id per workspace, matching the existing partner-purchase precedent", () => {
    expect(migration).toContain("digital_product_purchases_external_payment_uidx");
    expect(migration).toContain("on conflict (workspace_id, external_payment_id) where external_payment_id is not null do nothing");
  });

  it("the webhook route verifies the Stripe signature before ever touching purchase data", () => {
    const sigCheckIdx = webhookRoute.indexOf("verifyStripeSignature(");
    const rpcCallIdx = webhookRoute.indexOf("handleDigitalProductPurchaseCheckoutCompleted(");
    expect(sigCheckIdx).toBeGreaterThan(-1);
    expect(rpcCallIdx).toBeGreaterThan(sigCheckIdx);
  });

  it("only checkout.session.completed is handled; every other event type is a no-op", () => {
    expect(webhookRoute).toContain('if (event.type !== "checkout.session.completed")');
  });

  it("the digital product is matched by workspace-scoped payment_link id, and the workspace comes from the signed token -- never the request body", () => {
    expect(handlePurchase).toContain('.eq("workspace_id", workspaceId)');
    expect(handlePurchase).toContain('.eq("stripe_payment_link_id", session.payment_link)');
  });

  it("the $75 calculator's Stripe product id is never referenced anywhere in this pass", () => {
    expect(migration).not.toContain("prod_VMBCU4J5IZb61R");
    expect(handlePurchase).not.toContain("prod_VMBCU4J5IZb61R");
  });
});

describe("47-field intake form -- exact contact mapping and section structure", () => {
  const contactMappedKeys = ["first_name", "last_name", "email", "phone"];

  it("maps exactly first_name/last_name/email/phone to the Contact Lead -- nothing else", () => {
    const fieldsBlock = migration.slice(
      migration.indexOf("insert into public.digital_product_intake_fields ("),
      migration.indexOf("on conflict (form_id, field_key) do update set")
    );
    // contact_lead_map is the last column in every VALUES tuple, so a
    // mapped row ends in `, 'first_name'),` etc.
    const mappedValues = [...fieldsBlock.matchAll(/,\s*'(first_name|last_name|email|phone)'\),?$/gm)].map((m) => m[1]);
    expect(mappedValues.sort()).toEqual(contactMappedKeys.sort());
  });

  it("contains all 10 spec'd section names", () => {
    for (const section of [
      "Contact Information",
      "Your Brand",
      "Calculator Branding",
      "Client Lead Capture",
      "Call to Action",
      "CRM / Lead Delivery",
      "Calculator Experience",
      "Disclaimer & Client-Facing Language",
      "Customization Request",
      "Final Review",
    ]) {
      expect(migration).toContain(`'${section}',`);
    }
  });

  it("has exactly 48 field rows (47 spec'd items -- item 41 is split into a static disclaimer block plus its own required acknowledgment checkbox, since one static display block and one mandatory checkbox cannot be a single form control)", () => {
    const fieldsBlock = migration.slice(
      migration.indexOf("insert into public.digital_product_intake_fields ("),
      migration.indexOf("on conflict (form_id, field_key) do update set")
    );
    const rows = [...fieldsBlock.matchAll(/\('c4000000-0000-0000-0000-000000000001',/g)];
    expect(rows.length).toBe(48);
  });

  it("the logo upload is required and does not accept DOCX/PDF (image-only field)", () => {
    expect(migration).toContain(
      '\'{"accept":["image/png","image/jpeg","image/svg+xml"],"multiple":false,"max_files":1,"max_size_bytes":5242880}\'::jsonb'
    );
  });

  it("brand guidelines and additional reference uploads accept the broader PDF/PNG/JPG/SVG/DOCX set", () => {
    const broaderAccept =
      '"accept":["application/pdf","image/png","image/jpeg","image/svg+xml","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]';
    const occurrences = migration.split(broaderAccept).length - 1;
    expect(occurrences).toBe(2);
  });

  it("the redirect/booking URL field is conditionally required on 3 of the 5 post_submit_action options, not just one", () => {
    expect(migration).toContain(
      "array['Redirect them to my website','Redirect them to my booking page','Redirect them to another URL']"
    );
  });
});

describe("client-side validation module (lib/digitalProductIntake/validation.ts)", () => {
  const fields: IntakeFieldDef[] = [
    { field_key: "email", field_type: "email", label: "Email", is_required: true, conditional_on_field_key: null, conditional_on_values: null },
    {
      field_key: "redirect_booking_url",
      field_type: "url",
      label: "Redirect/Booking URL",
      is_required: true,
      conditional_on_field_key: "post_submit_action",
      conditional_on_values: ["Redirect them to my website", "Redirect them to my booking page", "Redirect them to another URL"],
    },
    { field_key: "logo_upload", field_type: "file_upload", label: "Logo", is_required: true, conditional_on_field_key: null, conditional_on_values: null },
    { field_key: "estimate_acknowledgment", field_type: "checkbox_acknowledgment", label: "Ack", is_required: true, conditional_on_field_key: null, conditional_on_values: null },
    { field_key: "disclaimer_notice", field_type: "static_disclaimer", label: "Disclaimer", is_required: false, conditional_on_field_key: null, conditional_on_values: null },
  ];

  it("an inactive conditional field is never required even if it's marked required, when its parent's condition is unmet", () => {
    expect(isFieldActive(fields[1], { post_submit_action: "Show results immediately" })).toBe(false);
    const result = validateIntakeAnswers(fields, { email: "a@b.com", logo_upload: ["x"], estimate_acknowledgment: "true" });
    expect(result.ok).toBe(true);
  });

  it("an active conditional field is required once its parent's condition is met", () => {
    expect(isFieldActive(fields[1], { post_submit_action: "Redirect them to my website" })).toBe(true);
    const result = validateIntakeAnswers(fields, {
      post_submit_action: "Redirect them to my website",
      email: "a@b.com",
      logo_upload: ["x"],
      estimate_acknowledgment: "true",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.redirect_booking_url).toBeDefined();
  });

  it("a missing required file_upload fails validation", () => {
    const result = validateIntakeAnswers(fields, { email: "a@b.com", estimate_acknowledgment: "true" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.logo_upload).toBeDefined();
  });

  it("an unchecked required acknowledgment fails validation", () => {
    const result = validateIntakeAnswers(fields, { email: "a@b.com", logo_upload: ["x"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.estimate_acknowledgment).toBeDefined();
  });

  it("a static_disclaimer field is never validated as required", () => {
    const result = validateIntakeAnswers(fields, { email: "a@b.com", logo_upload: ["x"], estimate_acknowledgment: "true" });
    expect(result.ok).toBe(true);
  });

  it("all fields required/active pass together", () => {
    const result = validateIntakeAnswers(fields, {
      email: "a@b.com",
      logo_upload: ["path/a.png"],
      estimate_acknowledgment: "true",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("the $75 calculator is untouched by this pass", () => {
  it("is not created, referenced, or wired to this intake form anywhere", () => {
    expect(migration).not.toMatch(/tax refund calculator\s*\(\s*\$?75/i);
    expect(migration).not.toContain("PURCHASE RECORDED");
    expect(migration).not.toContain("CALCULATOR DELIVERY");
  });
});
