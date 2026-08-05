import { createClient } from "@/lib/supabase/server";
import { PublicSignView } from "@/components/sign/PublicSignView";

export default async function PublicSignPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_signature_request_by_token", { p_token: params.token }).maybeSingle();

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Invalid or expired signing link</h1>
        <p className="mt-2 text-sm text-muted">Please contact the sender for a new link.</p>
      </div>
    );
  }

  return <PublicSignView token={params.token} initialData={data as never} />;
}
