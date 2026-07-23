/**
 * Serializable shapes shared between the review Server Actions and the client
 * forms that call them.
 *
 * These live outside `actions.ts` on purpose: a `"use server"` module may only
 * export async functions. Next silently strips any other export, so a constant
 * defined there resolves to `undefined` at the call site and the form crashes.
 */

export interface ReviewActionState {
  status: "idle" | "success" | "error";
  message: string;
  /** True once a decision has been recorded, so the form can lock itself. */
  decided: boolean;
}

export const initialReviewState: ReviewActionState = {
  status: "idle",
  message: "",
  decided: false,
};

export interface ProfileActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export const initialProfileState: ProfileActionState = { status: "idle", message: "" };
