// Writes the exact string given -- no trimming, normalizing, or otherwise
// altering the value -- so callers copying a DNS record value (which can
// legitimately start/end with meaningful whitespace, quotes, periods, etc.)
// get back precisely what they passed in. Falls back to the classic
// execCommand("copy") technique for non-secure contexts (plain http, some
// embedded webviews) where navigator.clipboard isn't available at all.
export async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the execCommand fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
