import { ReactNode } from "react";

export function SectionCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-clinic-line bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}
