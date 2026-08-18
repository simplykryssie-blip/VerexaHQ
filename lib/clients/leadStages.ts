// clients.lifecycle_status is a fixed enum enforced by the
// validate_client_lifecycle_status() trigger: 'lead' | 'active' | 'inactive'
// | 'archived' | 'lost'. There is no per-workspace catalog of granular lead
// sub-stages (the old lead_stages table backing one was dropped) -- 'lead'
// is the only "still open" stage; 'lost' is the terminal outcome handled
// separately wherever this is used.
export const LEAD_STAGES: { key: string; label: string }[] = [{ key: "lead", label: "Lead" }];
