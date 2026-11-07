import React, { useEffect, useMemo, useRef, useState } from 'react';
import SafeImage from './SafeImage';
import {
  inspectMediaFile,
  type InspectedMedia,
  MediaInspectionError,
} from '../lib/media/inspection';
import { createResponsiveImageVariants, type ProcessedImage } from '../lib/media/imageVariants';
import { sanitizeSvgFile } from '../lib/media/sanitizeSvg';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { createMediaUploadHandler } from '../lib/media/uploadMediaAsset';

export type MediaUploadResult = {
  id: string;
  objectPath: string;
  mediaType: InspectedMedia;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  checksumSha256?: string;
  variantPaths: string[];
  access: 'public' | 'private';
};

export type MediaUploadHandler = (
  file: File,
  details: {
    inspected: InspectedMedia;
    processedImage: ProcessedImage | null;
    altText: string;
    caption: string;
    displayOrder: number;
    onProgress: (percent: number) => void;
  },
) => Promise<MediaUploadResult>;

export interface MediaManagerItem {
  id: string;
  file: File;
  previewUrl: string;
  inspected: InspectedMedia;
  processedImage: ProcessedImage | null;
  altText: string;
  caption: string;
  isCover: boolean;
  progress: number;
  status: 'ready' | 'uploading' | 'uploaded' | 'failed';
  error: string;
  result?: MediaUploadResult;
}

interface UniversalMediaManagerProps {
  moduleKey: string;
  parentType: string;
  parentId?: string;
  privacy?: 'public' | 'private';
  maxFiles?: number;
  /** Pass null to explicitly disable persistence (for preview-only contexts). */
  onUpload?: MediaUploadHandler | null;
  onChange?: (items: MediaManagerItem[]) => void;
  title?: string;
}

const itemId = () => globalThis.crypto?.randomUUID?.() ?? `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const safeCategory = (moduleKey: string) => {
  if (moduleKey === 'classes') return 'classes' as const;
  if (moduleKey === 'venues') return 'venues' as const;
  if (moduleKey === 'services') return 'services' as const;
  if (moduleKey === 'movies') return 'movies' as const;
  if (moduleKey === 'hotel_stay' || moduleKey === 'stays') return 'stays' as const;
  if (moduleKey === 'pg_hostels' || moduleKey === 'pg') return 'pg' as const;
  return 'general' as const;
};

/** Shared local selection/preview/order/accessibility UI. Persistence is
 * provided by a server-authorized adapter; without one, upload is disabled. */
export default function UniversalMediaManager({
  moduleKey,
  parentType,
  parentId,
  privacy = 'public',
  maxFiles = 20,
  onUpload,
  onChange,
  title = 'Add media',
}: UniversalMediaManagerProps) {
  const [items, setItems] = useState<MediaManagerItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const storageUpload = useMemo(
    () => {
      if (!isSupabaseConfigured) return undefined;
      try { return createMediaUploadHandler(moduleKey, parentType, parentId); } catch { return undefined; }
    },
    [moduleKey, parentType, parentId],
  );
  const uploadHandler = onUpload === null ? undefined : onUpload ?? storageUpload;
  const latestItemsRef = useRef(items);
  latestItemsRef.current = items;
  const remaining = Math.max(0, maxFiles - items.length);
  const accessLabel = useMemo(() => parentType === 'profile_avatar' || parentType === 'profile_cover'
    ? 'Private profile image' : privacy === 'private' ? 'Private documents' : 'Public listing media', [parentType, privacy]);

  useEffect(() => {
    onChange?.(items);
  }, [items, onChange]);

  useEffect(() => () => {
    latestItemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const acceptFiles = async (fileList: FileList | File[]) => {
    const selected = Array.from(fileList).slice(0, remaining);
    if (!selected.length) {
      setNotice(remaining ? 'No supported files were selected.' : `This media set already has its ${maxFiles}-file limit.`);
      return;
    }
    setBusy(true);
    const accepted: MediaManagerItem[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      try {
        const inspected = await inspectMediaFile(file);
        const profileImage = parentType === 'profile_avatar' || parentType === 'profile_cover';
        if (privacy === 'private' && !profileImage && inspected.kind !== 'document' && inspected.kind !== 'text') {
          throw new MediaInspectionError('PRIVATE_DOCUMENTS_ONLY', 'Private storage accepts documents and text files only.');
        }
        if (profileImage && inspected.kind !== 'image') {
          throw new MediaInspectionError('PROFILE_IMAGES_ONLY', 'Choose an image for your profile photo or cover.');
        }
        if (privacy === 'public' && !['image', 'video', 'audio'].includes(inspected.kind)) {
          throw new MediaInspectionError('DOCUMENTS_MUST_BE_PRIVATE', 'Documents must use the private documents collection.');
        }
        const safeFile = inspected.format === 'svg' ? await sanitizeSvgFile(file) : file;
        const processedImage = inspected.kind === 'image'
          ? await createResponsiveImageVariants(safeFile)
          : null;
        accepted.push({
          id: itemId(),
          file: safeFile,
          previewUrl: URL.createObjectURL(safeFile),
          inspected,
          processedImage,
          altText: '',
          caption: '',
          isCover: items.length === 0 && accepted.length === 0,
          progress: 0,
          status: 'ready',
          error: '',
        });
      } catch (error) {
        rejected.push(`${file.name}: ${error instanceof Error ? error.message : 'Unsupported file.'}`);
      }
    }
    if (accepted.length) setItems((current) => [...current, ...accepted].map((item, index) => ({ ...item, isCover: current.some((old) => old.isCover) ? item.isCover : index === 0 })));
    setNotice(rejected.length ? rejected.join(' ') : `${accepted.length} file${accepted.length === 1 ? '' : 's'} inspected from content and ready for preview.`);
    setBusy(false);
  };

  const removeItem = (id: string) => setItems((current) => {
    const removed = current.find((item) => item.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const next = current.filter((item) => item.id !== id);
    if (removed?.isCover && next[0]) next[0] = { ...next[0], isCover: true };
    return next;
  });

  const moveItem = (index: number, delta: number) => setItems((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const updateItem = (id: string, update: Partial<MediaManagerItem>) => setItems((current) => current.map((item) => ({ ...item, ...(item.id === id ? update : {}), ...(update.isCover === true && item.id !== id ? { isCover: false } : {}) })));

  const uploadItem = async (item: MediaManagerItem, index: number) => {
    if (!uploadHandler) return;
    updateItem(item.id, { status: 'uploading', error: '', progress: 0 });
    try {
      const result = await uploadHandler(item.file, {
        inspected: item.inspected,
        processedImage: item.processedImage,
        altText: item.altText,
        caption: item.caption,
        displayOrder: index,
        onProgress: (progress) => updateItem(item.id, { progress: Math.max(0, Math.min(100, progress)) }),
      });
      updateItem(item.id, { status: 'uploaded', progress: 100, result });
    } catch (error) {
      updateItem(item.id, { status: 'failed', error: error instanceof Error ? error.message : 'Upload failed.' });
    }
  };

  const uploadAll = async () => {
    if (!uploadHandler || busy) return;
    setBusy(true);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.status === 'uploaded') continue;
      await uploadItem(item, index);
    }
    setBusy(false);
  };

  const renderPreview = (item: MediaManagerItem) => {
    switch (item.inspected.preview) {
      case 'image':
        return <SafeImage src={item.previewUrl} alt={item.altText || item.file.name} category={safeCategory(moduleKey)} className="h-40 w-full rounded-xl object-cover" sizes="(max-width: 640px) 100vw, 400px" />;
      case 'video':
        return <video className="h-40 w-full rounded-xl bg-slate-950 object-contain" src={item.previewUrl} controls playsInline preload="metadata" />;
      case 'audio':
        return <div className="flex h-40 flex-col items-center justify-center gap-4 rounded-xl bg-indigo-50 p-4"><span aria-hidden="true">♫</span><audio className="w-full" src={item.previewUrl} controls preload="metadata" /></div>;
      default:
        return <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-slate-100 text-center text-sm text-slate-700"><span aria-hidden="true">▤</span><span className="max-w-full truncate px-3">{item.file.name}</span><span className="text-xs">Private-safe preview · download after authorization</span></div>;
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-bold text-slate-900 dark:text-white">{title}</h3><p className="text-xs text-slate-500">{accessLabel} · {moduleKey} / {parentType}</p></div>
        <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || items.length === 0 || !uploadHandler} onClick={uploadAll}>
          {uploadHandler ? 'Upload inspected media' : 'Storage setup required'}
        </button>
      </div>
      {!uploadHandler && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">Files can be previewed locally. Storage is not configured; no file or metadata is saved.</p>}
      {uploadHandler && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">Uploads stay in a private bucket. The database validates the stored object and its image derivatives before customers can receive signed URLs.</p>}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); void acceptFiles(event.dataTransfer.files); }}
        className={`w-full rounded-2xl border-2 border-dashed p-6 text-center transition ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}
        aria-label="Choose or drop media files"
      >
        <span className="block font-semibold">Drop files here or choose from this device</span>
        <span className="mt-1 block text-xs text-slate-500">Images, video, audio, PDF, Office documents and text · content is inspected before preview</span>
      </button>
      <input ref={inputRef} className="hidden" type="file" multiple accept="*/*" capture="environment" disabled={busy || remaining === 0} onChange={(event) => { if (event.target.files) void acceptFiles(event.target.files); event.currentTarget.value = ''; }} />
      {notice && <p className="text-sm text-slate-600 dark:text-slate-300" role="status">{notice}</p>}
      {items.length > 0 && <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => <article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          {renderPreview(item)}
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{item.inspected.format.toUpperCase()} · {(item.file.size / 1024 / 1024).toFixed(2)} MB{item.processedImage ? ` · ${item.processedImage.width}×${item.processedImage.height}` : ''}</span>{item.isCover && <span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-900">Cover</span>}</div>
          <label className="mt-2 block text-xs font-semibold">Alt text<input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={item.altText} maxLength={500} onChange={(event) => updateItem(item.id, { altText: event.target.value })} /></label>
          <label className="mt-2 block text-xs font-semibold">Caption<input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={item.caption} maxLength={1000} onChange={(event) => updateItem(item.id, { caption: event.target.value })} /></label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => updateItem(item.id, { isCover: true })}>Set cover</button>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => moveItem(index, -1)} disabled={index === 0}>Move up</button>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>Move down</button>
            <button type="button" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => removeItem(item.id)}>Remove</button>
            {uploadHandler && item.status !== 'uploaded' && <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void uploadItem(item, index)} disabled={busy}>{item.status === 'failed' ? 'Retry' : 'Upload'}</button>}
          </div>
          {item.status === 'uploading' && <progress className="mt-2 w-full" max={100} value={item.progress}>{item.progress}%</progress>}
          {item.error && <p className="mt-2 text-xs text-red-700" role="alert">{item.error}</p>}
        </article>)}
      </div>}
    </section>
  );
}
