"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabasePortal } from "@/lib/supabasePortal";
import type {
  TaxOrganizerAssignment,
  TaxOrganizerSection,
  TaxOrganizerQuestion,
  TaxOrganizerAnswer,
  TaxOrganizerTemplate,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";

export default function PortalOrganizerPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const router = useRouter();

  const [assignment, setAssignment] = useState<TaxOrganizerAssignment | null>(null);
  const [template, setTemplate] = useState<TaxOrganizerTemplate | null>(null);
  const [sections, setSections] = useState<TaxOrganizerSection[]>([]);
  const [questions, setQuestions] = useState<TaxOrganizerQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, TaxOrganizerAnswer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: assignmentData, error: assignmentError } = await supabasePortal
      .from("tax_organizer_assignments")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();

    if (assignmentError || !assignmentData) {
      setError(assignmentError?.message ?? "Organizer not found.");
      setLoading(false);
      return;
    }

    const a = assignmentData as TaxOrganizerAssignment;
    setAssignment(a);

    const [templateRes, sectionsRes, answersRes] = await Promise.all([
      supabasePortal.from("tax_organizer_templates").select("*").eq("id", a.template_id).maybeSingle(),
      supabasePortal
        .from("tax_organizer_sections")
        .select("*")
        .eq("template_id", a.template_id)
        .order("sort_order"),
      supabasePortal.from("tax_organizer_answers").select("*").eq("assignment_id", a.id),
    ]);

    const sectionList = (sectionsRes.data as TaxOrganizerSection[]) ?? [];
    setTemplate((templateRes.data as TaxOrganizerTemplate) ?? null);
    setSections(sectionList);

    if (sectionList.length > 0) {
      const { data: questionData } = await supabasePortal
        .from("tax_organizer_questions")
        .select("*")
        .in(
          "section_id",
          sectionList.map((s) => s.id)
        )
        .order("sort_order");
      setQuestions((questionData as TaxOrganizerQuestion[]) ?? []);
    }

    const answersMap = new Map<string, TaxOrganizerAnswer>();
    (answersRes.data as TaxOrganizerAnswer[] | null)?.forEach((ans) =>
      answersMap.set(ans.question_id, ans)
    );
    setAnswers(answersMap);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (assignmentId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  async function saveAnswer(question: TaxOrganizerQuestion, value: unknown) {
    if (!assignment) return;
    setSavingQuestionId(question.id);
    const existing = answers.get(question.id);

    if (existing) {
      const { error } = await supabasePortal
        .from("tax_organizer_answers")
        .update({ answer_value: value, answered_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (!error) {
        setAnswers((prev) => new Map(prev).set(question.id, { ...existing, answer_value: value }));
      }
    } else {
      const { data: newAnswer, error } = await supabasePortal
        .from("tax_organizer_answers")
        .insert({
          workspace_id: assignment.workspace_id,
          assignment_id: assignment.id,
          question_id: question.id,
          answer_value: value,
        })
        .select()
        .single();
      if (!error && newAnswer) {
        setAnswers((prev) => new Map(prev).set(question.id, newAnswer as TaxOrganizerAnswer));
      }
    }
    setSavingQuestionId(null);
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  if (error || !assignment) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Not found."}
      </div>
    );
  }

  const answeredCount = questions.filter((q) => answers.has(q.id)).length;

  return (
    <div>
      <button
        onClick={() => router.push("/portal")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Home
      </button>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="font-slab text-2xl font-bold text-ink">{template?.template_name}</h1>
        <StatusPill status={assignment.assignment_status} />
      </div>
      <div className="text-sm text-muted mb-8">
        {answeredCount} of {questions.length} questions answered
        {assignment.due_date ? ` · Due ${assignment.due_date}` : ""}
      </div>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.id}>
            <div className="border-b border-line pb-3 mb-4">
              <h2 className="font-slab text-lg font-bold text-ink">{section.section_title}</h2>
              {section.section_description && (
                <p className="text-xs text-muted mt-1">{section.section_description}</p>
              )}
            </div>
            <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
              {questions
                .filter((q) => q.section_id === section.id)
                .map((q) => {
                  const answer = answers.get(q.id);
                  const value = answer?.answer_value as string | boolean | undefined;
                  return (
                    <div key={q.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-ink">
                            {q.question_text}
                            {q.is_required && <span className="text-brick"> *</span>}
                          </div>
                          {q.help_text && (
                            <div className="text-xs text-muted mt-0.5">{q.help_text}</div>
                          )}
                        </div>

                        <div className="shrink-0">
                          {q.question_type === "boolean" && (
                            <div className="flex gap-2">
                              {["Yes", "No"].map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => saveAnswer(q, opt === "Yes")}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
                                  style={{
                                    borderColor:
                                      value === (opt === "Yes") ? "#0D1B2A" : "#DDE3EC",
                                    backgroundColor:
                                      value === (opt === "Yes") ? "#0D1B2A" : "white",
                                    color: value === (opt === "Yes") ? "white" : "#0D1B2A",
                                  }}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}

                          {q.question_type === "select" && (
                            <select
                              value={(value as string) ?? ""}
                              onChange={(e) => saveAnswer(q, e.target.value)}
                              className="border border-line rounded-sm px-3 py-1.5 text-sm"
                            >
                              <option value="">—</option>
                              {q.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}

                          {(q.question_type === "text" || q.question_type === "number") && (
                            <input
                              type={q.question_type === "number" ? "number" : "text"}
                              defaultValue={(value as string) ?? ""}
                              onBlur={(e) => saveAnswer(q, e.target.value)}
                              className="border border-line rounded-sm px-3 py-1.5 text-sm w-48"
                            />
                          )}

                          {q.question_type === "date" && (
                            <input
                              type="date"
                              defaultValue={(value as string) ?? ""}
                              onBlur={(e) => saveAnswer(q, e.target.value)}
                              className="border border-line rounded-sm px-3 py-1.5 text-sm"
                            />
                          )}
                        </div>
                      </div>
                      {savingQuestionId === q.id && (
                        <div className="text-[11px] text-muted mt-1">Saving…</div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted mt-6">
        Your answers save automatically as you go — there&apos;s nothing to submit.
        Your accountant will follow up once they&apos;ve reviewed everything.
      </p>
    </div>
  );
}
