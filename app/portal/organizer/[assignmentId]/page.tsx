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
import OrganizerQuestionnaire from "@/components/OrganizerQuestionnaire";

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
  const [submitting, setSubmitting] = useState(false);

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

  async function submitForReview() {
    if (!assignment) return;
    const missing = questions.filter((question) => {
      if (!question.is_required) return false;
      const value = answers.get(question.id)?.answer_value;
      return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    });
    if (missing.length > 0) {
      setError(`Complete ${missing.length} required question${missing.length === 1 ? "" : "s"} before submitting.`);
      return;
    }
    setSubmitting(true);
    const { error: submitError } = await supabasePortal
      .from("tax_organizer_assignments")
      .update({ assignment_status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", assignment.id);
    setSubmitting(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }
    setAssignment({ ...assignment, assignment_status: "submitted", submitted_at: new Date().toISOString() });
    setError(null);
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

      {error && (
        <div className="mb-6 text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
          {error}
        </div>
      )}

      <OrganizerQuestionnaire
        sections={sections}
        questions={questions}
        answers={answers}
        savingQuestionId={savingQuestionId}
        onSave={saveAnswer}
      />

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs text-muted flex-1">Your answers save automatically. Submit only when the organizer is complete.</p>
        {assignment.assignment_status !== "submitted" && assignment.assignment_status !== "accepted" && (
          <button type="button" onClick={submitForReview} disabled={submitting} className="px-4 py-2 rounded-sm bg-ink text-white text-sm font-semibold disabled:opacity-60">
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        )}
      </div>
    </div>
  );
}
