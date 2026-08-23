"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type Option = { id: string; option_text: string; is_correct: boolean; display_order: number };
type Question = { id: string; question_text: string; display_order: number; options: Option[] };

function QuestionCard({ moduleId, question }: { moduleId: string; question: Question }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [text, setText] = useState(question.question_text);
  const [newOption, setNewOption] = useState("");

  async function saveQuestionText() {
    if (text === question.question_text) return;
    const { error } = await supabase.from("learning_quiz_questions").update({ question_text: text }).eq("id", question.id);
    if (error) toast.show(error.message, "error");
    else router.refresh();
  }

  async function deleteQuestion() {
    if (!window.confirm("Delete this question?")) return;
    const { error } = await supabase.from("learning_quiz_questions").delete().eq("id", question.id);
    if (error) toast.show(error.message, "error");
    else router.refresh();
  }

  async function addOption(e: React.FormEvent) {
    e.preventDefault();
    if (!newOption.trim()) return;
    const { error } = await supabase.from("learning_quiz_options").insert({
      question_id: question.id,
      option_text: newOption.trim(),
      is_correct: question.options.length === 0,
      display_order: question.options.length,
    });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewOption("");
    router.refresh();
  }

  async function setCorrect(optionId: string) {
    await Promise.all(
      question.options.map((o) => supabase.from("learning_quiz_options").update({ is_correct: o.id === optionId }).eq("id", o.id))
    );
    router.refresh();
  }

  async function editOptionText(optionId: string, value: string) {
    const { error } = await supabase.from("learning_quiz_options").update({ option_text: value }).eq("id", optionId);
    if (error) toast.show(error.message, "error");
    else router.refresh();
  }

  async function deleteOption(optionId: string) {
    const { error } = await supabase.from("learning_quiz_options").delete().eq("id", optionId);
    if (error) toast.show(error.message, "error");
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <div className="flex items-start gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveQuestionText}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button type="button" onClick={deleteQuestion} className="rounded p-2 text-muted hover:text-danger" aria-label="Delete question">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        {question.options.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={o.is_correct}
              onChange={() => setCorrect(o.id)}
              className="h-4 w-4 border-border text-accent focus:ring-accent"
              aria-label="Correct answer"
            />
            <input
              defaultValue={o.option_text}
              onBlur={(e) => e.target.value !== o.option_text && editOptionText(o.id, e.target.value)}
              className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button type="button" onClick={() => deleteOption(o.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Delete option">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={addOption} className="mt-2 flex items-center gap-2">
        <input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          placeholder="Add an answer option"
          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button type="submit" disabled={!newOption.trim()} className="rounded-lg border border-border px-2 py-1.5 text-muted hover:border-accent hover:text-accent disabled:opacity-50">
          <Plus size={14} />
        </button>
      </form>
      <p className="mt-1 text-[11px] text-muted">Select the radio button next to the correct answer.</p>
    </div>
  );
}

export function QuizEditor({
  moduleId,
  title,
  passingScorePercent,
  questions,
}: {
  moduleId: string;
  title: string;
  passingScorePercent: number;
  questions: Question[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [titleValue, setTitleValue] = useState(title);
  const [passingScore, setPassingScore] = useState(String(passingScorePercent));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("learning_modules")
      .update({ title: titleValue, passing_score_percent: parseInt(passingScore, 10) || 70 })
      .eq("id", moduleId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    const { error } = await supabase
      .from("learning_quiz_questions")
      .insert({ module_id: moduleId, question_text: newQuestion.trim(), display_order: questions.length });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewQuestion("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted">
          Title
          <input
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.target.value);
              setDirty(true);
            }}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-muted">
          Passing score (%)
          <input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => {
              setPassingScore(e.target.value);
              setDirty(true);
            }}
            className="mt-1 w-24 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <p className="text-sm font-semibold text-ink">Questions</p>
      {questions.map((q) => (
        <QuestionCard key={q.id} moduleId={moduleId} question={q} />
      ))}

      <form onSubmit={addQuestion} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <input
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Add a question"
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!newQuestion.trim()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}
