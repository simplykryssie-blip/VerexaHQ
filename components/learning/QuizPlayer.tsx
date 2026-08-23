"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type QuizOption = { id: string; option_text: string };
type QuizQuestion = { id: string; question_text: string; options: QuizOption[] };
type QuizData = { module_id: string; title: string; passing_score_percent: number; questions: QuizQuestion[] };
type QuizResult = { score_percent: number; passed: boolean; correct: number; total: number };

export function QuizPlayer({
  moduleId,
  previousScore,
  previouslyPassed,
}: {
  moduleId: string;
  previousScore: number | null;
  previouslyPassed: boolean | null;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_quiz_for_taking", { p_module_id: moduleId });
      if (cancelled) return;
      if (error) {
        toast.show(error.message, "error");
      } else {
        setQuiz(data as unknown as QuizData);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  async function submit() {
    if (!quiz) return;
    const unanswered = quiz.questions.some((q) => !answers[q.id]);
    if (unanswered) {
      toast.show("Answer every question before submitting.", "error");
      return;
    }
    setSubmitting(true);
    const payload = quiz.questions.map((q) => ({ question_id: q.id, selected_option_id: answers[q.id] }));
    const { data, error } = await supabase.rpc("submit_quiz_attempt", { p_module_id: moduleId, p_answers: payload });
    setSubmitting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setResult(data as unknown as QuizResult);
  }

  if (loading) return <p className="text-sm text-muted">Loading quiz...</p>;
  if (!quiz) return <p className="text-sm text-muted">This quiz couldn&apos;t be loaded.</p>;

  const shown = result ?? (previousScore != null ? { score_percent: previousScore, passed: Boolean(previouslyPassed), correct: 0, total: 0 } : null);

  return (
    <div className="space-y-4">
      {quiz.questions.length === 0 ? (
        <p className="text-sm text-muted">This quiz has no questions yet.</p>
      ) : (
        quiz.questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-sm font-medium text-ink">
              {i + 1}. {q.question_text}
            </p>
            <div className="mt-2 space-y-1.5">
              {q.options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-slate">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === o.id}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                    className="h-4 w-4 border-border text-accent focus:ring-accent"
                  />
                  {o.option_text}
                </label>
              ))}
            </div>
          </div>
        ))
      )}

      {quiz.questions.length > 0 && (
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit quiz"}
        </button>
      )}

      {shown && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            shown.passed ? "bg-green-50 text-success" : "bg-red-50 text-danger"
          }`}
        >
          {shown.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {shown.passed ? "Passed" : "Not passed"} -- {shown.score_percent}% (needs {quiz.passing_score_percent}%)
        </div>
      )}
    </div>
  );
}
