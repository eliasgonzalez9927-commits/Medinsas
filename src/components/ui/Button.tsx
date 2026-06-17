import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-clinic-brand text-white shadow-sm hover:bg-teal-800",
  secondary: "border border-clinic-line bg-white text-clinic-ink hover:bg-clinic-surface",
  ghost: "text-clinic-muted hover:bg-clinic-surface hover:text-clinic-ink"
};

export function Button({ children, icon, className = "", variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
