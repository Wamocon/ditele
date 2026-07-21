/**
 * The state shape shared by all four auth forms.
 *
 * ⚠️ This lives in its own module on purpose. `actions.ts` carries the
 * `"use server"` directive, and **every export of a `"use server"` module must
 * be an async function** — React rewrites the rest into server references. An
 * exported constant silently becomes an opaque proxy on the client, and the
 * first property read on it throws during SSR. That cost one debugging round;
 * do not move `initialAuthState` back.
 */
export interface AuthActionState {
  status: "idle" | "error" | "success";
  /** Form-level message. Field-level problems go in `fieldErrors`. */
  message: string | null;
  fieldErrors: Record<string, string>;
  /** Echoed back so a failed submit does not empty the form. */
  values: { email: string; name: string };
}

export const initialAuthState: AuthActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  values: { email: "", name: "" },
};
