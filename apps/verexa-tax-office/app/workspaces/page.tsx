import { redirect } from "next/navigation";
import { getUserMemberships } from "@/lib/auth/workspace";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WorkspaceChooserList } from "@/features/auth/workspace-chooser-list";

export default async function WorkspaceChooserPage() {
  const memberships = await getUserMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  if (memberships.length === 1) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-secondary/40 flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a workspace</CardTitle>
          <CardDescription>You belong to more than one workspace. Pick one to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceChooserList memberships={memberships} />
        </CardContent>
      </Card>
    </div>
  );
}
