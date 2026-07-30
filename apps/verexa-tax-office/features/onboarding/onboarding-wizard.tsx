"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import {
  DEFAULT_SERVICE_OPTIONS,
  SELECTABLE_WORKSPACE_TYPES,
  emptyOnboardingState,
  type OnboardingState,
} from "./types";
import { finalizeOnboarding } from "./finalize";

const STEP_LABELS = [
  "Welcome",
  "Workspace type",
  "Business information",
  "Professional role",
  "Office structure",
  "Branding",
  "Services",
  "Team setup",
  "Trial plan",
  "Complete",
];

type Plan = { code: string; name: string; description: string | null; monthly_price: number; trial_days: number };

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(emptyOnboardingState());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (step !== 8) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("subscription_plans")
        .select("code, name, description, monthly_price, trial_days")
        .eq("is_active", true)
        .order("monthly_price", { ascending: true });
      if (!cancelled && data) setPlans(data as Plan[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  function update<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === 1) return !!state.workspaceType;
    if (step === 2) return state.officeName.trim().length > 0;
    return true;
  }

  async function handleComplete() {
    setSubmitting(true);
    setError(null);
    const result = await finalizeOnboarding(state);
    setSubmitting(false);
    if (result.error) {
      setError(friendlyDbError(result.error));
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1400);
  }

  const isLastStep = step === STEP_LABELS.length - 1;

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>
            Step {step + 1} of {STEP_LABELS.length}
          </span>
          <span>{STEP_LABELS[step]}</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-gradient transition-all"
            style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 0 && <WelcomeStep />}
          {step === 1 && <WorkspaceTypeStep state={state} update={update} />}
          {step === 2 && <BusinessInfoStep state={state} update={update} />}
          {step === 3 && <ProfessionalRoleStep state={state} update={update} />}
          {step === 4 && <OfficeStructureStep state={state} />}
          {step === 5 && <BrandingStep state={state} update={update} />}
          {step === 6 && <ServicesStep state={state} update={update} />}
          {step === 7 && <TeamSetupStep state={state} update={update} />}
          {step === 8 && <TrialPlanStep state={state} update={update} plans={plans} />}
          {step === 9 && <CompletionStep state={state} done={done} />}

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || submitting || done}
            >
              Back
            </Button>
            {!isLastStep ? (
              <Button type="button" variant="brand" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()}>
                Continue
              </Button>
            ) : (
              <Button type="button" variant="brand" onClick={handleComplete} disabled={submitting || done}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {done ? (
                  <>
                    <Check className="h-4 w-4" /> All set
                  </>
                ) : (
                  "Finish setup"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <CardHeader className="p-0 mb-6">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

function WelcomeStep() {
  return (
    <div className="text-center py-6">
      <StepHeader
        title="Welcome to Verexa Tax Office"
        description="Let's set up your workspace. This takes about five minutes."
      />
      <p className="text-sm text-muted-foreground">
        You&apos;ll tell us a bit about your business, your professional role, and how you want your office
        set up. You can change all of this later in Settings.
      </p>
    </div>
  );
}

function WorkspaceTypeStep({
  state,
  update,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div>
      <StepHeader title="Choose your workspace type" description="This determines how your workspace is structured." />
      <div className="space-y-2">
        {SELECTABLE_WORKSPACE_TYPES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => update("workspaceType", opt.value)}
            className={`w-full text-left rounded-lg border p-4 transition-colors ${
              state.workspaceType === opt.value ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
            }`}
          >
            <div className="font-medium text-sm">{opt.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BusinessInfoStep({
  state,
  update,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div>
      <StepHeader title="Business information" description="Tell us about your business." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Office name" required>
          <Input value={state.officeName} onChange={(e) => update("officeName", e.target.value)} />
        </Field>
        <Field label="Legal name">
          <Input value={state.legalName} onChange={(e) => update("legalName", e.target.value)} />
        </Field>
        <Field label="DBA name">
          <Input value={state.dbaName} onChange={(e) => update("dbaName", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={state.email} onChange={(e) => update("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={state.phone} onChange={(e) => update("phone", e.target.value)} />
        </Field>
        <Field label="Website">
          <Input value={state.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Time zone">
          <Input value={state.timezone} onChange={(e) => update("timezone", e.target.value)} />
        </Field>
        <Field label="Preferred language">
          <Input value={state.preferredLanguage} onChange={(e) => update("preferredLanguage", e.target.value)} />
        </Field>
        <Field label="Default tax year">
          <Input
            type="number"
            value={state.defaultTaxYear}
            onChange={(e) => update("defaultTaxYear", Number(e.target.value) || new Date().getFullYear())}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <Field label="Address line 1">
          <Input value={state.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
        </Field>
        <Field label="Address line 2">
          <Input value={state.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={state.city} onChange={(e) => update("city", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="State">
            <Input value={state.state} onChange={(e) => update("state", e.target.value)} />
          </Field>
          <Field label="ZIP">
            <Input value={state.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function ProfessionalRoleStep({
  state,
  update,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  const states = state.statesServed.join(", ");
  return (
    <div>
      <StepHeader title="Your professional role" description="This is saved to your professional profile, not just this workspace." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Credential type">
          <Input
            value={state.credentialType}
            onChange={(e) => update("credentialType", e.target.value)}
            placeholder="PTIN holder, CPA, EA, Attorney…"
          />
        </Field>
        <Field label="PTIN — last 4 digits">
          <Input
            value={state.ptinLast4}
            maxLength={4}
            onChange={(e) => update("ptinLast4", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234"
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="States you serve (comma separated)">
          <Input
            value={states}
            onChange={(e) =>
              update(
                "statesServed",
                e.target.value
                  .split(",")
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean),
              )
            }
            placeholder="GA, FL, TX"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 mt-4 text-sm">
        <Checkbox checked={state.isEro} onCheckedChange={(v) => update("isEro", v === true)} />
        I am (or will act as) an Electronic Return Originator (ERO)
      </label>
    </div>
  );
}

function OfficeStructureStep({ state }: { state: OnboardingState }) {
  const summary = SELECTABLE_WORKSPACE_TYPES.find((t) => t.value === state.workspaceType);
  return (
    <div>
      <StepHeader title="Office structure" description="Confirm how your office operates." />
      <div className="rounded-lg border border-border p-4 text-sm">
        <div className="font-medium">{summary?.label ?? "Not selected"}</div>
        <p className="text-muted-foreground mt-1">{summary?.description}</p>
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        You can add ERO and service-bureau relationships, and invite additional office locations, later from
        Settings.
      </p>
    </div>
  );
}

function BrandingStep({
  state,
  update,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div>
      <StepHeader title="Branding" description="Pick a primary color for your workspace. You can add a logo later in Settings." />
      <Field label="Primary color">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={state.primaryColor}
            onChange={(e) => update("primaryColor", e.target.value)}
            className="h-10 w-14 rounded border border-input cursor-pointer"
          />
          <Input value={state.primaryColor} onChange={(e) => update("primaryColor", e.target.value)} className="w-32" />
        </div>
      </Field>
    </div>
  );
}

function ServicesStep({
  state,
  update,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  function toggle(name: string) {
    update(
      "selectedServices",
      state.selectedServices.includes(name)
        ? state.selectedServices.filter((s) => s !== name)
        : [...state.selectedServices, name],
    );
  }
  return (
    <div>
      <StepHeader title="Services you offer" description="Select the services your workspace provides. You can add custom services later." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DEFAULT_SERVICE_OPTIONS.map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm rounded-md border border-border p-2.5">
            <Checkbox checked={state.selectedServices.includes(name)} onCheckedChange={() => toggle(name)} />
            {name}
          </label>
        ))}
      </div>
    </div>
  );
}

function TeamSetupStep({
  state,
  update,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  const options: { value: string; label: string }[] = [
    { value: "just_me", label: "Just me for now" },
    { value: "small_team", label: "A small team (2–5 people)" },
    { value: "larger_team", label: "A larger team (6+ people)" },
  ];
  return (
    <div>
      <StepHeader title="Team setup" description="You'll invite teammates from Team settings after setup — this just helps us tailor your workspace." />
      <div className="space-y-2">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm rounded-md border border-border p-3">
            <input
              type="radio"
              name="teamSize"
              checked={state.teamSize === opt.value}
              onChange={() => update("teamSize", opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TrialPlanStep({
  state,
  update,
  plans,
}: {
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
  plans: Plan[];
}) {
  return (
    <div>
      <StepHeader title="Start your trial" description="Every plan includes a 30-day trial. No card required." />
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading plans…</p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <button
              key={plan.code}
              type="button"
              onClick={() => update("planCode", plan.code)}
              className={`w-full text-left rounded-lg border p-4 transition-colors ${
                state.planCode === plan.code ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{plan.name}</div>
                <div className="text-sm font-semibold">${plan.monthly_price}/mo</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
              <p className="text-xs text-muted-foreground mt-1">{plan.trial_days}-day free trial</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompletionStep({ state, done }: { state: OnboardingState; done: boolean }) {
  return (
    <div className="text-center py-6">
      <StepHeader
        title={done ? "You're all set!" : "Ready to create your workspace"}
        description={
          done
            ? "Taking you to your dashboard…"
            : `We'll create "${state.officeName || "your workspace"}" and start your trial.`
        }
      />
      {!done && (
        <p className="text-sm text-muted-foreground">Click Finish setup below to create your workspace.</p>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
