import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold",
    "transition-[background-color,box-shadow,transform,color] duration-(--duration-base) ease-(--ease-out)",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-(--color-brand) text-(--color-brand-fg) shadow-(--shadow-sm) hover:bg-(--color-brand-hover) active:bg-(--color-brand-active)",
        secondary:
          "bg-(--color-surface-2) text-(--color-fg) hover:bg-(--color-border)",
        outline:
          "border border-(--color-border-strong) bg-transparent text-(--color-fg) hover:bg-(--color-surface)",
        ghost: "bg-transparent text-(--color-fg) hover:bg-(--color-surface)",
        danger:
          "bg-(--color-danger) text-white shadow-(--shadow-sm) hover:brightness-110",
        link: "bg-transparent text-(--color-brand) underline-offset-4 hover:underline",
      },
      size: {
        // min-h-11 = 44px — the mandatory mobile touch target.
        sm: "h-9 min-h-9 rounded-(--radius-sm) px-3 text-[13px]",
        md: "h-11 min-h-11 rounded-(--radius-md) px-4 text-[15px]",
        lg: "h-12 min-h-12 rounded-(--radius-md) px-6 text-[15px]",
        icon: "size-11 min-h-11 rounded-(--radius-md)",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, loading, iconLeft, iconRight, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(button({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
});
