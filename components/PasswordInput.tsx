"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Wraps any password-style text input with a show/hide toggle. Padding-right
// is set inline (not via a className) so it always wins over whatever
// padding shorthand the caller's own input styling applies, regardless of
// CSS module vs. Tailwind cascade order.
export function PasswordInput({
  wrapperClassName = "",
  style,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative w-full ${wrapperClassName}`}>
      <input {...props} type={visible ? "text" : "password"} style={{ ...style, paddingRight: 36 }} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink"
      >
        {visible ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
      </button>
    </div>
  );
}
