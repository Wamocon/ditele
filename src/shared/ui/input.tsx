import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const base = [
  "w-full rounded-[--radius-md] border bg-[--color-bg] text-[15px] text-[--color-fg]",
  "placeholder:text-[--color-fg-subtle]",
  "transition-[border-color,box-shadow] duration-[--duration-fast]",
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-[--color-surface]",
].join(" ");

const tone = (invalid?: boolean) =>
  invalid
    ? "border-[--color-danger] focus-visible:outline-[--color-danger]"
    : "border-[--color-border-strong]";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, tone(invalid), "h-11 px-3", className)}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(base, tone(invalid), "resize-y px-3 py-2 leading-6", className)}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, tone(invalid), "h-11 px-3 pr-8", className)}
      {...props}
    >
      {children}
    </select>
  );
});
