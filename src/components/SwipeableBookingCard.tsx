import React, { useRef, useState } from 'react';
import { Trash2, Ban, ChevronLeft, Download, Printer } from 'lucide-react';
import { Booking, MarketplaceListing } from '../types/marketplace';
import { UniversalBarcode } from './UniversalBarcode';

interface SwipeableBookingCardProps {
  booking: Booking;
  matchedListing?: MarketplaceListing;
  bookingCode: string;
  barcodeLabel: string;
  moduleTag: string;
  currentLang: string;
  onOpenDetails: (listing: MarketplaceListing) => void;
  onCancelBooking: (booking: Booking) => void;
  onDeleteBooking: (booking: Booking) => void;
  onDownloadReceipt: (booking: Booking) => void;
  onPrintReceipt: (booking: Booking) => void;
}

const SNAP_OPEN_WIDTH = -148;
const SWIPE_DELETE_THRESHOLD = -210;

export const SwipeableBookingCard: React.FC<SwipeableBookingCardProps> = ({
  booking,
  matchedListing,
  bookingCode,
  barcodeLabel,
  moduleTag,
  currentLang,
  onOpenDetails,
  onCancelBooking,
  onDeleteBooking,
  onDownloadReceipt,
  onPrintReceipt,
}) => {
  const [offsetX, setOffsetX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const baseOffsetRef = useRef<number>(0);
  const directionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const pointerActiveRef = useRef<boolean>(false);

  const triggerDeleteWithAnimation = () => {
    setIsRemoving(true);
    setOffsetX(-420);
    window.setTimeout(() => {
      onDeleteBooking(booking);
    }, 210);
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    if (isRemoving) return;
    startXRef.current = clientX;
    startYRef.current = clientY;
    baseOffsetRef.current = offsetX;
    directionLockedRef.current = null;
    pointerActiveRef.current = true;
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!pointerActiveRef.current || isRemoving) return;
    const deltaX = clientX - startXRef.current;
    const deltaY = clientY - startYRef.current;

    if (!directionLockedRef.current) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      directionLockedRef.current =
        Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }

    if (directionLockedRef.current !== 'horizontal') return;

    const rawNext = baseOffsetRef.current + deltaX;
    // Allow slight right bounce up to +14px, and left swipe down to -260px
    const clamped = Math.max(-260, Math.min(14, rawNext));
    setOffsetX(clamped);
  };

  const handleDragEnd = () => {
    if (!pointerActiveRef.current || isRemoving) return;
    pointerActiveRef.current = false;
    setIsDragging(false);

    if (offsetX <= SWIPE_DELETE_THRESHOLD) {
      triggerDeleteWithAnimation();
    } else if (offsetX <= -64) {
      setOffsetX(SNAP_OPEN_WIDTH);
    } else {
      setOffsetX(0);
    }
  };

  const toggleActionTray = () => {
    if (isRemoving) return;
    setOffsetX((prev) => (prev < -40 ? 0 : SNAP_OPEN_WIDTH));
  };

  const isActionTrayOpen = offsetX <= -40;
  const isBeyondDeleteThreshold = offsetX <= SWIPE_DELETE_THRESHOLD;

  const statusBadgeStyle =
    booking.status === 'cancelled'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
      : booking.status === 'pending'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl select-none transition-all duration-200 ${
        isRemoving ? 'opacity-0 max-h-0 scale-95' : 'opacity-100 max-h-[520px]'
      }`}
    >
      {/* Background Destructive / Cancel Action Tray (Revealed on Left Swipe) */}
      <div
        className={`absolute inset-0 rounded-2xl flex items-stretch justify-end transition-colors duration-150 ${
          isBeyondDeleteThreshold
            ? 'bg-rose-600'
            : 'bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600'
        }`}
      >
        {isBeyondDeleteThreshold ? (
          <div className="flex items-center justify-end pr-6 text-white font-black text-xs gap-2 animate-pulse">
            <Trash2 className="w-5 h-5" />
            <span>
              {currentLang === 'te' ? 'తొలగించడానికి వదలండి' : 'Release to Delete'}
            </span>
          </div>
        ) : (
          <div className="flex items-stretch h-full">
            {booking.status !== 'cancelled' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelBooking(booking);
                  setOffsetX(0);
                }}
                className="w-[74px] bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white flex flex-col items-center justify-center gap-1 px-2 text-[10px] font-black cursor-pointer transition-colors"
                title="Cancel Appointment"
              >
                <Ban className="w-4 h-4" />
                <span>{currentLang === 'te' ? 'రద్దు' : 'Cancel'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerDeleteWithAnimation();
              }}
              className={`${
                booking.status === 'cancelled' ? 'w-[148px]' : 'w-[74px]'
              } bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white flex flex-col items-center justify-center gap-1 px-2 text-[10px] font-black cursor-pointer transition-colors`}
              title="Remove Booking"
            >
              <Trash2 className="w-4 h-4" />
              <span>{currentLang === 'te' ? 'తొలగించు' : 'Delete'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Foreground Swipeable Booking Card */}
      <div
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) handleDragStart(touch.clientX, touch.clientY);
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) handleDragMove(touch.clientX, touch.clientY);
        }}
        onTouchEnd={handleDragEnd}
        onTouchCancel={handleDragEnd}
        onMouseDown={(e) => {
          // Ignore mouse drag if clicking directly on a button
          if ((e.target as HTMLElement).closest('button')) return;
          handleDragStart(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          if (!pointerActiveRef.current) return;
          handleDragMove(e.clientX, e.clientY);
        }}
        onMouseUp={handleDragEnd}
        onMouseLeave={() => {
          if (pointerActiveRef.current) handleDragEnd();
        }}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          transition: isDragging
            ? 'none'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative z-10 p-3.5 rounded-2xl border ${
          booking.status === 'cancelled'
            ? 'border-rose-200/80 dark:border-rose-900/50 bg-white dark:bg-slate-900 opacity-85'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        } space-y-2.5 shadow-xs cursor-grab active:cursor-grabbing`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${statusBadgeStyle}`}
              >
                {booking.status}
              </span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {booking.scheduledDate} • {booking.timeSlot}
              </span>
            </div>
            <h4
              className={`text-xs sm:text-sm font-black truncate ${
                booking.status === 'cancelled'
                  ? 'line-through text-slate-400 dark:text-slate-500'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {booking.listingTitle}
            </h4>
            <div className="text-[11px] font-bold text-[#4338CA] dark:text-indigo-400">
              ₹{booking.totalAmount.toLocaleString('en-IN')} • {booking.customerName}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {matchedListing && (
              <button
                type="button"
                onClick={() => onOpenDetails(matchedListing)}
                className="px-3 py-1.5 rounded-xl bg-[#4338CA] text-white text-[11px] font-black shrink-0 cursor-pointer hover:bg-indigo-800 transition-colors"
              >
                {currentLang === 'te' ? 'వివరాలు' : 'Details'}
              </button>
            )}

            {/* Quick Swipe Reveal / Cancel Trigger Pill for Touch & Desktop */}
            <button
              type="button"
              onClick={toggleActionTray}
              aria-label="Swipe actions"
              title="Swipe left or click to Cancel / Delete"
              className={`px-2 py-1.5 rounded-xl border text-[10px] font-black flex items-center gap-0.5 cursor-pointer transition-colors ${
                isActionTrayOpen
                  ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-300'
                  : 'bg-slate-100 hover:bg-rose-50 border-slate-200/80 text-slate-500 hover:text-rose-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              <ChevronLeft
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isActionTrayOpen ? 'rotate-180' : ''
                }`}
              />
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scannable Booking Pass / M-Ticket Barcode */}
        <UniversalBarcode
          value={bookingCode}
          displayCode={bookingCode}
          label={barcodeLabel}
          sublabel={`${booking.listingTitle} • ${booking.scheduledDate} • ${booking.timeSlot}`}
          moduleTag={moduleTag}
          variant="compact"
          showQr={true}
        />

        {/* Formal GST-Compliant PDF Receipt & Invoice Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            🧾 GSTIN Validated Tax Invoice (CGST 9% + SGST 9% + QR)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDownloadReceipt(booking)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>
                {currentLang === 'te'
                  ? 'GST PDF రసీదు డౌన్‌లోడ్'
                  : 'Download GST PDF'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onPrintReceipt(booking)}
              className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 text-[10px] font-black flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3 h-3" />
              <span>{currentLang === 'te' ? 'ప్రింట్' : 'Print'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
