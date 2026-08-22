import { createClient } from "@/lib/supabase/server";
import { PublicEngagementLetterSign } from "@/components/sign/PublicEngagementLetterSign";

export default async function PublicEngagementLetterPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_public_engagement_letter_template", { p_token: params.token });

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This link isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been turned off, or the link is incorrect.</p>
      </div>
    );
  }

  return <PublicEngagementLetterSign token={params.token} data={data as never} />;
}
