// Full cross-entity global search (clients, leads, engagements, documents,
// invoices, tasks) lands with those modules in later phases of this build.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Search results</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {q ? `Showing results for "${q}"` : "Enter a search term above."}
      </p>
      <p className="text-sm text-muted-foreground mt-4">
        Full search across clients, leads, engagements, documents, invoices, and tasks is coming next in
        this build.
      </p>
    </div>
  );
}
