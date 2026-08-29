export type TabItem = { id: string; label: string; badge?: number };

/** The shared underline tab bar for a workspace's content sections (client,
 * engagement, etc.). Not for compact filter switchers -- those stay on
 * whatever pill-group style already suits them. */
export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (id: string) => void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
              isActive ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {typeof tab.badge === "number" && tab.badge > 0 && (
              <span className="rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
