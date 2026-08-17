import { Node, mergeAttributes, type CommandProps } from "@tiptap/core";

// data-page-break marker consumed by lib/documents/renderLetterPdf.ts to
// force an actual new page when rendering the signed PDF -- the visual
// dashed line + label in the editor (styled in globals.css) is purely a
// WYSIWYG stand-in for that.
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "" })];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}
