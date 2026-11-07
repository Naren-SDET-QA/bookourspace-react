import React, { useEffect, useState } from 'react';
import {
  fetchPublishedPage,
  subscribePublishedUpdates,
  type PublishedPage,
} from '../../lib/builder/client';
import type { NormalizedBlock } from '../../lib/builder/validate';
import SafeImage from '../SafeImage';

/**
 * Customer-facing builder region.
 *
 * It renders only presentation blocks from the published document and never
 * replaces the marketplace's booking, inventory, pricing or listing logic:
 * booking/inventory/listing components become navigation affordances to the
 * existing functional feed below. If there is no published document, no valid
 * cached document, or the API fails, the region renders nothing and the
 * original page is untouched.
 */
export interface PublishedBuilderRegionProps {
  pageKey: string;
  className?: string;
}

function safeStyle(block: NormalizedBlock): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (block.style?.background) style.background = block.style.background;
  if (block.style?.textColor) style.color = block.style.textColor;
  if (block.style?.align) style.textAlign = block.style.align as React.CSSProperties['textAlign'];
  if (block.style?.padding) style.padding = `${Number(block.style.padding) * 2}px`;
  return style;
}

function goesToFeed(anchor: string) {
  return () => {
    if (typeof document === 'undefined') return;
    const target = document.getElementById(anchor);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function RegionBlock({ block, discoveryOnly = false }: { block: NormalizedBlock; discoveryOnly?: boolean }) {
  if (!block.visible) return null;
  const props = block.props as Record<string, any>;
  // Movies stays discovery-only: a published document can never introduce a
  // booking, inventory, availability, application, or payment affordance.
  // Action buttons that could imply booking are suppressed too; ordinary
  // discovery buttons still only scroll to the existing Movies feed.
  if (discoveryOnly && (
    ['booking_widget', 'inventory_widget', 'calendar', 'form', 'form_field', 'workflow_action'].includes(block.type)
    || (block.type === 'button' && ['open_booking', 'open_inventory'].includes(String(props.action)))
    || (block.type === 'hero' && ['open_booking', 'open_inventory'].includes(String(props.ctaAction)))
  )) return null;
  const style = safeStyle(block);
  const children = (block.children ?? []).map((child) => (
    <RegionBlock key={child.id} block={child} discoveryOnly={discoveryOnly} />
  ));

  switch (block.type) {
    case 'heading': {
      const level = props.level === 'h1' ? 1 : props.level === 'h3' ? 3 : props.level === 'h4' ? 4 : 2;
      const Tag = (`h${level}`) as keyof React.JSX.IntrinsicElements;
      return <Tag className="font-black tracking-tight text-slate-900 dark:text-white" style={style}>{String(props.text ?? '')}</Tag>;
    }
    case 'text':
      return <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300" style={style}>{String(props.text ?? '')}</p>;
    case 'image':
      return (
        <figure style={style}>
          {props.src ? <SafeImage src={String(props.src)} alt={String(props.alt ?? '')} category="general" className="max-h-64 w-full rounded-2xl object-cover" loading="lazy" /> : null}
          {props.caption ? <figcaption className="mt-1 text-xs text-slate-500">{String(props.caption)}</figcaption> : null}
        </figure>
      );
    case 'hero':
      return (
        <div className="relative overflow-hidden rounded-2xl p-5 text-white sm:p-7" style={{ background: 'linear-gradient(120deg,#312e81,#4338CA)', ...style }}>
          {props.imageUrl ? <SafeImage src={String(props.imageUrl)} alt="" category="general" className="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy" /> : null}
          <div className="relative">
            {props.badge ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{String(props.badge)}</span> : null}
            <h2 className="mt-2 text-xl font-black sm:text-2xl">{String(props.headline ?? '')}</h2>
            {props.subheadline ? <p className="mt-1 max-w-2xl text-sm text-white/85">{String(props.subheadline)}</p> : null}
            {props.ctaLabel ? (
              <button type="button" onClick={goesToFeed('bos-listings-feed-grid')} className="mt-3 rounded-xl bg-white px-4 py-2 text-xs font-black text-indigo-700">
                {String(props.ctaLabel)}
              </button>
            ) : null}
          </div>
        </div>
      );
    case 'announcement':
      return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900" style={style}>{String(props.text ?? '')}</div>;
    case 'badge':
      return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800" style={style}>{String(props.text ?? '')}</span>;
    case 'button':
      return (
        <button
          type="button"
          onClick={goesToFeed('bos-listings-feed-grid')}
          className={props.variant === 'secondary' ? 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700' : 'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white'}
          style={style}
        >
          {String(props.label ?? 'Continue')}
        </button>
      );
    case 'nav_menu':
      return (
        <nav className="flex flex-wrap gap-2 text-xs" style={style}>
          {String(props.items ?? '').split('\n').filter(Boolean).map((line, index) => {
            const [label, href] = line.split('|');
            return href && /^(https:\/\/|\/|#)/.test(href)
              ? <a key={index} href={href} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700">{label}</a>
              : <span key={index} className="rounded-full border border-slate-200 px-3 py-1">{label}</span>;
          })}
        </nav>
      );
    case 'section':
      return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" style={style}>
          {props.title ? <h3 className="mb-2 text-sm font-black text-slate-900 dark:text-white">{String(props.title)}</h3> : null}
          {props.description ? <p className="mb-2 text-xs text-slate-500">{String(props.description)}</p> : null}
          <div className="space-y-3">{children}</div>
        </section>
      );
    case 'tabs':
      return (
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800" style={style}>
          <div className="mb-2 flex flex-wrap gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-500">
            {String(props.tabs ?? '').split('\n').filter(Boolean).map((tab) => <span key={tab}>{tab}</span>)}
          </div>
          <div className="space-y-2">{children}</div>
        </div>
      );
    case 'card':
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" style={style}>
          {props.imageUrl ? <SafeImage src={String(props.imageUrl)} alt="" category="general" className="mb-2 h-28 w-full rounded-xl object-cover" loading="lazy" /> : null}
          <h4 className="text-sm font-black text-slate-900 dark:text-white">{String(props.title ?? '')}</h4>
          {props.body ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{String(props.body)}</p> : null}
          <div className="mt-2 space-y-2">{children}</div>
        </div>
      );
    case 'gallery':
      return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Number(props.columns ?? 3)},minmax(0,1fr))`, ...style }}>
          {String(props.images ?? '').split('\n').filter(Boolean).slice(0, 9).map((src, index) => (
            <SafeImage key={index} src={src} alt="" category="general" className="h-24 w-full rounded-xl object-cover" loading="lazy" />
          ))}
        </div>
      );
    case 'divider':
      return <div className="flex items-center gap-2 text-[10px] uppercase text-slate-400"><span className="h-px flex-1 bg-slate-200" />{String(props.label ?? '')}<span className="h-px flex-1 bg-slate-200" /></div>;
    case 'spacer':
      return <div style={{ height: `${Number(props.size ?? 4) * 4}px` }} />;
    case 'search_bar':
      return <div className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-400" style={style}>{String(props.placeholder ?? 'Search')}</div>;
    case 'filter_bar':
      return <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600" style={style}>Filters: {String(props.filters ?? '')}</div>;
    case 'card_grid':
    case 'listing_layout':
      return (
        <button type="button" onClick={goesToFeed('bos-listings-feed-grid')} className="w-full rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4 text-left text-xs font-semibold text-indigo-800" style={style}>
          Browse {String(props.module ?? 'platform')} listings in the live feed below →
        </button>
      );
    case 'table':
      return <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600" style={style}>Live {String(props.source ?? 'listings')} data is shown in the marketplace feed.</div>;
    case 'calendar':
      return <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600" style={style}>Availability is calculated by the live booking flow.</div>;
    case 'form':
      return (
        <div className="rounded-2xl border border-slate-200 p-4" style={style}>
          <h4 className="text-sm font-black text-slate-900 dark:text-white">{String(props.title ?? 'Form')}</h4>
          <div className="mt-2 space-y-2">{children}</div>
          <p className="mt-2 text-[11px] text-slate-400">Submit through the listing or booking flow below.</p>
        </div>
      );
    case 'form_field':
      return <div className="text-xs text-slate-500" style={style}>{String(props.label ?? '')}{props.required ? ' *' : ''}</div>;
    case 'booking_widget':
      return (
        <button type="button" onClick={goesToFeed('bos-listings-feed-grid')} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white" style={style}>
          Check availability and book
        </button>
      );
    case 'inventory_widget':
      return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800" style={style}>Live availability is shown on each listing below.</div>;
    case 'report':
    case 'workflow_action':
      return null;
    default:
      return null;
  }
}

export const PublishedBuilderRegion: React.FC<PublishedBuilderRegionProps> = ({ pageKey, className }) => {
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const result = await fetchPublishedPage(pageKey, controller.signal);
        if (!cancelled) {
          setPage(result.page);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    setPage(null);
    setFailed(false);
    void load();

    // Cross-tab and cross-device propagation. BroadcastChannel handles tabs on
    // this device; visibility + a slow poll let an already-open native WebView
    // or another browser pick up a publish without an app update.
    const unsubscribe = subscribePublishedUpdates((update) => {
      if (update.pageKey === '*' || update.pageKey === pageKey) void load();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);

    return () => {
      cancelled = true;
      controller?.abort();
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [pageKey]);

  const blocks = page?.document?.blocks ?? [];
  if (failed || !page || blocks.length === 0) return null;

  return (
    <div
      className={className ?? 'space-y-4'}
      data-builder-page={page.pageKey}
      data-builder-version={page.versionNumber}
    >
      {blocks.map((block) => (
        <RegionBlock key={block.id} block={block} discoveryOnly={pageKey === 'movies'} />
      ))}
    </div>
  );
};
