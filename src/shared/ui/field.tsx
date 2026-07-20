import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type FieldProps = {
  children: ReactNode;
  description?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  label: string;
};

export function Field({ children, description, error, htmlFor, label }: FieldProps) {
  return (
    <div className="field" data-invalid={error ? "true" : undefined}>
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {description ? <p className="field__description">{description}</p> : null}
      {error ? <p className="field__error" id={`${htmlFor}-error`} role="alert">{error}</p> : null}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`.trim()} {...props} />;
}
