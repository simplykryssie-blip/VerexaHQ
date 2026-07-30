import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export function StatusPage({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  tone = "default",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  tone?: "default" | "warning" | "destructive";
}) {
  const iconColor =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="min-h-screen bg-secondary/40 flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="max-w-sm">
        <Icon className={`h-12 w-12 mx-auto mb-4 ${iconColor}`} />
        <h1 className="text-lg font-semibold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
        {actionLabel && actionHref && (
          <Button asChild variant="brand">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
