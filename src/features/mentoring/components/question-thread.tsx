import { Badge } from "@/shared/ui/badge";

import type { QuestionThread as QuestionThreadModel } from "../model/question";

interface QuestionThreadProps {
  thread: QuestionThreadModel;
  labels: QuestionThreadLabels;
}

export interface QuestionThreadLabels {
  heading: string;
  created: string;
  learner: string;
  trainer: string;
  empty: string;
  conversation: string;
  assignmentHistory: string;
  states: Record<QuestionThreadModel["state"], string>;
  transfer(state: QuestionThreadModel["transferHistory"][number]["state"], createdAt: string, reason?: string): string;
}

export function QuestionThread({ thread, labels }: QuestionThreadProps) {
  return (
    <article aria-labelledby={`question-${thread.id}`} className="panel stack">
      <header className="stack">
        <Badge tone={thread.state === "answered" ? "success" : "neutral"}>{labels.states[thread.state]}</Badge>
        <h2 id={`question-${thread.id}`}>{labels.heading}</h2>
        <p>
          {labels.created} <time dateTime={thread.createdAt}>{thread.createdAt}</time>
        </p>
      </header>

      {thread.messages.length === 0 ? (
        <p className="muted" role="status">{labels.empty}</p>
      ) : (
        <ol aria-label={labels.conversation} className="stack">
          {thread.messages.map((message) => (
            <li key={message.id}>
              <article>
                <h3>{message.author.kind === "learner" ? labels.learner : labels.trainer}</h3>
                <p>{message.body}</p>
                <time dateTime={message.createdAt}>{message.createdAt}</time>
              </article>
            </li>
          ))}
        </ol>
      )}

      {thread.transferHistory.length > 0 ? (
        <details>
          <summary>{labels.assignmentHistory}</summary>
          <ol>
            {thread.transferHistory.map((transfer) => (
              <li key={transfer.id}>
                {labels.transfer(transfer.state, transfer.createdAt, transfer.reason)}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}
