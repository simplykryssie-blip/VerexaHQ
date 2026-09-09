"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { TagNameInput } from "./TagNameInput";

// A pure controlled multi-tag editor for automation trigger/action config.
// Unlike TagsEditor.tsx (which persists each tag to a client immediately),
// this only edits local config state -- the parent's Save button is what
// actually confirms/creates missing tags (via ensureTagsConfirmed in
// lib/ensureTag.ts) and persists, same as every other automation field.
export function TagListInput({
  value,
  onChange,
  tagOptions,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  tagOptions: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const tag = raw.trim();
    setDraft("");
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accentSoft px-2.5 py-1 text-xs font-medium text-accent">
              {t}
              {!disabled && (
                <button type="button" onClick={() => removeTag(t)} className="text-accent/70 hover:text-accent" aria-label={`Remove tag ${t}`}>
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <TagNameInput
          value={draft}
          onChange={setDraft}
          onCommit={commit}
          tagOptions={tagOptions.filter((t) => !value.includes(t))}
          placeholder="Add a tag..."
        />
      )}
    </div>
  );
}
