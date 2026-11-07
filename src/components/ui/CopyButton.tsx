import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../../lib/clipboard';

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = '',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async (event) => {
        event.stopPropagation();
        const ok = await copyText(value);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className={`inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${className}`}
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
