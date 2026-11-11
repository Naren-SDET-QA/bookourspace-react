import { useState } from 'react';
import { FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { inspectMediaFile } from '../../lib/media/inspection';
import { createMediaUploadHandler } from '../../lib/media/uploadMediaAsset';
import { isServiceDocumentReference, type ServiceCategoryDocument } from '../../lib/serviceCatalog';

export interface BookingDocumentValue {
  reference: string;
  fileName?: string;
  mimeType?: string;
}

/**
 * Reuses the existing private media pipeline. When Supabase storage is not
 * configured the field still accepts an existing secure storage/https
 * reference; nothing is fabricated locally.
 */
export function BookingDocumentField({
  requirement,
  value,
  onChange,
}: {
  requirement: ServiceCategoryDocument;
  value?: BookingDocumentValue;
  onChange: (value: BookingDocumentValue) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const upload = async (file: File | null) => {
    if (!file) return;
    setError('');
    if (!isSupabaseConfigured) {
      setError('Private document storage is not configured here. Paste an existing storage:// or https:// reference instead.');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const inspected = await inspectMediaFile(file);
      if (inspected.kind !== 'document' && inspected.kind !== 'text' && inspected.kind !== 'image') {
        throw new Error('DOCUMENT_FILE_REQUIRED');
      }
      if (requirement.acceptedTypes?.length && !requirement.acceptedTypes.includes(inspected.mimeType)) {
        throw new Error(`This requirement accepts ${requirement.acceptedTypes.join(', ')}.`);
      }
      const handler = createMediaUploadHandler('services', 'booking_document');
      const result = await handler(file, {
        inspected,
        processedImage: null,
        altText: requirement.label,
        caption: `Booking document: ${requirement.label}`,
        displayOrder: 0,
        onProgress: setProgress,
      });
      onChange({ reference: result.objectPath, fileName: file.name, mimeType: inspected.mimeType });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replace(/_/g, ' ') : 'Document upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const reference = value?.reference || '';
  const valid = reference ? isServiceDocumentReference(reference) : false;

  return (
    <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {requirement.label} {requirement.required ? <span className="text-rose-600">*</span> : <span className="text-[10px] font-semibold text-slate-400">optional</span>}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            Stored privately. {requirement.verificationRequired ? 'An administrator verifies it before handover.' : 'It is attached to this booking.'}
          </p>
        </div>
        {valid && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><ShieldCheck className="h-3 w-3" /> Attached</span>}
      </div>

      <input
        value={reference}
        onChange={(event) => onChange({ ...value, reference: event.target.value })}
        placeholder="storage://bos-private-documents/… or https://…"
        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-900"
      />

      <label className={`mt-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-violet-200 px-3 text-[10px] font-bold text-violet-800 dark:border-violet-800 dark:text-violet-200 ${busy ? 'opacity-60' : ''}`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
        {busy ? `Uploading ${progress}%` : 'Upload private document'}
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          accept={(requirement.acceptedTypes || []).join(',') || undefined}
          onChange={(event) => void upload(event.target.files?.[0] || null)}
        />
      </label>
      {value?.fileName && <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">{value.fileName}{value.mimeType ? ` · ${value.mimeType}` : ''}</p>}
      {error && <p role="alert" className="mt-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
}

export default BookingDocumentField;
