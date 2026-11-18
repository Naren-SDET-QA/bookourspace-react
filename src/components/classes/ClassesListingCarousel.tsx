import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourseListing } from '../../data/classesTimingsData';
import SafeImage from '../SafeImage';
import { pickKindShowcase } from './classesListingKind';
import { ClassesServiceCard } from './ClassesServiceCard';
import {
  fillShelf,
  isShelfSample,
  type ClassesShelfDef,
  type ShelfCardItem,
  type ShelfSample,
} from './classesShelfCatalog';

type CarouselProps = {
  title: string;
  count: number;
  items: ShelfCardItem[];
  onOpen: (course: CourseListing) => void;
  onViewAll?: () => void;
  showHeading?: boolean;
};

function SampleCard({ item, onSelect }: { item: ShelfSample; onSelect: () => void }) {
  return (
    <article className="bos-svc-card bos-svc-card--airbnb min-w-0 text-left">
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe500]"
        aria-label={`${item.title} (sample preview)`}
      >
        <span className="bos-svc-photo relative block aspect-[4/3] overflow-hidden rounded-xl bg-[#ebebeb]">
          <SafeImage
            src={item.image}
            alt=""
            category="classes"
            className="absolute inset-0 h-full w-full object-cover"
            sizes="(max-width: 639px) 46vw, (max-width: 1023px) 24vw, 14vw"
          />
          <span className="absolute left-2 top-2 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#222]">
            Sample
          </span>
        </span>
        <span className="mt-2 block">
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#222]">{item.title}</span>
          <span className="mt-0.5 block truncate text-[12px] text-[#6a6a6a]">Sample preview</span>
          <span className="block truncate text-[12px] text-[#6a6a6a]">{item.location}</span>
          <span className="block truncate text-[12px] text-[#6a6a6a]">{item.mode} · fees not published</span>
        </span>
      </button>
    </article>
  );
}

export function ClassesListingCarousel({ title, count, items, onOpen, onViewAll, showHeading = true }: CarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [sampleNotice, setSampleNotice] = useState<string | null>(null);

  const syncArrows = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth - 4;
    setCanPrev(node.scrollLeft > 4);
    setCanNext(max > 4 && node.scrollLeft < max);
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    syncArrows();
    node.addEventListener('scroll', syncArrows, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncArrows) : null;
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', syncArrows);
      observer?.disconnect();
    };
  }, [syncArrows, items.length]);

  const scrollByPage = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <section className="relative pt-1" aria-label={title}>
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {showHeading ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="truncate text-[16px] font-semibold tracking-tight text-[#222] sm:text-[18px]">{title}</h2>
              {count > 0 ? (
                <span className="text-[12px] font-medium text-[#6a6a6a]">
                  {count} {count === 1 ? 'listing' : 'listings'}
                </span>
              ) : (
                <span className="text-[12px] font-medium text-[#6a6a6a]">Sample preview</span>
              )}
            </div>
          ) : (
            <span className="sr-only">{title}</span>
          )}
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            aria-label={`View all ${title}`}
            className="shrink-0 text-[13px] font-semibold text-[#222] underline decoration-[#ddd] underline-offset-4 hover:decoration-[#222]"
          >
            View all
          </button>
        ) : null}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!canPrev}
            aria-label={`Previous ${title} listings`}
            className="grid h-8 w-8 place-items-center rounded-full border border-[#b0b0b0] bg-white text-[#222] shadow-sm disabled:cursor-default disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!canNext}
            aria-label={`Next ${title} listings`}
            className="grid h-8 w-8 place-items-center rounded-full border border-[#b0b0b0] bg-white text-[#222] shadow-sm disabled:cursor-default disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={scroller} className="bos-listing-carousel">
        {items.map((item) =>
          isShelfSample(item) ? (
            <SampleCard key={item.id} item={item} onSelect={() => setSampleNotice(item.title)} />
          ) : (
            <ClassesServiceCard key={item.id} course={item} onOpen={onOpen} layout="shelf" />
          ),
        )}
      </div>

      {sampleNotice ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sample-preview-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setSampleNotice(null)}
        >
          <div
            className="max-w-sm rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="sample-preview-title" className="text-[15px] font-semibold text-[#222]">
              Sample content
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6a6a6a]">
              {sampleNotice} is labelled sample layout preview. It is not a published class, provider or rating.
            </p>
            <button
              type="button"
              onClick={() => setSampleNotice(null)}
              className="mt-3 rounded-lg bg-[#222] px-3 py-2 text-[13px] font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ClassesSectionShelves({
  shelves,
  courses,
  onOpen,
  onViewAll,
  titleMode = 'full',
  inventory,
}: {
  shelves: ClassesShelfDef[];
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
  onViewAll?: (shelf: ClassesShelfDef) => void;
  /** Subject-only titles on a class page so the page heading stays unique. */
  titleMode?: 'full' | 'subject';
  /** Unfiltered catalogue used to decide whether sample cards are allowed. */
  inventory?: CourseListing[];
}) {
  if (shelves.length === 0) return null;
  return (
    <div className="space-y-7 sm:space-y-8">
      {shelves.map((shelf) => {
        const items = fillShelf(courses, shelf, inventory);
        if (items.length === 0) return null;
        const count = items.filter((item) => !isShelfSample(item)).length;
        return (
          <ClassesListingCarousel
            key={shelf.id}
            title={titleMode === 'subject' ? shelf.subjectLabel : shelf.title}
            count={count}
            items={items}
            onOpen={onOpen}
            onViewAll={onViewAll ? () => onViewAll(shelf) : undefined}
          />
        );
      })}
    </div>
  );
}

export function ClassesListingsStrip({
  title,
  courses,
  onOpen,
  onViewAll,
  showHeading = true,
}: {
  title: string;
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
  onViewAll?: () => void;
  showHeading?: boolean;
}) {
  if (courses.length === 0) return null;
  return (
    <ClassesListingCarousel
      title={title}
      count={courses.length}
      items={courses}
      onOpen={onOpen}
      onViewAll={onViewAll}
      showHeading={showHeading}
    />
  );
}

export function ClassesKindShowcase({
  courses,
  onOpen,
}: {
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
}) {
  const picked = pickKindShowcase(courses);
  if (picked.length === 0) return null;
  return (
    <div className="mt-3">
      <ClassesListingCarousel
        title="Admissions, tuition and training"
        count={picked.length}
        items={picked}
        onOpen={onOpen}
      />
    </div>
  );
}
