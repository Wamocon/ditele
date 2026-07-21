"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/shared/ui";

/**
 * A submit button that shows the form's pending state.
 * Shared by every WS-3 form. Lives in `features/questions/` because that is the
 * only `features/` folder WS-3 owns — it is not question-specific.
 */
export function SubmitButton({
  children,
  ...props
}: Omit<ButtonProps, "type" | "loading">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}
