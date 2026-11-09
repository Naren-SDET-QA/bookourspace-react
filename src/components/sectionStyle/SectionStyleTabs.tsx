import React from 'react';

export type SectionStyleNumber = 1 | 2 | 3;

/**
 * The single Style 1 / Style 2 / Style 3 switcher shown in every section.
 * Switching changes the section immediately and keeps the deep link in sync.
 */
export function SectionStyleTabs({
  active,
  onChange,
  label,
  className = '',
}: {
  active: SectionStyleNumber;
  onChange: (style: SectionStyleNumber) => void;
  label: string;
  className?: string;
}) {
  const options: Array<{ value: SectionStyleNumber; label: string }> = [
    { value: 1, label: 'Style 1' },
    { value: 2, label: 'Style 2' },
    { value: 3, label: 'Style 3' },
  ];
  return (
    <div className={`flex justify-center px-3 py-2 ${className}`}>
      <div
        className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = active === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${
                selected
                  ? 'bg-[#4A148C] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SectionStyleTabs;
