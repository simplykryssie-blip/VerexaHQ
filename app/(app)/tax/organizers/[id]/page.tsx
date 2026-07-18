"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  TaxOrganizerAssignment,
  TaxOrganizerSection,
  TaxOrganizerQuestion,
  TaxOrganizerAnswer,
  Client,
  TaxOrganizerTemplate,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import OrganizerQuestionnaire from "@/components/OrganizerQuestionnaire";
import { organizerPrefillValue } from "@/lib/organizerPrefill";

const STATUS_STEPS = ["draft", "sent", "submitted", "reviewed", "accepted"];

export default function OrganizerFillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [assignment, setAssignment] = useState<TaxOrganizerAssignment | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [template, setTemplate] = useState<TaxOrganizerTemplate | null>(null);
  const [sections, setSections] = useState<TaxOrganizerSection[]>([]);
  const [questions, setQuestions] = useState<TaxOrganizerQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, TaxOrganizerAnswer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    setLoading(true);
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("tax_organizer_assignments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (assignmentError || !assignmentData) {
      setError(assignmentError?.message ?? "Organizer assignment not found.");
      setLoading(false);
      return;
    }

    const a = assignmentData as TaxOrganizerAssignment;
    setAssignment(a);

    const [clientRes, templateRes, sectionsRes, answersRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", a.client_id).maybeSingle(),
      supabase.from("tax_organizer_templates").select("*").eq("id", a.template_id).maybeSingle(),
      supabase
        .from("tax_organizer_sections")
        .select("*")
        .eq("template_id", a.template_id)
        .order("sort_order"),
      supabase.from("tax_organizer_answers").select("*").eq("assignment_id", a.id),
    ]);

    const sectionList = (sectionsRes.data as TaxOrganizerSection[]) ?? [];
    setClient((clientRes.data as Client) ?? null);
    setTemplate((templateRes.data as TaxOrganizerTemplate) ?? null);
    setSections(sectionList);

    let questionList: TaxOrganizerQuestion[] = [];
    if (sectionList.length > 0) {
      const { data: questionData } = await supabase
        .from("tax_organizer_questions")
        .select("*")
        .in(
          "section_id",
          sectionList.map((s) => s.id)
        )
        .order("sort_order");
      questionList = (questionData as TaxOrganizerQuestion[]) ?? [];
      setQuestions(questionList);
    }

    const answersMap = new Map<string, TaxOrganizerAnswer>();
    (answersRes.data as TaxOrganizerAnswer[] | null)?.forEach((ans) =>
      answersMap.set(ans.question_id, ans)
    );

    const clientRecord = clientRes.data as Client | null;
    if (clientRecord) {
      const { data: sessionData } = await supabase.auth.getSession();
      const missingPrefills = questionList.flatMap((question) => {
        if (answersMap.has(question.id)) return [];
        const value = organizerPrefillValue(question, clientRecord);
        return value === undefined ? [] : [{
          workspace_id: a.workspace_id,
          assignment_id: a.id,
          question_id: question.id,
          answer_value: value,
          answered_by: sessionData.session?.user.id,
        }];
      });
      if (missingPrefills.length > 0) {
        const { data: inserted } = await supabase
          .from("tax_organizer_answers")
          .upsert(missingPrefills, { onConflict: "assignment_id,question_id", ignoreDuplicates: true })
          .select();
        (inserted as TaxOrganizerAnswer[] | null)?.forEach((ans) => answersMap.set(ans.question_id, ans));
      }
    }
    setAnswers(answersMap);

    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function saveAnswer(question: TaxOrganizerQuestion, value: unknown) {
    if (!assignment) return;
    setSavingQuestionId(question.id);

    const existing = answers.get(question.id);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (existing) {
      const { error } = await supabase
        .from("tax_organizer_answers")
        .update({ answer_value: value, answered_by: userId, answered_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (!error) {
        setAnswers((prev) => new Map(prev).set(question.id, { ...existing, answer_value: value }));
      }
    } else {
      const { data: newAnswer, error } = await supabase
        .from("tax_organizer_answers")
        .insert({
          workspace_id: assignment.workspace_id,
          assignment_id: assignment.id,
          question_id: question.id,
          answer_value: value,
          answered_by: userId,
        })
        .select()
        .single();
      if (!error && newAnswer) {
        setAnswers((prev) => new Map(prev).set(question.id, newAnswer as TaxOrganizerAnswer));
      }
    }
    setSavingQuestionId(null);
  }

  async function advanceStatus(nextStatus: string) {
    if (!assignment) return;
    setUpdatingStatus(true);
    const timestampField =
      nextStatus === "sent"
        ? "sent_at"
        : nextStatus === "submitted"
        ? "submitted_at"
        : nextStatus === "reviewed"
        ? "reviewed_at"
        : nextStatus === "accepted"
        ? "accepted_at"
        : null;

    const payload: Record<string, unknown> = { assignment_status: nextStatus };
    if (timestampField) payload[timestampField] = new Date().toISOString();

    const { error } = await supabase
      .from("tax_organizer_assignments")
      .update(payload)
      .eq("id", assignment.id);
    setUpdatingStatus(false);
    if (!error) {
      setAssignment({ ...assignment, ...payload } as TaxOrganizerAssignment);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading organizer…</div>;
  }

  if (error || !assignment) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Not found."}
      </div>
    );
  }

  const clientName = client
    ? client.client_type === "business" && client.business_name
      ? client.business_name
      : `${client.first_name} ${client.last_name}`.trim()
    : "—";

  const currentStepIndex = STATUS_STEPS.indexOf(assignment.assignment_status);
  const nextStatus = STATUS_STEPS[currentStepIndex + 1];

  return (
    <div>
      <button
        onClick={() => router.push("/tax/organizers")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Organizers
      </button>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="font-slab text-2xl font-bold text-ink">{clientName}</h1>
        <StatusPill status={assignment.assignment_status} />
      </div>
      <div className="text-sm text-muted mb-6">{template?.template_name}</div>

      <div className="flex items-center gap-2 mb-8">
        {nextStatus && (
          <button
            onClick={() => advanceStatus(nextStatus)}
            disabled={updatingStatus}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
          >
            {updatingStatus
              ? "Updating…"
              : `Mark as ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`}
          </button>
        )}
        <span className="text-xs text-muted">
          {assignment.due_date ? `Due ${assignment.due_date}` : "No due date set"}
        </span>
      </div>

      <OrganizerQuestionnaire
        sections={sections}
        questions={questions}
        answers={answers}
        savingQuestionId={savingQuestionId}
        onSave={saveAnswer}
      />
    </div>
  );
}
