/**
 * Shared shapes for the WS-6 Server Actions.
 *
 * ⚠️ These live here, NOT in `actions.ts`, because **a `"use server"` module may
 * only export async functions.** Next does not fail the build for a non-function
 * export — it strips it, so the import silently resolves to `undefined` and the
 * component crashes at render with something unrelated-looking
 * ("Cannot read properties of undefined (reading 'length')"). Keep every
 * constant and type on this side of the boundary.
 */

export interface ActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export const idleState: ActionState = { status: "idle", message: "" };

export interface CreateUserState extends ActionState {
  /** Set on success so the form can link straight to the new account. */
  userId?: string;
}

export const initialCreateUserState: CreateUserState = { status: "idle", message: "" };

/** `support_issues.state` is a plain text column, not an enum — these are the
 *  values the triage control offers. */
export const ISSUE_STATES = ["open", "triaged", "in_progress", "resolved", "rejected"] as const;
