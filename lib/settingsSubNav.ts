// Shared sub-tab groups for Settings pages that used to be separate nav
// items but cover one topic -- rendered as a Tabs bar under each page's own
// header rather than merging their (quite different) data-fetching into one
// file. Keeps each page's own permission checks and layout untouched.
export const PROFILE_ACCOUNT_TABS = [
  { id: "profile", label: "Profile", href: "/settings/profile" },
  { id: "security", label: "Security", href: "/settings/security" },
  { id: "availability", label: "Availability", href: "/settings/availability" },
  { id: "notifications", label: "Notifications", href: "/settings/notifications" },
];

export const SERVICE_DELIVERY_TABS = [
  { id: "services", label: "Services", href: "/settings/services" },
  { id: "locations", label: "Locations", href: "/settings/locations" },
  { id: "tags", label: "Tags", href: "/settings/tags" },
];
