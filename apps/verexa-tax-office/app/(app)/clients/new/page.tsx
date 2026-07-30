import { redirect } from "next/navigation";

// Client creation happens inline via a dialog on the list page.
export default function NewClientRedirect() {
  redirect("/clients");
}
