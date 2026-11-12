import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { fetchBusinessMembers, inviteBusinessMember, setBusinessMemberAccess, type BusinessMember, type BusinessRole } from '../../lib/businessClient';
import {
  ACCESS_MODULES,
  ACCESS_MODULE_LABELS,
  MODULE_SECTION_KEYS,
  accessScopeFrom,
  describeAccessScope,
  type AccessModule,
} from '../../lib/businessAccess';

interface AccessDraft {
  member: BusinessMember;
  modules: string[];
  sections: Record<string, string[]>;
}

export function BusinessStaffPanel({ businessId, canInvite }: { businessId?: string; canInvite?: boolean }) {
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<BusinessRole, 'owner'>>('staff');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<AccessDraft | null>(null);
  const [accessError, setAccessError] = useState('');

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

  function openAccess(member: BusinessMember) {
    const scope = accessScopeFrom(member);
    setAccessError('');
    setDraft({
      member,
      modules: scope ? [...scope.allowedModules] : [],
      sections: scope ? Object.fromEntries(Object.entries(scope.allowedSections).map(([key, value]) => [key, [...value]])) : {},
    });
  }

  function toggleModule(moduleKey: AccessModule) {
    setDraft((current) => {
      if (!current) return current;
      const enabled = current.modules.includes(moduleKey);
      const modules = enabled ? current.modules.filter((key) => key !== moduleKey) : [...current.modules, moduleKey];
      const sections = { ...current.sections };
      if (enabled) delete sections[moduleKey];
      return { ...current, modules, sections };
    });
  }

  function toggleSection(moduleKey: AccessModule, sectionKey: string) {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.sections[moduleKey] || [];
      const next = selected.includes(sectionKey) ? selected.filter((key) => key !== sectionKey) : [...selected, sectionKey];
      const sections = { ...current.sections };
      if (next.length === 0) delete sections[moduleKey];
      else sections[moduleKey] = next;
      return { ...current, sections };
    });
  }

  async function saveAccess(fullAccess: boolean) {
    if (!businessId || !draft) return;
    if (!fullAccess && draft.modules.length === 0) { setAccessError('Choose at least one module, or grant full access.'); return; }
    setBusy(true); setAccessError('');
    try {
      await setBusinessMemberAccess(businessId, draft.member.user_id, fullAccess ? null : { allowedModules: draft.modules, allowedSections: draft.sections });
      setNotice(fullAccess
        ? `Full business access restored for ${draft.member.full_name || draft.member.email || 'member'}.`
        : `Access updated for ${draft.member.full_name || draft.member.email || 'member'}.`);
      setDraft(null);
      await load();
    } catch (cause) { setAccessError(cause instanceof Error ? cause.message : 'ACCESS_SCOPE_UPDATE_FAILED'); }
    finally { setBusy(false); }
  }

  if (!businessId) return <p className="text-sm text-slate-500">Select a business to manage staff.</p>;

  return (
    <div className="space-y-3">
      {canInvite && (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <h3 className="flex items-center gap-1.5 text-[13px] font-black"><UserPlus className="h-4 w-4 text-violet-600" /> Invite staff</h3>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="staff@example.com" aria-label="Staff email" className="min-h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[11px] dark:border-slate-700 dark:bg-slate-900" />
            <select value={role} onChange={(event) => setRole(event.target.value as Exclude<BusinessRole, 'owner'>)} aria-label="Staff role" className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-[11px] dark:border-slate-700 dark:bg-slate-900">
              <option value="manager">Manager</option><option value="staff">Staff</option><option value="accountant">Accountant</option>
            </select>
            <button type="button" onClick={() => void invite()} disabled={busy || !email.trim()} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-[11px] font-bold text-white disabled:opacity-50"><Mail className="h-3.5 w-3.5" /> Send invite</button>
          </div>
          {notice && <p role="status" className="mt-2 text-[11px] font-semibold text-emerald-700">{notice}</p>}
          {link && <div className="mt-2 flex items-center gap-1 rounded-lg bg-slate-50 p-2 text-[10px] dark:bg-slate-800"><code className="min-w-0 flex-1 truncate">{link}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(link)} aria-label="Copy invite link" className="rounded p-1 text-slate-500"><Copy className="h-3.5 w-3.5" /></button></div>}
          {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between"><h3 className="text-[13px] font-black">Team members</h3><button type="button" onClick={() => void load()} aria-label="Refresh members" className="rounded p-1 text-slate-500"><RefreshCw className="h-3.5 w-3.5" /></button></div>
        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => {
            const scope = accessScopeFrom(member);
            return (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-bold">{member.full_name || member.email || member.user_id}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase dark:bg-slate-800">{member.role} · {member.status}</span>
                {scope && <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" title={describeAccessScope(scope)}>Restricted: {scope.allowedModules.length} module{scope.allowedModules.length === 1 ? '' : 's'}</span>}
                {canInvite && member.role !== 'owner' && (
                  <button type="button" onClick={() => openAccess(member)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold dark:border-slate-700">
                    <ShieldCheck className="h-3 w-3" /> Access
                  </button>
                )}
              </div>
            );
          })}
          {members.length === 0 && <p className="py-2 text-[11px] text-slate-500">No active team members yet.</p>}
        </div>
      </div>

      {draft && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20" aria-label="Member workspace access">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-black">Workspace access</h3>
              <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">{draft.member.full_name || draft.member.email} can open only the modules ticked below. Leave every section unticked to allow the whole module.</p>
            </div>
            <button type="button" onClick={() => setDraft(null)} className="rounded px-2 py-1 text-[10px] font-bold text-slate-500">Close</button>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {(ACCESS_MODULES as readonly AccessModule[]).map((moduleKey) => {
              const checked = draft.modules.includes(moduleKey);
              const sections = MODULE_SECTION_KEYS[moduleKey];
              return (
                <div key={moduleKey} className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                  <label className="flex items-center gap-2 text-[11px] font-bold">
                    <input type="checkbox" checked={checked} onChange={() => toggleModule(moduleKey)} className="h-3.5 w-3.5" aria-label={ACCESS_MODULE_LABELS[moduleKey]} />
                    {ACCESS_MODULE_LABELS[moduleKey]}
                  </label>
                  {checked && sections && (
                    <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 pl-5">
                      {sections.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-1 text-[10px]">
                          <input type="checkbox" checked={(draft.sections[moduleKey] || []).includes(key)} onChange={() => toggleSection(moduleKey, key)} className="h-3 w-3" />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void saveAccess(false)} disabled={busy || draft.modules.length === 0} className="inline-flex min-h-9 items-center rounded-xl bg-violet-700 px-3 text-[11px] font-bold text-white disabled:opacity-50">Save restrictions</button>
            <button type="button" onClick={() => void saveAccess(true)} disabled={busy} className="inline-flex min-h-9 items-center rounded-xl border border-slate-300 px-3 text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200">Full access</button>
            {accessError && <p role="alert" className="text-[11px] font-semibold text-rose-700">{accessError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
