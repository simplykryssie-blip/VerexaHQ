/** Inserts text at the current caret position of a plain input/textarea (rich-text editors use their own insertTextAtCursor). */
export function insertAtFieldCursor(
  field: HTMLInputElement | HTMLTextAreaElement | null,
  current: string,
  text: string,
  setValue: (v: string) => void
) {
  if (!field) {
    setValue(current + text);
    return;
  }
  const start = field.selectionStart ?? current.length;
  const end = field.selectionEnd ?? current.length;
  setValue(current.slice(0, start) + text + current.slice(end));
  requestAnimationFrame(() => {
    const pos = start + text.length;
    field.focus();
    field.setSelectionRange(pos, pos);
  });
}
