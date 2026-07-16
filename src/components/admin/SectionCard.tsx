import { ReactNode } from "react";

export function SectionCard({
  children,
  className = "",
  id
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-lg border border-clinic-line bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}
