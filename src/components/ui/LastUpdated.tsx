export function formatListedDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function LastUpdated({
  at,
  label = 'Last updated',
  className = 'text-[11px] font-semibold text-slate-500 dark:text-slate-400',
}: {
  at?: string | null;
  label?: string;
  className?: string;
}) {
  const text = formatListedDate(at);
  if (!text) return null;
  return (
    <time dateTime={at || undefined} className={className}>
      {label}: {text}
    </time>
  );
}
