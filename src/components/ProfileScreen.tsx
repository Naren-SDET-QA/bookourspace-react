import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Bell, BriefcaseBusiness, CalendarDays, Camera, ChevronRight,
  CircleHelp, Globe2, Heart, Languages, LogIn, LogOut, MapPin, Settings,
  ShieldCheck, Trash2, UserRound, WalletCards, Save, X, Star, Clock,
} from 'lucide-react';
import type { LanguageCode } from '../types';
import type { Review } from '../types/marketplace';
import { fetchRazorpayPaymentHistory, fetchRlsProfile } from '../lib/supabaseClient';
import SafeImage from './SafeImage';
import UniversalMediaManager, { type MediaManagerItem } from './UniversalMediaManager';
import BOSOfficialLogo from './BOSOfficialLogo';

export interface ProfileScreenUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  coverUrl?: string;
  role: string;
  googleConnected: boolean;
  emailVerified: boolean;
  verified: boolean;
  bio?: string;
  phone?: string;
}

interface ProfileScreenProps {
  user: ProfileScreenUser | null;
  currentLang: LanguageCode;
  onSignIn: () => void;
  onSelectLanguage: (language: LanguageCode) => void;
  onBookings: () => void;
  onSaved: () => void;
  onBusiness: () => void;
  onSignOut: () => Promise<void>;
  onSaveProfile: (values: { fullName: string; phone: string; bio: string }) => Promise<boolean>;
  onHelp: () => void;
  onContactSupport: () => void;
  onAiSupport: () => void;
  onFeedback: () => void;
  onRequestAccountClosure: () => Promise<boolean>;
  onClose: () => void;
  reviews?: Review[];
}

const copy = {
  en: {
    title: 'Profile', welcome: 'Welcome to BookOurSpace', guest: 'Browse BookOurSpace without an account. Sign in when you are ready to book or manage your profile.',
    google: 'Continue with Google', browse: 'Continue as Guest', personal: 'Personal', business: 'Business', settings: 'Settings',
    edit: 'Edit Personal Profile', bookings: 'My Bookings', saved: 'Saved Listings', reviews: 'My Reviews', transactions: 'Transactions',
    verification: 'Account Verification', notifications: 'Notifications', help: 'Help and Suggestions', create: 'Create Business Profile',
    manage: 'Manage Business Profile', listings: 'My Listings', post: 'Post Free', requests: 'Booking Requests', availability: 'Calendar / Availability',
    enquiries: 'Customer Enquiries', earnings: 'Earnings / Payout Status', coverage: 'Service Coverage Areas', businessVerify: 'Business Verification',
    language: 'Language', helpCentre: 'Help Centre', ai: 'AI Chat Support', contact: 'Contact Support', feedback: 'Feedback and Complaints',
    share: 'Share App', privacy: 'Privacy Policy', terms: 'Terms and Conditions', account: 'Account Settings', signOut: 'Sign Out', delete: 'Delete Account',
    googleConnected: 'Google account connected', emailVerified: 'Email verified', noVerification: 'Verification status is not available',
    notReady: 'This account feature is not configured yet.', confirmSignOut: 'Sign out of BookOurSpace on this device?', signOutError: 'Sign out could not be completed. Please try again.',
    deleteTitle: 'Close your account', deleteCopy: 'Account closure needs a server authorized review so bookings, refunds and audit records stay protected. This process is not configured yet.',
    close: 'Back to Profile', chooseLanguage: 'Choose language',
  },
  te: {
    title: 'ప్రొఫైల్', welcome: 'BookOurSpace కు స్వాగతం', guest: 'ఖాతా లేకుండానే బ్రౌజ్ చేయండి. బుకింగ్ లేదా ప్రొఫైల్ నిర్వహణకు సైన్ ఇన్ చేయండి.',
    google: 'Google తో కొనసాగండి', browse: 'అతిథిగా కొనసాగండి', personal: 'వ్యక్తిగత', business: 'వ్యాపారం', settings: 'సెట్టింగ్స్',
    edit: 'వ్యక్తిగత ప్రొఫైల్ సవరించండి', bookings: 'నా బుకింగ్‌లు', saved: 'సేవ్ చేసిన జాబితాలు', reviews: 'నా సమీక్షలు', transactions: 'లావాదేవీలు',
    verification: 'ఖాతా ధృవీకరణ', notifications: 'నోటిఫికేషన్లు', help: 'సహాయం మరియు సూచనలు', create: 'వ్యాపార ప్రొఫైల్ సృష్టించండి',
    manage: 'వ్యాపార ప్రొఫైల్ నిర్వహించండి', listings: 'నా జాబితాలు', post: 'ఉచితంగా పోస్ట్ చేయండి', requests: 'బుకింగ్ అభ్యర్థనలు', availability: 'క్యాలెండర్ / లభ్యత',
    enquiries: 'కస్టమర్ విచారణలు', earnings: 'ఆదాయం / చెల్లింపు స్థితి', coverage: 'సేవా ప్రాంతాలు', businessVerify: 'వ్యాపార ధృవీకరణ',
    language: 'భాష', helpCentre: 'సహాయ కేంద్రం', ai: 'AI చాట్ సపోర్ట్', contact: 'సపోర్ట్‌ను సంప్రదించండి', feedback: 'అభిప్రాయం మరియు ఫిర్యాదులు',
    share: 'యాప్‌ను షేర్ చేయండి', privacy: 'గోప్యతా విధానం', terms: 'నిబంధనలు మరియు షరతులు', account: 'ఖాతా సెట్టింగ్స్', signOut: 'సైన్ అవుట్', delete: 'ఖాతాను తొలగించండి',
    googleConnected: 'Google ఖాతా కనెక్ట్ అయింది', emailVerified: 'ఈమెయిల్ ధృవీకరించబడింది', noVerification: 'ధృవీకరణ స్థితి అందుబాటులో లేదు',
    notReady: 'ఈ ఖాతా ఫీచర్ ఇంకా సెటప్ కాలేదు.', confirmSignOut: 'ఈ పరికరంలో BookOurSpace నుండి సైన్ అవుట్ చేయాలా?', signOutError: 'సైన్ అవుట్ కాలేదు. మళ్లీ ప్రయత్నించండి.',
    deleteTitle: 'మీ ఖాతాను మూసివేయండి', deleteCopy: 'బుకింగ్‌లు, రీఫండ్‌లు మరియు ఆడిట్ రికార్డులను రక్షించడానికి ఖాతా మూసివేతకు సర్వర్ సమీక్ష అవసరం. ఈ ప్రక్రియ ఇంకా సెటప్ కాలేదు.',
    close: 'ప్రొఫైల్‌కు తిరిగి', chooseLanguage: 'భాషను ఎంచుకోండి',
  },
  hi: {
    title: 'प्रोफ़ाइल', welcome: 'BookOurSpace में आपका स्वागत है', guest: 'बिना खाते के ब्राउज़ करें। बुकिंग या प्रोफ़ाइल प्रबंधन के लिए साइन इन करें।',
    google: 'Google से जारी रखें', browse: 'अतिथि के रूप में जारी रखें', personal: 'व्यक्तिगत', business: 'व्यवसाय', settings: 'सेटिंग्स',
    edit: 'व्यक्तिगत प्रोफ़ाइल संपादित करें', bookings: 'मेरी बुकिंग', saved: 'सहेजी गई लिस्टिंग', reviews: 'मेरी समीक्षाएँ', transactions: 'लेनदेन',
    verification: 'खाता सत्यापन', notifications: 'सूचनाएँ', help: 'मदद और सुझाव', create: 'व्यवसाय प्रोफ़ाइल बनाएँ',
    manage: 'व्यवसाय प्रोफ़ाइल प्रबंधित करें', listings: 'मेरी लिस्टिंग', post: 'मुफ़्त पोस्ट करें', requests: 'बुकिंग अनुरोध', availability: 'कैलेंडर / उपलब्धता',
    enquiries: 'ग्राहक पूछताछ', earnings: 'कमाई / भुगतान स्थिति', coverage: 'सेवा क्षेत्र', businessVerify: 'व्यवसाय सत्यापन',
    language: 'भाषा', helpCentre: 'सहायता केंद्र', ai: 'AI चैट सहायता', contact: 'सहायता से संपर्क करें', feedback: 'प्रतिक्रिया और शिकायतें',
    share: 'ऐप साझा करें', privacy: 'गोपनीयता नीति', terms: 'नियम और शर्तें', account: 'खाता सेटिंग्स', signOut: 'साइन आउट', delete: 'खाता हटाएँ',
    googleConnected: 'Google खाता जुड़ा है', emailVerified: 'ईमेल सत्यापित', noVerification: 'सत्यापन स्थिति उपलब्ध नहीं',
    notReady: 'यह खाता सुविधा अभी सेटअप नहीं है।', confirmSignOut: 'इस डिवाइस पर BookOurSpace से साइन आउट करें?', signOutError: 'साइन आउट पूरा नहीं हुआ। फिर कोशिश करें।',
    deleteTitle: 'अपना खाता बंद करें', deleteCopy: 'बुकिंग, रिफ़ंड और ऑडिट रिकॉर्ड सुरक्षित रखने के लिए खाता बंद करने हेतु सर्वर समीक्षा आवश्यक है। यह प्रक्रिया अभी सेटअप नहीं है।',
    close: 'प्रोफ़ाइल पर वापस', chooseLanguage: 'भाषा चुनें',
  },
} as const;

type Screen = 'profile' | 'settings' | 'delete' | 'reviews' | 'transactions' | 'privacy' | 'terms';
const languages: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'te', label: 'తెలుగు' }, { code: 'hi', label: 'हिन्दी' },
];

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user, currentLang, onSignIn, onSelectLanguage, onBookings, onSaved, onBusiness,
  onSignOut, onSaveProfile, onHelp, onClose,
  onContactSupport, onAiSupport, onFeedback, onRequestAccountClosure,
  reviews = [],
}) => {
  const lang = currentLang === 'te' || currentLang === 'hi' ? currentLang : 'en';
  const t = copy[lang];
  const [tab, setTab] = useState<'personal' | 'business'>('personal');
  const [screen, setScreen] = useState<Screen | 'edit'>('profile');
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [error, setError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [coverUrl, setCoverUrl] = useState(user?.coverUrl || '');
  const [closureConfirmation, setClosureConfirmation] = useState('');
  const [closingAccount, setClosingAccount] = useState(false);
  const [notifications, setNotifications] = useState(() => localStorage.getItem('bos_profile_notifications') !== 'off');
  const [paymentHistoryState, setPaymentHistoryState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable'>('idle');
  const [paymentHistory, setPaymentHistory] = useState<Array<{ id: string; amount: number; currency?: string; status: string; createdAt: string; listingTitle?: string }>>([]);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl || '');
    setCoverUrl(user?.coverUrl || '');
    if (!user) return;
    let active = true;
    void fetchRlsProfile().then((profile) => {
      if (!active || !profile || profile.id.toLowerCase() !== user.id.toLowerCase()) return;
      if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile.cover_url) setCoverUrl(profile.cover_url);
    });
    return () => { active = false; };
  }, [user?.id]);

  const onAvatarItems = (items: MediaManagerItem[]) => {
    const uploaded = items.find((item) => item.status === 'uploaded' && item.result?.objectPath);
    if (uploaded?.result) setAvatarUrl(uploaded.result.objectPath);
  };
  const onCoverItems = (items: MediaManagerItem[]) => {
    const uploaded = items.find((item) => item.status === 'uploaded' && item.result?.objectPath);
    if (uploaded?.result) setCoverUrl(uploaded.result.objectPath);
  };

  useEffect(() => {
    if (screen !== 'transactions' || !user || paymentHistoryState !== 'idle') return;
    let active = true;
    setPaymentHistoryState('loading');
    void fetchRazorpayPaymentHistory().then((result) => {
      if (!active) return;
      setPaymentHistory(result.ok ? result.transactions.map((transaction) => ({
        id: transaction.id || transaction.orderId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        createdAt: transaction.createdAt,
        listingTitle: transaction.listingTitle,
      })) : []);
      setPaymentHistoryState(result.ok ? 'loaded' : 'unavailable');
    }).catch(() => {
      if (active) setPaymentHistoryState('unavailable');
    });
    return () => { active = false; };
  }, [screen, user, paymentHistoryState]);

  const row = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button type="button" onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${danger ? 'text-rose-700' : 'text-slate-800'}`}>
      <span className={danger ? 'text-rose-600' : 'text-indigo-700'} aria-hidden="true">{icon}</span><span className="min-w-0 flex-1">{label}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    </button>
  );

  const signOut = async () => {
    if (!window.confirm(t.confirmSignOut)) return;
    setSigningOut(true); setError('');
    try { await onSignOut(); onClose(); }
    catch { setError(t.signOutError); }
    finally { setSigningOut(false); }
  };
  const shareApp = () => {
    const url = window.location.origin;
    if (navigator.share) void navigator.share({ title: 'BookOurSpace', url }).catch(() => undefined);
    else void navigator.clipboard?.writeText(url).then(() => setError('App link copied.')).catch(() => setError(t.notReady));
  };

  if (screen === 'edit') return (
    <section className="min-h-full p-4 sm:p-6" aria-labelledby="edit-profile-title">
      <button className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-indigo-800 hover:bg-indigo-50" onClick={() => setScreen('profile')}><ArrowLeft className="h-4 w-4" />{t.close}</button>
      <form className="mx-auto max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setSavedMessage(''); try { const ok = await onSaveProfile({ fullName: fullName.trim(), phone: phone.trim(), bio: bio.trim() }); setSavedMessage(ok ? 'Profile saved.' : 'Your profile could not be saved. Please try again.'); if (ok) setScreen('profile'); } catch { setSavedMessage('Your profile could not be saved. Please try again.'); } finally { setSaving(false); } }}>
        <h2 id="edit-profile-title" className="text-lg font-extrabold">{t.edit}</h2>
        <label className="block space-y-1 text-sm font-semibold">Full name<input required maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100" /></label>
        <label className="block space-y-1 text-sm font-semibold">Phone<input type="tel" maxLength={24} value={phone} onChange={(event) => setPhone(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100" /></label>
        <label className="block space-y-1 text-sm font-semibold">Short bio<textarea maxLength={240} rows={3} value={bio} onChange={(event) => setBio(event.target.value)} className="w-full rounded-xl border border-slate-300 p-3 font-normal focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100" /></label>
        {user && <div className="space-y-4 rounded-2xl border border-slate-100 p-3">
          <div><p className="mb-2 text-sm font-bold">Profile photo</p><UniversalMediaManager moduleKey="profile" parentType="profile_avatar" parentId={user.id} privacy="private" maxFiles={1} title="Choose profile photo" onChange={onAvatarItems} /></div>
          <div><p className="mb-2 text-sm font-bold">Profile cover</p><UniversalMediaManager moduleKey="profile" parentType="profile_cover" parentId={user.id} privacy="private" maxFiles={1} title="Choose cover image" onChange={onCoverItems} /></div>
          {(avatarUrl || coverUrl) && <p className="text-xs text-slate-500">Images are private and visible to your account.</p>}
        </div>}
        <button disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save profile'}</button>
        {savedMessage && <p role="status" className="text-sm text-slate-700">{savedMessage}</p>}
      </form>
    </section>
  );

  if (screen === 'delete') return (
    <section className="min-h-full p-4 sm:p-6" aria-labelledby="delete-account-title">
      <button className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-indigo-800 hover:bg-indigo-50" onClick={() => setScreen('profile')}><ArrowLeft className="h-4 w-4" />{t.close}</button>
      <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 /></div>
        <h2 id="delete-account-title" className="text-xl font-extrabold text-slate-900">{t.deleteTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Closing your account revokes active sessions and removes profile contact details. Booking, payment, refund, dispute and audit records are retained for operational and legal records.</p>
        <label className="mt-4 block text-sm font-semibold">Type CLOSE to confirm<input value={closureConfirmation} onChange={(event) => setClosureConfirmation(event.target.value)} autoCapitalize="characters" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3" /></label>
        <button type="button" disabled={closingAccount || closureConfirmation !== 'CLOSE'} onClick={async () => { setClosingAccount(true); setError(''); try { const ok = await onRequestAccountClosure(); if (!ok) setError('Account closure could not be completed. Reauthenticate and try again.'); } catch { setError('Account closure could not be completed. Reauthenticate and try again.'); } finally { setClosingAccount(false); } }} className="mt-4 min-h-12 w-full rounded-xl bg-rose-700 px-4 font-bold text-white disabled:opacity-50">{closingAccount ? 'Closing account…' : 'Close account'}</button>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      </div>
    </section>
  );

  if (screen === 'reviews') {
    const ownReviews = reviews.filter((review) => review.userId?.toLowerCase() === user?.id.toLowerCase());
    return (
      <section className="min-h-full p-4 sm:p-6" aria-labelledby="profile-reviews-title">
        <button className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-indigo-800 hover:bg-indigo-50" onClick={() => setScreen('profile')}><ArrowLeft className="h-4 w-4" />{t.close}</button>
        <div className="mx-auto max-w-lg space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 id="profile-reviews-title" className="px-3 py-2 text-lg font-extrabold">{t.reviews}</h2>
          {ownReviews.length ? ownReviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-1 text-amber-600" aria-label={`${review.rating} out of 5 stars`}><Star className="h-4 w-4 fill-current" /><span className="text-sm font-bold">{review.rating.toFixed(1)}</span></div>
              <p className="mt-2 text-sm leading-6 text-slate-800">{review.comment}</p>
              <p className="mt-2 text-xs text-slate-500">{review.date}</p>
            </article>
          )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">You have not submitted any reviews yet.</p>}
        </div>
      </section>
    );
  }

  if (screen === 'transactions') return (
    <section className="min-h-full p-4 sm:p-6" aria-labelledby="profile-transactions-title">
      <button className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-indigo-800 hover:bg-indigo-50" onClick={() => setScreen('profile')}><ArrowLeft className="h-4 w-4" />{t.close}</button>
      <div className="mx-auto max-w-lg space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="profile-transactions-title" className="px-3 py-2 text-lg font-extrabold">{t.transactions}</h2>
        {paymentHistoryState === 'loading' && <p role="status" className="p-4 text-sm text-slate-600">Loading payment activity…</p>}
        {paymentHistoryState === 'unavailable' && <p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Payment history is unavailable from the payment server.</p>}
        {paymentHistoryState === 'loaded' && paymentHistory.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No payment activity was returned for this account.</p>}
        {paymentHistory.map((transaction) => (
          <article key={transaction.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{transaction.listingTitle || 'Payment'}</p><p className="mt-1 text-xs text-slate-500">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : 'Date unavailable'} · {transaction.status}</p></div>
            <span className="shrink-0 text-sm font-bold">{transaction.currency || 'INR'} {Number(transaction.amount).toLocaleString()}</span>
          </article>
        ))}
      </div>
    </section>
  );

  if (screen === 'settings') return (
    <section className="min-h-full p-4 sm:p-6" aria-labelledby="profile-settings-title">
      <button className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-indigo-800 hover:bg-indigo-50" onClick={() => setScreen('profile')}><ArrowLeft className="h-4 w-4" />{t.close}</button>
      <div className="mx-auto max-w-lg space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="profile-settings-title" className="px-3 py-2 text-lg font-extrabold">{t.settings}</h2>
        <div className="flex items-center gap-3 px-3 py-2 text-sm font-semibold"><Languages className="h-5 w-5 text-indigo-700" />{t.chooseLanguage}</div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3" role="group" aria-label={t.chooseLanguage}>
          {languages.map((language) => <button key={language.code} type="button" aria-pressed={currentLang === language.code} onClick={() => onSelectLanguage(language.code)} className={`min-h-11 rounded-xl border px-2 text-sm font-bold ${currentLang === language.code ? 'border-indigo-700 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-700'}`}>{language.label}</button>)}
        </div>
        <label className="flex min-h-12 items-center justify-between border-t border-slate-100 px-3 text-sm font-semibold"><span className="flex items-center gap-3"><Bell className="h-5 w-5 text-indigo-700" />{t.notifications}</span><input type="checkbox" checked={notifications} onChange={(event) => { setNotifications(event.target.checked); localStorage.setItem('bos_profile_notifications', event.target.checked ? 'on' : 'off'); }} className="h-5 w-5 accent-indigo-700" /></label>
        {row(<CircleHelp className="h-5 w-5" />, t.helpCentre, onHelp)}
        {row(<Globe2 className="h-5 w-5" />, t.ai, onAiSupport)}
        {row(<CircleHelp className="h-5 w-5" />, t.contact, onContactSupport)}
        {row(<CircleHelp className="h-5 w-5" />, t.feedback, onFeedback)}
        {row(<Globe2 className="h-5 w-5" />, t.share, shareApp)}
        {row(<ShieldCheck className="h-5 w-5" />, t.privacy, () => setScreen('privacy'))}
        {row(<ShieldCheck className="h-5 w-5" />, t.terms, () => setScreen('terms'))}
        {row(<Settings className="h-5 w-5" />, t.account, () => user ? setScreen('edit') : onSignIn())}
        {error && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700" role="status">{error}</p>}
      </div>
    </section>
  );

  if (screen === 'privacy' || screen === 'terms') return (
    <section className="min-h-full p-4 sm:p-6" aria-labelledby="profile-legal-title">
      <button className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-indigo-800 hover:bg-indigo-50" onClick={() => setScreen('settings')}><ArrowLeft className="h-4 w-4" />{t.close}</button>
      <article className="mx-auto max-w-lg space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="profile-legal-title" className="text-lg font-extrabold">{screen === 'privacy' ? t.privacy : t.terms}</h2>
        <p className="text-sm leading-6 text-slate-700">Official BookOurSpace {screen === 'privacy' ? 'privacy notice' : 'terms'} are being prepared for publication.</p>
        <p className="text-sm leading-6 text-slate-600">This local page shell will show the approved content when it is supplied. For current questions, contact support@bookourspace.in.</p>
      </article>
    </section>
  );

  return (
    <section className="min-h-full bg-slate-50 px-4 pb-8 pt-4 text-slate-900 sm:pt-6" aria-labelledby="profile-title">
      <header className="mx-auto flex max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2"><h1 id="profile-title" className="text-xl font-extrabold">{t.title}</h1>{user && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800">BookOurSpace</span>}</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setScreen('settings')} aria-label={t.settings} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><Settings className="h-5 w-5" /></button>
          <button type="button" onClick={onClose} aria-label="Close Profile" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><X className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="mx-auto mt-5 max-w-2xl space-y-4">
      <article className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-7">
          <BOSOfficialLogo className="mx-auto mb-3 w-28" alt="BookOurSpace official logo" />
          <div className="relative mx-auto h-24 w-24">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-indigo-100 ring-4 ring-indigo-100">{(avatarUrl || user?.avatarUrl) ? <SafeImage src={avatarUrl || user?.avatarUrl} alt="" category="general" className="h-full w-full object-cover" /> : <UserRound className="h-11 w-11 text-indigo-700" />}</div>
            {user && <button type="button" onClick={() => setScreen('edit')} aria-label="Change profile photo or edit profile" className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-700 text-white ring-2 ring-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"><Camera className="h-4 w-4" /></button>}
          </div>
          <h2 className="mt-3 text-xl font-extrabold">{user?.name || t.welcome}</h2>
          {user ? <>
            {user.bio?.trim() && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">{user.bio.trim()}</p>}
            <p className="mt-1 break-all text-sm text-slate-600">{user.email}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {user.googleConnected && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />{t.googleConnected}</span>}
              {user.emailVerified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />{t.emailVerified}</span>}
              {user.verified && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800"><ShieldCheck className="h-3.5 w-3.5" />{t.verification}</span>}
            </div>
          </> : <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{t.guest}</p>}
        </article>

        {!user ? <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <button type="button" onClick={onSignIn} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-4 font-bold text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"><LogIn className="h-5 w-5" />{t.google}</button>
          <button type="button" onClick={onClose} className="min-h-12 w-full rounded-2xl border border-indigo-200 px-4 font-bold text-indigo-800 hover:bg-indigo-50">{t.browse}</button>
        </div> : <>
          <div className="grid grid-cols-2 rounded-2xl bg-indigo-100 p-1" role="tablist" aria-label={t.title}>
            {(['personal', 'business'] as const).map((key) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 rounded-xl text-sm font-bold ${tab === key ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'}`}>{key === 'personal' ? t.personal : t.business}</button>)}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            {tab === 'personal' ? <>
              {row(<UserRound className="h-5 w-5" />, t.edit, () => setScreen('edit'))}
              {row(<CalendarDays className="h-5 w-5" />, t.bookings, onBookings)}
              {row(<Heart className="h-5 w-5" />, t.saved, onSaved)}
              {row(<CircleHelp className="h-5 w-5" />, t.reviews, () => setScreen('reviews'))}
              {row(<WalletCards className="h-5 w-5" />, t.transactions, () => { setPaymentHistoryState('idle'); setScreen('transactions'); })}
              {row(<ShieldCheck className="h-5 w-5" />, t.verification, () => setError(user.verified ? t.emailVerified : t.noVerification))}
              {row(<Bell className="h-5 w-5" />, t.notifications, () => setScreen('settings'))}
              {row(<CircleHelp className="h-5 w-5" />, t.help, onHelp)}
            </> : <>
              {row(<BriefcaseBusiness className="h-5 w-5" />, user.role === 'provider' || user.role === 'admin' ? t.manage : t.create, onBusiness)}
              {row(<BriefcaseBusiness className="h-5 w-5" />, t.listings, onBusiness)}
              {row(<BriefcaseBusiness className="h-5 w-5" />, t.post, onBusiness)}
              {row(<CalendarDays className="h-5 w-5" />, t.requests, onBusiness)}
              {row(<CalendarDays className="h-5 w-5" />, t.availability, onBusiness)}
              {row(<CircleHelp className="h-5 w-5" />, t.enquiries, onBusiness)}
              {row(<MapPin className="h-5 w-5" />, t.coverage, onBusiness)}
              {row(<WalletCards className="h-5 w-5" />, t.earnings, onBusiness)}
              {row(<ShieldCheck className="h-5 w-5" />, t.businessVerify, onBusiness)}
            </>}
          </div>
          {error && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
          <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            {row(<Languages className="h-5 w-5" />, t.language, () => setScreen('settings'))}
            {row(<CircleHelp className="h-5 w-5" />, t.helpCentre, onHelp)}
            <button type="button" disabled={signingOut} onClick={() => void signOut()} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"><LogOut className="h-5 w-5 text-indigo-700" />{signingOut ? 'Signing out…' : t.signOut}</button>
            <button type="button" onClick={() => setScreen('delete')} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-5 w-5" />{t.delete}</button>
          </div>
        </>}
      </div>
    </section>
  );
};
