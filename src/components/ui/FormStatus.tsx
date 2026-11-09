import type { ReactNode } from 'react';

export function FormStatus({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children?: ReactNode;
}) {
  if (!children) return null;
  const palette =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
      : tone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${palette}`}>
      {children}
    </p>
  );
}
