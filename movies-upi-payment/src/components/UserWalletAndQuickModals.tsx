import React, { useState } from 'react';
import {
  X,
  Wallet,
  Heart,
  Headphones,
  Gift,
  HelpCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Share2,
  Copy,
  Check,
  Download,
  Phone,
  MessageSquare,
  Sparkles,
  Trash2,
  Calendar,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { MarketplaceListing } from '../types/marketplace';
import { AppLanguage, getListingTitle } from '../utils/translations';
import { downloadGSTInvoicePDF } from '../utils/gstInvoiceGenerator';
import { triggerGlobalGlobeLoader } from './BOSBrandLogo';

export type QuickActionModalType =
  | null
  | 'favorites'
  | 'support'
  | 'refer_earn'
  | 'help_centre'
  | 'wallet';

export interface WalletLedgerEntry {
  id: string;
  date: string;
  title: string;
  category: 'commission' | 'subscription' | 'booking_cashback' | 'wallet_topup';
  type: 'credit' | 'debit';
  amount: number;
  status: 'Settled' | 'Active' | 'Verified';
}

const DEFAULT_LEDGER: WalletLedgerEntry[] = [
  {
    id: 'LDG-901',
    date: '29 Oct 2026',
    title: 'Referral & Partner Commission Credit (Code: BOS500)',
    category: 'commission',
    type: 'credit',
    amount: 750,
    status: 'Settled',
  },
  {
    id: 'LDG-902',
    date: '28 Oct 2026',
    title: 'Pro Specialist Annual Subscription Renewal',
    category: 'subscription',
    type: 'debit',
    amount: 499,
    status: 'Active',
  },
  {
    id: 'LDG-903',
    date: '26 Oct 2026',
    title: 'Booking Loyalty Cashback (Taj Krishna Suite Stay)',
    category: 'booking_cashback',
    type: 'credit',
    amount: 340,
    status: 'Verified',
  },
  {
    id: 'LDG-904',
    date: '22 Oct 2026',
    title: 'UPI Instant Wallet Top-Up',
    category: 'wallet_topup',
    type: 'credit',
    amount: 2000,
    status: 'Settled',
  },
];

export const UserWalletAndLedgerSection: React.FC<{
  currentLang?: AppLanguage;
}> = ({ currentLang = 'en' }) => {
  const { transactions, recordPayment } = useMarketplace();
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>(DEFAULT_LEDGER);
  const [topUpAmount, setTopUpAmount] = useState(500);
  const [topUpDone, setTopUpDone] = useState(false);

  const walletBalance = ledger.reduce(
    (acc, item) => (item.type === 'credit' ? acc + item.amount : acc - item.amount),
    0
  );
  const commissionBalance = ledger
    .filter((i) => i.category === 'commission' || i.category === 'booking_cashback')
    .reduce((acc, i) => acc + i.amount, 0);

  const handleAddFunds = () => {
    triggerGlobalGlobeLoader('Adding Funds to BOS Wallet & Syncing Ledger...', 650);
    const entry: WalletLedgerEntry = {
      id: `LDG-${Date.now().toString().slice(-4)}`,
      date: 'Just now',
      title: 'Instant UPI Wallet Top-Up',
      category: 'wallet_topup',
      type: 'credit',
      amount: topUpAmount,
      status: 'Settled',
    };
    setLedger((prev) => [entry, ...prev]);
    recordPayment('plan_subscription', topUpAmount, 'BOS Wallet Credit Top-Up', 'UPI');
    setTopUpDone(true);
    setTimeout(() => setTopUpDone(false), 3000);
  };

  return (
    <div className="space-y-3.5">
      {/* Wallet & Subscription KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#3730A3] to-purple-900 text-white">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-purple-200">
            <span>Wallet Balance</span>
            <Wallet className="w-4 h-4 text-amber-300" />
          </div>
          <div className="text-xl font-black mt-1">
            ₹{walletBalance.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-emerald-300 font-bold mt-0.5">
            ✓ 256-Bit Protected Ledger
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
            <span>Commission & Cashback</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-800 dark:text-emerald-200 mt-1">
            ₹{commissionBalance.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">
            Withdrawable to Bank / UPI
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
            <span>Subscription Status</span>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
            BOS Pro Specialist
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-black mt-0.5">
            ● ACTIVE (Valid till Dec 2027)
          </div>
        </div>
      </div>

      {/* Quick Top-Up Row */}
      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {[500, 1000, 2500].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setTopUpAmount(amt)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black border cursor-pointer ${
                topUpAmount === amt
                  ? 'bg-[#3730A3] text-white border-[#3730A3]'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              +₹{amt}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddFunds}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
        >
          {topUpDone ? '✓ Added to Wallet!' : `Add ₹${topUpAmount} via UPI`}
        </button>
      </div>

      {/* Transaction History & Ledger */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
          Transaction Ledger & GST Receipts ({ledger.length + transactions.length})
        </div>
        {ledger.map((row) => (
          <div
            key={row.id}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  row.type === 'credit'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                }`}
              >
                {row.type === 'credit' ? (
                  <ArrowDownLeft className="w-4 h-4" />
                ) : (
                  <ArrowUpRight className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-black text-slate-900 dark:text-white truncate">
                  {row.title}
                </div>
                <div className="text-[10px] text-slate-500">
                  {row.date} • {row.id} • {row.status}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`font-black ${
                  row.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {row.type === 'credit' ? '+' : '-'}₹{row.amount.toLocaleString('en-IN')}
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadGSTInvoicePDF({
                    invoiceNumber: `BOS-GST-${row.id}`,
                    transactionId: `TXN-${row.id}`,
                    date: row.date,
                    customerName: 'Narendra Kumar',
                    customerPhone: '+91 98765 43210',
                    planOrItemName: row.title,
                    baseAmount: Math.round(row.amount / 1.18),
                    totalAmount: row.amount,
                    paymentMethod: 'BOS Wallet / UPI',
                  })
                }
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-300 cursor-pointer"
                title="Download GST Invoice PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface QuickActionModalsProps {
  activeModal: QuickActionModalType;
  onClose: () => void;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing) => void;
  currentLang?: AppLanguage;
}

export const QuickActionModals: React.FC<QuickActionModalsProps> = ({
  activeModal,
  onClose,
  onSelectListing,
  onBookListing,
  currentLang = 'en',
}) => {
  const { listings, favoriteIds, toggleFavorite } = useMarketplace();
  const [copiedCode, setCopiedCode] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSent, setSupportSent] = useState(false);

  if (!activeModal) return null;

  const savedListings = listings.filter((l) => favoriteIds.includes(l.id));

  const handleShareReferral = async () => {
    const shareData = {
      title: 'BookOurSpace — Get ₹500 Instant Booking Reward!',
      text: 'Use my referral code BOS500 on BookOurSpace for PGs, Courses, Function Halls, Hotels & Services!',
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#4A148C] text-white flex items-center justify-center">
              {activeModal === 'favorites' && <Heart className="w-5 h-5 fill-rose-400 text-rose-400" />}
              {activeModal === 'support' && <Headphones className="w-5 h-5" />}
              {activeModal === 'refer_earn' && <Gift className="w-5 h-5 text-amber-300" />}
              {activeModal === 'help_centre' && <HelpCircle className="w-5 h-5" />}
              {activeModal === 'wallet' && <Wallet className="w-5 h-5 text-emerald-300" />}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {activeModal === 'favorites' &&
                  (currentLang === 'te' ? 'నా ఫేవరెట్స్ (Saved Listings)' : 'My Favorites (Saved Listings)')}
                {activeModal === 'support' &&
                  (currentLang === 'te' ? '24/7 కస్టమర్ సపోర్ట్' : '24/7 Priority Customer Support')}
                {activeModal === 'refer_earn' &&
                  (currentLang === 'te' ? 'రిఫర్ & సంపాదించండి (₹500)' : 'Refer & Earn ₹500 Commission')}
                {activeModal === 'help_centre' &&
                  (currentLang === 'te' ? 'హెల్ప్ సెంటర్ & తరచుగా అడిగే ప్రశ్నలు' : 'Help Centre & Guides')}
                {activeModal === 'wallet' &&
                  (currentLang === 'te' ? 'నా వాలెట్ & ట్రాన్సాక్షన్ లెడ్జర్' : 'User Wallet & Transaction Ledger')}
              </h3>
              <p className="text-xs text-slate-500">
                {activeModal === 'favorites' && `${savedListings.length} saved listings persisted in localStorage`}
                {activeModal === 'support' && 'Instant helpline for bookings, refunds & provider verification'}
                {activeModal === 'refer_earn' && 'Invite friends or providers & earn instant wallet credits'}
                {activeModal === 'help_centre' && 'Everything about GST invoices, hourly stays & verified bookings'}
                {activeModal === 'wallet' && 'Track wallet balance, subscriptions, commissions & GST receipts'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {activeModal === 'favorites' && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {savedListings.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Heart className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold">No saved listings yet.</p>
                <p>Tap the heart icon on any ListingCard to save it to your favorites!</p>
              </div>
            ) : (
              savedListings.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                >
                  <div
                    onClick={() => {
                      onSelectListing(item);
                      onClose();
                    }}
                    className="flex items-center gap-3 min-w-0 cursor-pointer"
                  >
                    <img
                      src={item.images[0]}
                      alt={item.title}
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {getListingTitle(item, currentLang)}
                      </div>
                      <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                        {item.currency}
                        {item.price.toLocaleString('en-IN')}
                        {item.priceUnit} • 📍 {item.location.area}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onBookListing(item);
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#4A148C] text-white text-[11px] font-black cursor-pointer"
                    >
                      Book
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.id)}
                      className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 hover:bg-rose-100 cursor-pointer"
                      title="Remove from Saved"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeModal === 'wallet' && (
          <UserWalletAndLedgerSection currentLang={currentLang} />
        )}

        {activeModal === 'refer_earn' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900 to-indigo-900 text-white text-center space-y-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                Your Exclusive Referral Code
              </div>
              <div className="text-2xl font-mono font-black tracking-widest bg-white/10 py-2 px-4 rounded-xl inline-block border border-white/20">
                BOS500
              </div>
              <p className="text-xs text-purple-200">
                Earn ₹500 in your BOS Wallet for every provider or customer booking referred!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('BOS500');
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2500);
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Copied Code!' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={handleShareReferral}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share via WhatsApp / Apps</span>
              </button>
            </div>
          </div>
        )}

        {activeModal === 'support' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href="tel:+919848012345"
                className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2.5 text-emerald-900 dark:text-emerald-200 font-black text-xs"
              >
                <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div>Call 24/7 Desk</div>
                  <div className="text-[10px] font-normal">+91 98480 12345</div>
                </div>
              </a>
              <a
                href="https://wa.me/919848012345?text=Hello%20BookOurSpace%20Support"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center gap-2.5 text-indigo-900 dark:text-indigo-200 font-black text-xs"
              >
                <MessageSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div>WhatsApp Support</div>
                  <div className="text-[10px] font-normal">Under 2 min reply</div>
                </div>
              </a>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                Submit Priority Support Ticket
              </label>
              <textarea
                rows={3}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Describe your booking, refund, or GST invoice query..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => {
                  if (!supportMessage.trim()) return;
                  setSupportSent(true);
                  setSupportMessage('');
                  setTimeout(() => setSupportSent(false), 3000);
                }}
                className="w-full py-2.5 rounded-xl bg-[#4A148C] text-white font-black text-xs cursor-pointer"
              >
                {supportSent ? '✓ Support Ticket Raised (#TKT-8821)' : 'Send Support Request'}
              </button>
            </div>
          </div>
        )}

        {activeModal === 'help_centre' && (
          <div className="space-y-2.5 text-xs">
            {[
              {
                q: 'How do I download my formal GST Tax Invoice PDF?',
                a: 'Open "My Bookings" in the bottom bar and click "📄 GST PDF Invoice" on any confirmed booking to print or download your invoice with GSTIN & QR validation.',
              },
              {
                q: 'How does Hourly Hotel Booking work?',
                a: 'Switch to the "Stay / Hotels" section and toggle "Hourly Booking" to filter hotels offering flexible 3h/6h/12h stays with custom check-in and check-out date-time selection.',
              },
              {
                q: 'How do I view Course Batch Start Dates & Exam Dates?',
                a: 'On any Class/Course card, click "📅 View Calendar" to inspect monthly start dates, assessment exams, off-days, and verified Student Success placement stats.',
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1"
              >
                <div className="font-black text-slate-900 dark:text-white">{faq.q}</div>
                <div className="text-slate-600 dark:text-slate-300 leading-relaxed">{faq.a}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
