import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, RefreshCw, UserPlus } from 'lucide-react';
import { fetchBusinessMembers, inviteBusinessMember, type BusinessMember, type BusinessRole } from '../../lib/businessClient';

export function BusinessStaffPanel({ businessId, canInvite }: { businessId?: string; canInvite?: boolean }) {
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<BusinessRole, 'owner'>>('staff');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!businessId) return;
    try { setMembers(await fetchBusinessMembers(businessId)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'MEMBERS_UNAVAILABLE'); }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    if (!businessId || !email.trim()) return;
    setBusy(true); setError(''); setNotice(''); setLink('');
    try {
      const result = await inviteBusinessMember(businessId, email.trim(), role);
      setNotice(`Invitation created for ${result.invitation.email} as ${result.invitation.role}.`);
      if (result.inviteToken) setLink(`${window.location.origin}/?invite=${encodeURIComponent(result.inviteToken)}`);
      setEmail('');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'INVITATION_CREATE_FAILED'); }
    finally { setBusy(false); }
  }

  if (!businessId) return <p className="text-sm text-slate-500">Select a business to manage staff.</p>;

  return (
    <div className="space-y-3">
      {canInvite && (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <h3 className="flex items-center gap-1.5 text-[13px] font-black"><UserPlus className="h-4 w-4 text-violet-600" /> Invite staff</h3>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="staff@example.com" aria-label="Staff email" className="min-h-9 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
            <select value={role} onChange={(event) => setRole(event.target.value as Exclude<BusinessRole, 'owner'>)} aria-label="Staff role" className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">
              <option value="manager">Manager</option><option value="staff">Staff</option><option value="accountant">Accountant</option>
            </select>
            <button type="button" onClick={() => void invite()} disabled={busy || !email.trim()} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white disabled:opacity-50"><Mail className="h-3.5 w-3.5" /> {busy ? 'Creating…' : 'Create invite'}</button>
          </div>
          {notice && <p role="status" className="mt-2 text-[11px] font-semibold text-emerald-700">{notice}</p>}
          {link && <div className="mt-2 flex items-center gap-1 rounded-lg bg-slate-50 p-2 text-[10px] dark:bg-slate-800"><code className="min-w-0 flex-1 truncate">{link}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(link)} aria-label="Copy invite link" className="rounded p-1"><Copy className="h-3.5 w-3.5" /></button></div>}
          {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between"><h3 className="text-[13px] font-black">Team members</h3><button type="button" onClick={() => void load()} aria-label="Refresh members" className="rounded p-1 text-slate-500"><RefreshCw className="h-3.5 w-3.5" /></button></div>
        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => <div key={member.id} className="flex items-center justify-between gap-2 py-2 text-[11px]"><span className="min-w-0 truncate font-bold">{member.full_name || member.email || member.user_id}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase dark:bg-slate-800">{member.role} · {member.status}</span></div>)}
          {members.length === 0 && <p className="py-2 text-[11px] text-slate-500">No active team members yet.</p>}
        </div>
      </div>
    </div>
  );
}
