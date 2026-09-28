import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-border text-slate hover:border-accent hover:text-accent",
  tertiary: "text-slate hover:bg-surfaceMuted",
  destructive: "border border-danger text-danger hover:bg-danger/10",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Toggled/pressed state (e.g. a filter or "Customize" toggle button) --
   *  layers an accent tint on top of the variant's normal look so a toggle
   *  button can show ON vs OFF without a one-off hand-styled replacement.
   *  Omit (or false) for every ordinary button, which renders exactly as
   *  before. */
  active?: boolean;
};

const ACTIVE_CLASSES = "border-accent bg-accentSoft text-accent hover:border-accent hover:text-accent";

/** Same classes `<Button>` renders with, for the rare case something that
 * isn't a real `<button>` (a Next.js `<Link>` that needs to navigate, not
 * submit) still needs to look like one -- so it stays pinned to this one
 * definition instead of a hand-copied className drifting from it over time. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "", active = false) {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${active ? ACTIVE_CLASSES : ""} ${className}`;
}

/** The one place every button's visual states (hover, focus-visible, disabled) are defined. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", active = false, disabled, type = "button", children, ...props },
  ref
) {
  return (
    <button ref={ref} type={type} disabled={disabled} className={buttonClasses(variant, size, className, active)} {...props}>
      {children}
    </button>
  );
});
