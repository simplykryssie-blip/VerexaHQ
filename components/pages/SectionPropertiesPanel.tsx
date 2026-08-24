import { SECTION_TYPE_LABELS, type BuilderSection, type WorkspaceServiceOption } from "./types";
import { HeroEditor } from "./section-editors/HeroEditor";
import { RichTextEditorSection } from "./section-editors/RichTextEditorSection";
import { ImageEditor } from "./section-editors/ImageEditor";
import { TextImageEditor } from "./section-editors/TextImageEditor";
import { TestimonialEditor } from "./section-editors/TestimonialEditor";
import { FaqEditor } from "./section-editors/FaqEditor";
import { LeadFormEditor } from "./section-editors/LeadFormEditor";
import { CtaButtonEditor } from "./section-editors/CtaButtonEditor";
import { SpacerEditor } from "./section-editors/SpacerEditor";
import { FooterEditor } from "./section-editors/FooterEditor";
import { CustomHtmlEditor } from "./section-editors/CustomHtmlEditor";

export function SectionPropertiesPanel({
  workspaceId,
  section,
  onUpdate,
  workspaceServices,
  canAdvanceToNextPage,
}: {
  workspaceId: string;
  section: BuilderSection | null;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  workspaceServices: WorkspaceServiceOption[];
  canAdvanceToNextPage: boolean;
}) {
  if (!section) {
    return (
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
        <p className="text-sm text-muted">Select a section to edit it.</p>
      </aside>
    );
  }

  function onChange(patch: Record<string, unknown>) {
    onUpdate(section!.id, patch);
  }

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">{SECTION_TYPE_LABELS[section.section_type]}</p>
      <div className="mt-3">
        {section.section_type === "hero" && <HeroEditor workspaceId={workspaceId} config={section.config as never} onChange={onChange} />}
        {section.section_type === "rich_text" && <RichTextEditorSection config={section.config as never} onChange={onChange} />}
        {section.section_type === "image" && <ImageEditor workspaceId={workspaceId} config={section.config as never} onChange={onChange} />}
        {section.section_type === "text_image" && <TextImageEditor workspaceId={workspaceId} config={section.config as never} onChange={onChange} />}
        {section.section_type === "testimonial" && <TestimonialEditor workspaceId={workspaceId} config={section.config as never} onChange={onChange} />}
        {section.section_type === "faq" && <FaqEditor config={section.config as never} onChange={onChange} />}
        {section.section_type === "lead_form" && (
          <LeadFormEditor config={section.config as never} onChange={onChange} workspaceServices={workspaceServices} canAdvanceToNextPage={canAdvanceToNextPage} />
        )}
        {section.section_type === "cta_button" && <CtaButtonEditor config={section.config as never} onChange={onChange} />}
        {section.section_type === "spacer" && <SpacerEditor config={section.config as never} onChange={onChange} />}
        {section.section_type === "footer" && <FooterEditor config={section.config as never} onChange={onChange} />}
        {section.section_type === "custom_html" && <CustomHtmlEditor config={section.config as never} onChange={onChange} />}
      </div>
    </aside>
  );
}
