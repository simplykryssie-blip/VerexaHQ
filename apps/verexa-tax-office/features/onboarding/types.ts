import type { Database } from "@/types/database";

export type WorkspaceType = Database["public"]["Enums"]["workspace_type"];

// platform_admin is a reserved internal type, never offered at signup.
export const SELECTABLE_WORKSPACE_TYPES: { value: WorkspaceType; label: string; description: string }[] = [
  {
    value: "independent_ptin",
    label: "Independent preparer",
    description: "You hold your own PTIN and want an independent workspace, with or without an ERO.",
  },
  {
    value: "ero_office",
    label: "Tax office / ERO office",
    description: "You run a tax office and act as (or work with) an Electronic Return Originator.",
  },
  {
    value: "service_bureau",
    label: "Service bureau",
    description: "You support multiple tax offices or a multi-office business.",
  },
];

export type OnboardingState = {
  // Step 2 — workspace type
  workspaceType: WorkspaceType | null;

  // Step 3 — business information
  officeName: string;
  legalName: string;
  dbaName: string;
  email: string;
  phone: string;
  website: string;
  timezone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  defaultTaxYear: number;
  preferredLanguage: string;

  // Step 4 — professional role
  credentialType: string;
  ptinLast4: string;
  isEro: boolean;
  statesServed: string[];

  // Step 6 — branding
  primaryColor: string;

  // Step 7 — services
  selectedServices: string[];

  // Step 8 — team setup (informational only at this stage)
  teamSize: string;

  // Step 9 — trial plan
  planCode: string;
};

export const DEFAULT_SERVICE_OPTIONS = [
  "Individual tax preparation",
  "Business tax preparation",
  "Bookkeeping",
  "Payroll",
  "Tax planning",
  "Business formation",
  "Compliance",
  "Consultation",
];

export function emptyOnboardingState(): OnboardingState {
  return {
    workspaceType: null,
    officeName: "",
    legalName: "",
    dbaName: "",
    email: "",
    phone: "",
    website: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    defaultTaxYear: new Date().getFullYear(),
    preferredLanguage: "en",
    credentialType: "",
    ptinLast4: "",
    isEro: false,
    statesServed: [],
    primaryColor: "#0f6656",
    selectedServices: [],
    teamSize: "just_me",
    planCode: "solo",
  };
}
