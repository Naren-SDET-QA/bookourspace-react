import React, { useState } from 'react';
import { PencilLine } from 'lucide-react';
import type { LiveEditModule } from '../../lib/liveEdit/types';
import { LiveEditPanel, type LiveEditPanelDepsOverrides } from './LiveEditPanel';

export interface LiveEditEntryButtonProps {
  label?: string;
  initialModule?: LiveEditModule;
  deps?: LiveEditPanelDepsOverrides;
  className?: string;
}

/**
 * Additive entry point. It renders a single button; all authority checks happen
 * inside the panel against the verified session, so passing props here can
 * never grant edit rights.
 */
export function LiveEditEntryButton({
  label = 'Live Edit',
  initialModule,
  deps,
  className,
}: LiveEditEntryButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="live-edit-entry"
        onClick={() => setOpen(true)}
        className={
          className ||
          'inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-teal-tint bg-brand-teal-soft px-3 text-xs font-black text-brand-teal-deep transition hover:bg-brand-teal-tint dark:border-brand-teal-deep dark:bg-brand-navy/50 dark:text-brand-teal-light dark:hover:bg-brand-navy'
        }
      >
        <PencilLine className="h-3.5 w-3.5" />
        {label}
      </button>
      <LiveEditPanel
        open={open}
        onClose={() => setOpen(false)}
        initialModule={initialModule}
        deps={deps}
      />
    </>
  );
}
