import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-clinic-brand text-white shadow-[0_8px_18px_rgba(13,118,110,0.18)] hover:bg-[#0b655e]",
  secondary: "border border-clinic-line bg-white text-clinic-ink shadow-[0_2px_8px_rgba(13,54,66,0.025)] hover:bg-[#e6f4f1]",
  ghost: "text-clinic-muted hover:bg-[#e6f4f1] hover:text-clinic-ink"
};

export function Button({ children, icon, className = "", variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
