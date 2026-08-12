import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PipelinesRedirect() {
  // Folded into each service's own Board section -- one live view per service instead of a
  // separate top-level page picking between them.
  redirect("/settings/services");
}
