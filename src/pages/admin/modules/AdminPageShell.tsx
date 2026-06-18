import { ReactNode } from "react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { Button } from "../../../components/ui/Button";

export function AdminPageShell({
  title,
  description,
  eyebrow,
  actionLabel,
  onAction,
  onRefresh,
  onCreateAppointment,
  children
}: {
  title: string;
  description: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  onRefresh?: () => void;
  onCreateAppointment?: () => void;
  children: ReactNode;
}) {
  return (
    <AdminLayout
      onCreateAppointment={onCreateAppointment ?? onAction ?? (() => undefined)}
      onRefresh={onRefresh ?? (() => window.location.reload())}
    >
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            {eyebrow && <p className="text-sm font-semibold text-clinic-brand">{eyebrow}</p>}
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-clinic-ink">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-clinic-muted">{description}</p>
          </div>
          {actionLabel && (
            <Button onClick={onAction} variant="primary">
              {actionLabel}
            </Button>
          )}
        </section>
        {children}
      </main>
    </AdminLayout>
  );
}
