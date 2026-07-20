"use client";

import { useRef, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Field, Textarea } from "@/shared/ui/field";

import type { CreateQuestionInput, QuestionThread } from "../model/question";

interface QuestionComposerProps {
  taskId: string;
  groupId: string;
  labels: QuestionComposerLabels;
  create(input: CreateQuestionInput): Promise<QuestionThread>;
  onCreated(thread: QuestionThread): void;
}

export interface QuestionComposerLabels {
  label: string;
  error: string;
  sending: string;
  send: string;
}

function createKey(): string {
  return `question-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function QuestionComposer({
  taskId,
  groupId,
  labels,
  create,
  onCreated,
}: QuestionComposerProps) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const key = useRef(createKey());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length === 0) {
      setState("error");
      return;
    }

    setState("sending");
    try {
      const thread = await create({
        taskId,
        groupId,
        body,
        idempotencyKey: key.current,
      });
      onCreated(thread);
      setBody("");
      setState("idle");
      key.current = createKey();
    } catch {
      setState("error");
    }
  }

  return (
    <form className="panel stack" onSubmit={handleSubmit}>
      <Field error={state === "error" ? labels.error : undefined} htmlFor={`question-${taskId}`} label={labels.label}>
        <Textarea
          aria-describedby={state === "error" ? `question-${taskId}-error` : undefined}
          id={`question-${taskId}`}
          maxLength={10_000}
          onChange={(event) => setBody(event.target.value)}
          value={body}
        />
      </Field>
      <Button disabled={state === "sending"} type="submit">
        {state === "sending" ? labels.sending : labels.send}
      </Button>
    </form>
  );
}
