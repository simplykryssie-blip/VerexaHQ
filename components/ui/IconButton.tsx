import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type IconButtonVariant = "default" | "ghost";

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default: "border border-border bg-surface text-slate hover:bg-surfaceMuted",
  ghost: "text-muted hover:bg-surfaceMuted hover:text-ink",
};

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  variant?: IconButtonVariant;
  /** Required, not optional -- an icon-only control with no label is unusable with a screen reader. */
  "aria-label": string;
};

/** 44x44px minimum touch target and a required aria-label, enforced at the type level. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", className = "", type = "button", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
