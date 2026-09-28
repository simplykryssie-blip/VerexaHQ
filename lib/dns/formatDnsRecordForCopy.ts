// Builds the text for a "Copy record" action -- a plain-text reference of
// the whole record, distinct from (and never a replacement for) copying one
// field at a time. Only used for that combined copy; the underlying record
// data and every individually-copyable field value are untouched.
export function formatDnsRecordForCopy(record: { type: string; name: string; value: string; priority?: number | string | null }): string {
  const lines = [`Type: ${record.type}`, `Name: ${record.name}`, `Value: ${record.value}`];
  if (record.priority !== undefined && record.priority !== null && record.priority !== "") {
    lines.push(`Priority: ${record.priority}`);
  }
  return lines.join("\n");
}
