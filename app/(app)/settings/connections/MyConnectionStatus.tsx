export function MyConnectionStatus({
  eroName,
  billingResponsibility,
  sharesCommunicationsIdentity,
}: {
  eroName: string;
  billingResponsibility: string;
  sharesCommunicationsIdentity: boolean;
}) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Connected to</dt>
        <dd className="mt-0.5 font-medium text-ink">{eroName}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Billing</dt>
        <dd className="mt-0.5 text-slate">
          {billingResponsibility === "ero" ? `Covered by ${eroName}` : "You pay for your own subscription and add-ons"}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted">Email &amp; SMS</dt>
        <dd className="mt-0.5 text-slate">
          {sharesCommunicationsIdentity ? `Sending under ${eroName}'s identity` : "Using your own"}
        </dd>
      </div>
    </dl>
  );
}
