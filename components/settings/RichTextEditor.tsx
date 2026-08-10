"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";

function ToolbarButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`rounded-md p-1.5 transition ${active ? "bg-accentSoft text-accent" : "text-muted hover:bg-surfaceMuted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-1 border-b border-border bg-surfaceMuted px-2 py-1.5">
      <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold">
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic">
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading">
        <Heading2 size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullet list">
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list">
        <ListOrdered size={14} />
      </ToolbarButton>
    </div>
  );
}

/** Wraps Tiptap for the editable document/email editor and the read-only
 * sandbox preview -- reusing the same trusted editor to render interpolated
 * content avoids adding a separate HTML sanitizer just for the preview.
 * `documentStyle` gives the content area a paper-page look (engagement
 * letters); `bare` skips the outer border/background so a caller can nest
 * this under its own chrome (the email composer's Subject line). */
export function RichTextEditor({
  content,
  onChange,
  editable = true,
  onEditorReady,
  documentStyle = false,
  bare = false,
}: {
  content: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  onEditorReady?: (editor: Editor) => void;
  documentStyle?: boolean;
  bare?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        class: documentStyle
          ? "prose prose-sm max-w-none focus:outline-none min-h-[520px] px-10 py-10 sm:px-14 sm:py-12"
          : "prose prose-sm max-w-none focus:outline-none min-h-[240px] px-4 py-3",
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Keep the editor in sync when `content` changes from outside (e.g. switching
  // which template is loaded) without fighting the user's own typing.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  if (!editor) return null;

  const wrapperClass = bare
    ? ""
    : documentStyle
      ? "mx-auto max-w-[720px] overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-border/60"
      : "overflow-hidden rounded-xl border border-border bg-surface";

  return (
    <div className={wrapperClass}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

export function insertTextAtCursor(editor: Editor, text: string) {
  editor.chain().focus().insertContent(text).run();
}
