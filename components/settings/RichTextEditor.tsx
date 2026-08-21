"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Bold, Italic, List, ListOrdered, Heading2, SeparatorHorizontal, Table2, ListChecks, Trash2 } from "lucide-react";
import { PageBreak } from "@/lib/tiptap/pageBreak";

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

function Toolbar({ editor, extra, rounded, allowPageBreak }: { editor: Editor; extra?: React.ReactNode; rounded: string; allowPageBreak: boolean }) {
  return (
    <div className={`sticky top-0 z-10 flex items-center justify-between gap-1 border-b border-border bg-surfaceMuted px-2 py-1.5 ${rounded}`}>
      <div className="flex items-center gap-1">
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
        {allowPageBreak && (
          <>
            <ToolbarButton active={false} onClick={() => editor.chain().focus().setPageBreak().run()} label="Insert page break">
              <SeparatorHorizontal size={14} />
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("taskList")}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              label="Insert checklist"
            >
              <ListChecks size={14} />
            </ToolbarButton>
            {editor.isActive("table") ? (
              <ToolbarButton active={false} onClick={() => editor.chain().focus().deleteTable().run()} label="Remove table">
                <Trash2 size={14} />
              </ToolbarButton>
            ) : (
              <ToolbarButton
                active={false}
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                label="Insert table"
              >
                <Table2 size={14} />
              </ToolbarButton>
            )}
          </>
        )}
      </div>
      {extra}
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
  allowPageBreak = false,
  toolbarExtra,
}: {
  content: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  onEditorReady?: (editor: Editor) => void;
  documentStyle?: boolean;
  bare?: boolean;
  /** Offers a page-break button and renders existing breaks as a labeled divider -- only meaningful for paginated documents (engagement letters), not a single organizer field or an email body. */
  allowPageBreak?: boolean;
  /** Rendered right-aligned inside the formatting toolbar -- e.g. a merge-field picker, so it sits where staff are actually typing instead of somewhere they have to scroll to find. */
  toolbarExtra?: React.ReactNode;
}) {
  const editor = useEditor({
    extensions: allowPageBreak
      ? [StarterKit, PageBreak, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell, TaskList, TaskItem.configure({ nested: true })]
      : [StarterKit],
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

  // The toolbar needs `position: sticky` to stay visible while scrolling a
  // long letter, which only works if no ancestor between it and the
  // scrolling container clips overflow -- so the rounded-corner clipping
  // that used to live on this outer wrapper moves to a separate inner
  // wrapper around just the content, and the toolbar rounds its own top
  // corners to match instead.
  let wrapperClass = "";
  let toolbarRounded = "";
  let contentRounded = "";
  if (!bare) {
    if (documentStyle) {
      wrapperClass = "mx-auto max-w-[720px] rounded-sm bg-white shadow-lg ring-1 ring-border/60";
      toolbarRounded = "rounded-t-sm";
      contentRounded = editable ? "rounded-b-sm" : "rounded-sm";
    } else {
      wrapperClass = "rounded-2xl border border-border bg-surface shadow-soft";
      toolbarRounded = "rounded-t-xl";
      contentRounded = editable ? "rounded-b-xl" : "rounded-xl";
    }
  }

  return (
    <div className={wrapperClass}>
      {editable && <Toolbar editor={editor} extra={toolbarExtra} rounded={toolbarRounded} allowPageBreak={allowPageBreak} />}
      <div className={`overflow-hidden ${contentRounded}`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function insertTextAtCursor(editor: Editor, text: string) {
  editor.chain().focus().insertContent(text).run();
}
