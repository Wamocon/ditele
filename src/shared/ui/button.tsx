import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export function Button({ children, className = "", variant = "primary", type = "button", ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? "" : `button--${variant}`;
  return (
    <button className={`button ${variantClass} ${className}`.trim()} type={type} {...props}>
      {children}
    </button>
  );
}
