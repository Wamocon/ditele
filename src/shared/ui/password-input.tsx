"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input, type InputProps } from "./input";
import { cn } from "./cn";

/**
 * A password box with a show/hide toggle.
 *
 * The eye existed on the login and register screens and nowhere else, so the
 * three places where a password is *chosen* rather than recalled — the profile's
 * "change password", the admin's "create user" and the admin's "set a new
 * password" — were exactly the ones you had to type blind. That is backwards:
 * you can retry a sign-in, but you cannot see what you just committed a new
 * account to.
 *
 * Deliberately just the control, not a labelled field: it accepts the `id`,
 * `aria-describedby`, `aria-invalid`, `invalid` and `required` props that
 * `Field` clones onto its child, so `<Field><PasswordInput …/></Field>` wires up
 * the label, hint and error exactly like every other input in the application.
 *
 * The toggle stays in the tab order. It is a real control with real state, and
 * a keyboard user is the one most likely to want it.
 */
export interface PasswordInputProps extends Omit<InputProps, "type"> {
  /** Accessible name while the password is hidden, e.g. "Show password". */
  showLabel: string;
  /** Accessible name while the password is visible. */
  hideLabel: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ showLabel, hideLabel, className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          // Room for the 44px toggle, so a long password never runs underneath it.
          className={cn("pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className={cn(
            "absolute inset-y-0 right-0 flex w-11 items-center justify-center",
            "rounded-r-(--radius-md) text-(--color-fg-muted) transition-colors hover:text-(--color-fg)"
          )}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    );
  }
);
