import { useState } from 'react';
import { ArrowRightLeft, Copy } from 'lucide-react';
import { requestOwnershipTransfer } from '../../lib/businessClient';

export function BusinessTransferPanel({ businessId, isOwner }: { businessId?: string; isOwner?: boolean }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!isOwner || !businessId) return <p className="text-[11px] text-slate-500">Only the current business owner can transfer ownership.</p>;

  async function submit() {
    if (!businessId || !email.trim()) return;
    setBusy(true); setError(''); setNotice(''); setToken('');
    try {
      const result = await requestOwnershipTransfer(businessId, email.trim());
      setNotice(`Transfer requested. The recipient must accept before ownership changes. Expires ${new Date(result.transfer.expires_at).toLocaleString()}.`);
      if (result.transferToken) setToken(`${window.location.origin}/?transfer-owner=${encodeURIComponent(result.transferToken)}`);
      setEmail('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'TRANSFER_REQUEST_FAILED'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <h4 className="flex items-center gap-1.5 text-[12px] font-black text-amber-900 dark:text-amber-100"><ArrowRightLeft className="h-3.5 w-3.5" /> Transfer ownership</h4>
      <p className="mt-1 text-[10px] font-semibold text-amber-800 dark:text-amber-200">The recipient must accept with their verified Google account. You become a manager after acceptance, and the transfer is audited.</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="new-owner@example.com" aria-label="New owner email" className="min-h-9 flex-1 rounded-xl border border-amber-200 bg-white px-2.5 text-xs dark:border-amber-800 dark:bg-slate-900" />
        <button type="button" onClick={() => void submit()} disabled={busy || !email.trim()} className="min-h-9 rounded-xl bg-amber-600 px-3 text-[11px] font-black text-white disabled:opacity-50">{busy ? 'Creating…' : 'Request transfer'}</button>
      </div>
      {notice && <p role="status" className="mt-2 text-[10px] font-semibold text-emerald-800">{notice}</p>}
      {token && <div className="mt-2 flex items-center gap-1 rounded-lg bg-white p-2 text-[10px] dark:bg-slate-900"><code className="min-w-0 flex-1 truncate">{token}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(token)} aria-label="Copy transfer link" className="rounded p-1"><Copy className="h-3.5 w-3.5" /></button></div>}
      {error && <p role="alert" className="mt-2 text-[10px] font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
