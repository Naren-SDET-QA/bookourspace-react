import React, { useState } from 'react';
import SafeImage from '../SafeImage';
import { isRenderableListingImageSource } from '../../lib/media/signedStorageUrl';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Images,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { liveEditModuleSchema } from '../../lib/liveEdit/moduleSchemas';
import type {
  LiveEditCapabilities,
  LiveEditDetailValue,
  LiveEditDraft,
  LiveEditFieldDefinition,
  LiveEditFieldErrorMap,
  LiveEditListing,
  LiveEditModule,
} from '../../lib/liveEdit/types';
import { LIVE_EDIT_MODULE_LABELS } from '../../lib/liveEdit/types';

export interface LiveEditFeedback {
  tone: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

export interface LiveEditFormProps {
  module: LiveEditModule;
  listing: LiveEditListing;
  draft: LiveEditDraft;
  errors: LiveEditFieldErrorMap;
  capabilities: LiveEditCapabilities;
  readOnly: boolean;
  readOnlyReason?: string;
  saving: boolean;
  dirty: boolean;
  feedback?: LiveEditFeedback | null;
  auditNotice?: string | null;
  categoryOptions?: string[];
  subcategoryOptions?: string[];
  onDraftChange(next: LiveEditDraft, changedPath: string): void;
  onSave(): void;
  onCancel(): void;
  onReload(): void;
}

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800';

const LABEL_CLASS =
  'mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400';

const ERROR_CLASS = 'mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400';

function FieldShell({
  id,
  label,
  required,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={LABEL_CLASS} htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      {children}
      {help && !error ? (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{help}</p>
      ) : null}
      {error ? (
        <p className={ERROR_CLASS} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  description,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300">
          {icon}
        </span>
        <div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white">{title}</h4>
          {description ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function detailInputId(field: LiveEditFieldDefinition): string {
  return `live-edit-detail-${field.key}`;
}

function detailError(errors: LiveEditFieldErrorMap, key: string): string | undefined {
  return errors[`details.${key}`];
}

export function LiveEditForm({
  module,
  listing,
  draft,
  errors,
  capabilities,
  readOnly,
  readOnlyReason,
  saving,
  dirty,
  feedback,
  auditNotice,
  categoryOptions = [],
  subcategoryOptions = [],
  onDraftChange,
  onSave,
  onCancel,
  onReload,
}: LiveEditFormProps) {
  const schema = liveEditModuleSchema(module);
  const [facilityInput, setFacilityInput] = useState('');
  const disabled = readOnly || saving;

  const patch = (partial: Partial<LiveEditDraft>, changedPath: string) => {
    onDraftChange({ ...draft, ...partial }, changedPath);
  };

  const patchAvailability = (partial: Partial<LiveEditDraft['availability']>, key: string) => {
    patch({ availability: { ...draft.availability, ...partial } }, `availability.${key}`);
  };

  const patchDetail = (key: string, value: LiveEditDetailValue) => {
    patch({ details: { ...draft.details, [key]: value } }, `details.${key}`);
  };

  const addFacility = () => {
    const value = facilityInput.trim();
    if (!value) return;
    if (draft.facilities.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      setFacilityInput('');
      return;
    }
    patch({ facilities: [...draft.facilities, value] }, 'facilities');
    setFacilityInput('');
  };

  const blockedEntries = Object.entries(schema.blockedFields).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );

  const renderDetailField = (field: LiveEditFieldDefinition) => {
    const id = detailInputId(field);
    const value = draft.details[field.key];
    const error = detailError(errors, field.key);

    if (field.kind === 'boolean') {
      return (
        <label
          key={field.key}
          htmlFor={id}
          className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => patchDetail(field.key, event.target.checked)}
            className="h-4 w-4 rounded accent-indigo-600"
          />
          <span>
            {field.label}
            {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
          </span>
          {error ? <span className="text-[11px] font-semibold text-rose-600">{error}</span> : null}
        </label>
      );
    }

    if (field.kind === 'select') {
      return (
        <FieldShell key={field.key} id={id} label={field.label} required={field.required} error={error} help={field.help}>
          <select
            id={id}
            value={String(value ?? '')}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            onChange={(event) => patchDetail(field.key, event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Select…</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FieldShell>
      );
    }

    if (field.kind === 'tier-pricing' || field.kind === 'time-list') {
      return (
        <FieldShell key={field.key} id={id} label={field.label} required={field.required} error={error} help={field.help}>
          <textarea
            id={id}
            rows={field.kind === 'tier-pricing' ? 4 : 2}
            value={String(value ?? '')}
            disabled={disabled}
            placeholder={field.placeholder}
            aria-invalid={Boolean(error)}
            onChange={(event) => patchDetail(field.key, event.target.value)}
            className={INPUT_CLASS}
          />
        </FieldShell>
      );
    }

    const inputType =
      field.kind === 'number' || field.kind === 'currency'
        ? 'number'
        : field.kind === 'url'
          ? 'url'
          : field.kind === 'date'
            ? 'date'
            : 'text';

    return (
      <FieldShell key={field.key} id={id} label={field.label} required={field.required} error={error} help={field.help}>
        <input
          id={id}
          type={inputType}
          min={inputType === 'number' ? field.min : undefined}
          max={inputType === 'number' ? field.max : undefined}
          value={String(value ?? '')}
          disabled={disabled}
          placeholder={field.placeholder}
          aria-invalid={Boolean(error)}
          onChange={(event) =>
            patchDetail(
              field.key,
              inputType === 'number' ? event.target.value : event.target.value
            )
          }
          className={INPUT_CLASS}
        />
      </FieldShell>
    );
  };

  return (
    <form
      className="space-y-4"
      data-testid="live-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly && !saving) onSave();
      }}
      noValidate
    >
      {readOnly ? (
        <div
          role="alert"
          data-testid="live-edit-readonly"
          className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{readOnlyReason || 'You do not have permission to edit this listing.'}</span>
        </div>
      ) : null}

      {blockedEntries.length > 0 ? (
        <div
          data-testid="live-edit-blocked-fields"
          className="rounded-2xl border border-slate-300 bg-slate-100/70 p-3 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
        >
          <p className="mb-1 font-black uppercase tracking-wider text-slate-500">Not editable in this build</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {blockedEntries.map(([key, reason]) => (
              <li key={key}>
                <strong className="capitalize">{key}</strong>: {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback ? (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          data-testid={feedback.tone === 'error' ? 'live-edit-error' : 'live-edit-success'}
          className={`flex items-start gap-2 rounded-2xl border p-3 text-xs font-semibold ${
            feedback.tone === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
              : feedback.tone === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                : feedback.tone === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
          }`}
        >
          {feedback.tone === 'error' || feedback.tone === 'warning' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      {auditNotice ? (
        <p
          data-testid="live-edit-audit"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          {auditNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          {LIVE_EDIT_MODULE_LABELS[module]}
        </span>
        <span aria-hidden="true">·</span>
        <span>{listing.status.replaceAll('_', ' ')}</span>
        <span aria-hidden="true">·</span>
        <span>Updated {listing.updatedAt ? listing.updatedAt.replace('T', ' ').slice(0, 16) : 'unknown'}</span>
        {dirty ? (
          <span
            data-testid="live-edit-dirty"
            className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
          >
            Unsaved changes
          </span>
        ) : null}
      </div>

      <Section title="Content" icon={<Sparkles className="h-4 w-4" />}>
        <FieldShell
          id="live-edit-title"
          label={module === 'movies' ? 'Cinema name' : 'Title'}
          required
          error={errors.title}
        >
          <input
            id="live-edit-title"
            data-testid="live-edit-title"
            value={draft.title}
            disabled={disabled || !capabilities.canEditContent}
            maxLength={160}
            aria-invalid={Boolean(errors.title)}
            onChange={(event) => patch({ title: event.target.value }, 'title')}
            className={INPUT_CLASS}
          />
        </FieldShell>

        {module === 'movies' ? (
          <FieldShell id="live-edit-screen-name" label="Screen name" required error={errors.subcategory}>
            <input
              id="live-edit-screen-name"
              data-testid="live-edit-screen-name"
              value={draft.subcategory}
              disabled={disabled || !capabilities.canEditContent}
              maxLength={80}
              aria-invalid={Boolean(errors.subcategory)}
              placeholder="e.g. Screen 3"
              onChange={(event) => patch({ subcategory: event.target.value }, 'subcategory')}
              className={INPUT_CLASS}
            />
          </FieldShell>
        ) : null}

        {schema.supportsImages || schema.blockedFields.description ? (
          <FieldShell id="live-edit-description" label="Description" error={errors.description}>
            <textarea
              id="live-edit-description"
              rows={5}
              value={draft.description}
              disabled={disabled || Boolean(schema.blockedFields.description)}
              maxLength={schema.descriptionMaxLength || undefined}
              aria-invalid={Boolean(errors.description)}
              placeholder={
                schema.blockedFields.description
                  ? 'Not editable for this module'
                  : 'Describe the space, what is included, and any house rules.'
              }
              onChange={(event) => patch({ description: event.target.value }, 'description')}
              className={INPUT_CLASS}
            />
            {schema.descriptionMaxLength > 0 ? (
              <p className="mt-1 text-right text-[10px] text-slate-400">
                {draft.description.length}/{schema.descriptionMaxLength}
              </p>
            ) : null}
          </FieldShell>
        ) : null}
      </Section>

      {schema.supportsPricing ? (
        <Section
          title="Pricing"
          icon={<Tag className="h-4 w-4" />}
          description="Price and unit are written to the listing row, not just the payload."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell id="live-edit-price" label="Price (₹)" required error={errors.price}>
              <input
                id="live-edit-price"
                data-testid="live-edit-price"
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                disabled={disabled || !capabilities.canEditPricing}
                aria-invalid={Boolean(errors.price)}
                onChange={(event) => patch({ price: event.target.value }, 'price')}
                className={INPUT_CLASS}
              />
            </FieldShell>
            <FieldShell id="live-edit-price-unit" label="Price unit" required error={errors.priceUnit}>
              <input
                id="live-edit-price-unit"
                list="live-edit-price-units"
                value={draft.priceUnit}
                disabled={disabled || !capabilities.canEditPricing}
                aria-invalid={Boolean(errors.priceUnit)}
                onChange={(event) => patch({ priceUnit: event.target.value }, 'priceUnit')}
                className={INPUT_CLASS}
              />
              <datalist id="live-edit-price-units">
                {schema.priceUnits.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </FieldShell>
          </div>
        </Section>
      ) : null}

      {schema.supportsCategories ? (
        <Section title="Category" icon={<Tag className="h-4 w-4" />} description="Category must stay inside this module.">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell id="live-edit-category" label="Category ID" required error={errors.categoryId}>
              <input
                id="live-edit-category"
                list="live-edit-categories"
                value={draft.categoryId}
                disabled={disabled || !capabilities.canEditCategories}
                aria-invalid={Boolean(errors.categoryId)}
                onChange={(event) => patch({ categoryId: event.target.value }, 'categoryId')}
                className={INPUT_CLASS}
              />
              <datalist id="live-edit-categories">
                {categoryOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </FieldShell>
            <FieldShell id="live-edit-subcategory" label="Subcategory" required error={errors.subcategory}>
              <input
                id="live-edit-subcategory"
                list="live-edit-subcategories"
                value={draft.subcategory}
                disabled={disabled || !capabilities.canEditCategories}
                aria-invalid={Boolean(errors.subcategory)}
                onChange={(event) => patch({ subcategory: event.target.value }, 'subcategory')}
                className={INPUT_CLASS}
              />
              <datalist id="live-edit-subcategories">
                {subcategoryOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </FieldShell>
          </div>
        </Section>
      ) : null}

      {schema.supportsAvailability ? (
        <Section
          title="Availability"
          icon={<Clock3 className="h-4 w-4" />}
          description="Owner-reported availability stored with the listing."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell id="live-edit-availability-status" label="Availability status" error={errors['availability.status']}>
              <select
                id="live-edit-availability-status"
                value={draft.availability.status}
                disabled={disabled || !capabilities.canEditAvailability}
                onChange={(event) =>
                  patchAvailability(
                    { status: event.target.value as LiveEditDraft['availability']['status'] },
                    'status'
                  )
                }
                className={INPUT_CLASS}
              >
                <option value="available">Available</option>
                <option value="limited">Limited availability</option>
                <option value="sold_out">Sold out / unavailable</option>
                <option value="not_reported">Not reported</option>
              </select>
            </FieldShell>
            <FieldShell id="live-edit-availability-units" label="Units available" error={errors['availability.unitsAvailable']}>
              <input
                id="live-edit-availability-units"
                type="number"
                min={0}
                step={1}
                value={draft.availability.unitsAvailable}
                disabled={disabled || !capabilities.canEditAvailability}
                placeholder="e.g. 4 beds / 12 seats"
                aria-invalid={Boolean(errors['availability.unitsAvailable'])}
                onChange={(event) => patchAvailability({ unitsAvailable: event.target.value }, 'unitsAvailable')}
                className={INPUT_CLASS}
              />
            </FieldShell>
            <FieldShell id="live-edit-availability-date" label="Next available from" error={errors['availability.nextAvailableFrom']}>
              <input
                id="live-edit-availability-date"
                type="date"
                value={draft.availability.nextAvailableFrom}
                disabled={disabled || !capabilities.canEditAvailability}
                aria-invalid={Boolean(errors['availability.nextAvailableFrom'])}
                onChange={(event) => patchAvailability({ nextAvailableFrom: event.target.value }, 'nextAvailableFrom')}
                className={INPUT_CLASS}
              />
            </FieldShell>
            <FieldShell id="live-edit-availability-note" label="Availability note" error={errors['availability.note']}>
              <input
                id="live-edit-availability-note"
                value={draft.availability.note}
                maxLength={300}
                disabled={disabled || !capabilities.canEditAvailability}
                placeholder="e.g. 2 beds free from 1 Dec"
                aria-invalid={Boolean(errors['availability.note'])}
                onChange={(event) => patchAvailability({ note: event.target.value }, 'note')}
                className={INPUT_CLASS}
              />
            </FieldShell>
          </div>
          {capabilities.canEditModerationAvailability ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Super Admin: this status also updates the provider-reported moderation flag on the listing row.
            </p>
          ) : null}
        </Section>
      ) : null}

      {schema.supportsImages ? (
        <Section title={`Images (${draft.images.length}/${schema.imageLimit})`} icon={<Images className="h-4 w-4" />}>
          <div className="space-y-2">
            {draft.images.map((image, index) => (
              <div key={`image-${index}`} className="flex items-start gap-2">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                  {isRenderableListingImageSource(image) ? (
                    <SafeImage category="general"
                      src={image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Image ${index + 1} URL`}
                    value={image}
                    disabled={disabled || !capabilities.canEditImages}
                    onChange={(event) => {
                      const next = [...draft.images];
                      next[index] = event.target.value;
                      patch({ images: next }, `images.${index}`);
                    }}
                    placeholder="https://"
                    aria-invalid={Boolean(errors[`images.${index}`])}
                    className={INPUT_CLASS}
                  />
                  {errors[`images.${index}`] ? (
                    <p className={ERROR_CLASS} role="alert">
                      {errors[`images.${index}`]}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={`Remove image ${index + 1}`}
                  disabled={disabled || !capabilities.canEditImages}
                  onClick={() => patch({ images: draft.images.filter((_, position) => position !== index) }, 'images')}
                  className="mt-1 rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 dark:border-slate-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {draft.images.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No images yet. Add a secure https:// image URL.</p>
            ) : null}
            {errors.images ? (
              <p className={ERROR_CLASS} role="alert">
                {errors.images}
              </p>
            ) : null}
            <button
              type="button"
              disabled={
                disabled || !capabilities.canEditImages || draft.images.length >= schema.imageLimit
              }
              onClick={() => patch({ images: [...draft.images, ''] }, 'images')}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              <Plus className="h-4 w-4" /> Add image
            </button>
          </div>
        </Section>
      ) : null}

      {schema.supportsFacilities ? (
        <Section title="Facilities" icon={<Sparkles className="h-4 w-4" />}>
          <div className="flex flex-wrap gap-1.5">
            {draft.facilities.map((facility, index) => (
              <span
                key={`${facility}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {facility}
                <button
                  type="button"
                  aria-label={`Remove facility ${facility}`}
                  disabled={disabled || !capabilities.canEditFacilities}
                  onClick={() =>
                    patch({ facilities: draft.facilities.filter((_, position) => position !== index) }, 'facilities')
                  }
                  className="text-slate-400 hover:text-rose-600 disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {draft.facilities.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No facilities listed.</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="Add facility"
              value={facilityInput}
              disabled={disabled || !capabilities.canEditFacilities}
              onChange={(event) => setFacilityInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addFacility();
                }
              }}
              placeholder="e.g. Power backup"
              maxLength={60}
              className={INPUT_CLASS}
            />
            <button
              type="button"
              onClick={addFacility}
              disabled={disabled || !capabilities.canEditFacilities || !facilityInput.trim()}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {schema.facilitySuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {schema.facilitySuggestions
                .filter(
                  (suggestion) =>
                    !draft.facilities.some((entry) => entry.toLowerCase() === suggestion.toLowerCase())
                )
                .slice(0, 8)
                .map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={disabled || !capabilities.canEditFacilities}
                    onClick={() => patch({ facilities: [...draft.facilities, suggestion] }, 'facilities')}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                  >
                    + {suggestion}
                  </button>
                ))}
            </div>
          ) : null}
          {errors.facilities ? (
            <p className={ERROR_CLASS} role="alert">
              {errors.facilities}
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section
        title={module === 'movies' ? 'Screen, showtimes & ticket policy' : 'Listing details'}
        icon={<ShieldAlert className="h-4 w-4" />}
        description={
          module === 'movies'
            ? 'These fields are written through the authorized cinema screen endpoint.'
            : 'Module-specific details stored in the listing payload.'
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {schema.detailFields.map((field) => renderDetailField(field))}
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button
          type="submit"
          data-testid="live-edit-save"
          disabled={readOnly || saving || !dirty}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          data-testid="live-edit-cancel"
          disabled={saving || !dirty}
          onClick={onCancel}
          className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onReload}
          disabled={saving}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reload
        </button>
        <span className="ml-auto text-[10px] font-medium text-slate-400">
          Server re-verifies your role and ownership on every save.
        </span>
      </div>
    </form>
  );
}
