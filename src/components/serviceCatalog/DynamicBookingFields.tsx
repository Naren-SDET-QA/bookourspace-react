import type { ServiceBookingFieldValues, ServiceCategoryConfig, ServiceFieldType } from '../../lib/serviceCatalog';
import { BookingDocumentField, type BookingDocumentValue } from './BookingDocumentField';

function fieldInputType(type: ServiceFieldType): string {
  switch (type) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'phone': return 'tel';
    case 'email': return 'email';
    default: return 'text';
  }
}

export function DynamicBookingFields({
  config,
  values,
  onValue,
  deliveryMode,
  onDeliveryMode,
  quantity,
  onQuantity,
  recurrenceFrequency,
  onRecurrenceFrequency,
  recurrenceOccurrences,
  onRecurrenceOccurrences,
  documents,
  onDocument,
}: {
  config: ServiceCategoryConfig;
  values: ServiceBookingFieldValues;
  onValue: (key: string, value: string | number | boolean | string[] | null) => void;
  deliveryMode: string;
  onDeliveryMode: (value: string) => void;
  quantity: number;
  onQuantity: (value: number) => void;
  recurrenceFrequency: string;
  onRecurrenceFrequency: (value: string) => void;
  recurrenceOccurrences: number | null;
  onRecurrenceOccurrences: (value: number) => void;
  documents: Record<string, BookingDocumentValue>;
  onDocument: (key: string, value: BookingDocumentValue) => void;
}) {
  return (
    <div className="space-y-4">
      {config.deliveryModes.length > 0 && (
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
          Delivery option
          <select value={deliveryMode} onChange={(event) => onDeliveryMode(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
            {config.deliveryModes.map((mode) => <option key={mode} value={mode}>{mode.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      )}
      {config.fields.length > 0 && (
        <section className="space-y-3" aria-labelledby="dynamic-fields-title">
          <h3 id="dynamic-fields-title" className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Service details</h3>
          {config.fields.map((field) => {
            const value = values[field.key];
            if (field.type === 'textarea') {
              return (
                <label key={field.key} className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  {field.label} {field.required && <span className="text-rose-600">*</span>}
                  <textarea
                    rows={3}
                    required={field.required}
                    maxLength={field.maxLength || 2000}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onValue(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                  {field.helpText && <span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">{field.helpText}</span>}
                </label>
              );
            }
            if (field.type === 'select') {
              return (
                <label key={field.key} className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  {field.label} {field.required && <span className="text-rose-600">*</span>}
                  <select
                    required={field.required}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onValue(field.key, event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="">Choose…</option>
                    {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  {field.helpText && <span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">{field.helpText}</span>}
                </label>
              );
            }
            if (field.type === 'multiselect') {
              const selected = Array.isArray(value) ? value : [];
              return (
                <fieldset key={field.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <legend className="px-1 text-xs font-bold text-slate-600 dark:text-slate-300">{field.label} {field.required && <span className="text-rose-600">*</span>}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(field.options || []).map((option) => (
                      <label key={option} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold dark:border-slate-700">
                        <input
                          type="checkbox"
                          checked={selected.includes(option)}
                          onChange={(event) => onValue(field.key, event.target.checked ? [...selected, option] : selected.filter((entry) => entry !== option))}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }
            if (field.type === 'checkbox') {
              return (
                <label key={field.key} className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={value === true} onChange={(event) => onValue(field.key, event.target.checked)} /> {field.label}
                </label>
              );
            }
            if (field.type === 'document') {
              return (
                <BookingDocumentField
                  key={field.key}
                  requirement={{ key: field.key, label: field.label, required: field.required, verificationRequired: false }}
                  value={documents[field.key]}
                  onChange={(next) => onDocument(field.key, next)}
                />
              );
            }
            return (
              <label key={field.key} className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                {field.label} {field.required && <span className="text-rose-600">*</span>}
                <input
                  type={fieldInputType(field.type)}
                  required={field.required}
                  maxLength={field.maxLength}
                  value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
                  onChange={(event) => onValue(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)}
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                {field.helpText && <span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">{field.helpText}</span>}
              </label>
            );
          })}
        </section>
      )}

      {config.pricing.quantityEnabled && (
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
          Quantity ({config.pricing.unit || 'units'})
          <input
            type="number"
            min={config.pricing.minQuantity}
            max={config.pricing.maxQuantity}
            value={quantity}
            onChange={(event) => onQuantity(Number(event.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">Between {config.pricing.minQuantity} and {config.pricing.maxQuantity}.</span>
        </label>
      )}

      {config.recurring.enabled && (
        <section className="rounded-2xl border border-sky-200 p-3 dark:border-sky-900">
          <h3 className="text-xs font-black text-sky-900 dark:text-sky-100">Recurring schedule</h3>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Choose a repeat or leave it as a one-time delivery.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Repeats
              <select value={recurrenceFrequency} onChange={(event) => onRecurrenceFrequency(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <option value="none">One time only</option>
                {config.recurring.frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
              </select>
            </label>
            {recurrenceFrequency !== 'none' && (
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Deliveries
                <input type="number" min={1} max={config.recurring.maxOccurrences} value={recurrenceOccurrences ?? config.recurring.maxOccurrences} onChange={(event) => onRecurrenceOccurrences(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
            )}
          </div>
        </section>
      )}

      {config.documents.length > 0 && (
        <section className="space-y-2" aria-labelledby="documents-title">
          <h3 id="documents-title" className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Documents</h3>
          {config.documents.map((requirement) => (
            <BookingDocumentField
              key={requirement.key}
              requirement={requirement}
              value={documents[requirement.key]}
              onChange={(next) => onDocument(requirement.key, next)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

export default DynamicBookingFields;
