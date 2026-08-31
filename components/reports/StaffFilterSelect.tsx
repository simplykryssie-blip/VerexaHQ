"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function StaffFilterSelect({ staffOptions }: { staffOptions: { id: string; display_name: string | null }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div>
      <label className="block text-xs font-medium text-muted" htmlFor="report-staff">
        Assigned staff
      </label>
      <select
        id="report-staff"
        defaultValue={searchParams.get("staff") ?? ""}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set("staff", e.target.value);
          else params.delete("staff");
          router.replace(`${pathname}?${params.toString()}`);
        }}
        className="mt-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="">All staff</option>
        <option value="__unassigned__">Unassigned</option>
        {staffOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name ?? "Staff"}
          </option>
        ))}
      </select>
    </div>
  );
}
