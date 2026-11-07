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
          'inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/60'
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
