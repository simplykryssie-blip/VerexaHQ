import { cn } from "@/lib/utils";

export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="verexa-v-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(174 84% 24%)" />
          <stop offset="1" stopColor="hsl(152 60% 36%)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#verexa-v-gradient)" />
      <path d="M8 9L16 23L24 9" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark size={28} />
      <span className="font-semibold tracking-tight text-foreground">
        Verexa <span className="text-muted-foreground font-normal">Tax Office</span>
      </span>
    </div>
  );
}
