import Link from "next/link";
import { UserPlus2 } from "lucide-react";

export default function PlatformManagementPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Platform Management</h1>
      <p className="mt-1 text-sm text-muted">
        Cross-workspace platform programs. Hidden from firm users.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/platform/early-access"
          className="rounded-2xl border border-line bg-white p-5 transition hover:border-[#108A64]"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[#108A64]">
            <UserPlus2 size={20} />
          </div>
          <h2 className="mt-4 font-bold text-ink">Early Access</h2>
          <p className="mt-1 text-sm text-muted">
            Applications, invitations, agreements, bug reports, feature requests,
            announcements, and surveys for the Founding Firm Beta program.
          </p>
        </Link>
      </div>
    </div>
  );
}
