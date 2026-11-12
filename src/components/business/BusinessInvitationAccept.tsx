import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { buildAuthHeaders } from '../../lib/supabaseClient';

export function BusinessInvitationAccept() {
  const [state, setState] = useState<{ kind: 'invite' | 'transfer'; ok: boolean; message: string } | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    const query = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, '');
    const inviteToken = query.get('invite') || /^invite=(.+)$/.exec(hash)?.[1] || '';
    const transferToken = query.get('transfer-owner') || /^transfer-owner=(.+)$/.exec(hash)?.[1] || '';
    const kind = inviteToken ? 'invite' : transferToken ? 'transfer' : null;
    const token = inviteToken || transferToken;
    if (!kind || !token) return;
    attempted.current = true;
    let active = true;
    const endpoint = kind === 'invite' ? '/api/business-invitations/accept' : '/api/business-ownership-transfers/accept';
    void fetch(endpoint, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ token: decodeURIComponent(token) }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!active) return;
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
      setState({ kind, ok: true, message: kind === 'invite' ? `You joined the business as ${data.role}.` : 'Ownership transfer accepted. The business is now yours.' });
      window.history.replaceState(null, '', `${window.location.pathname}`);
    }).catch((error) => {
      if (active) setState({ kind, ok: false, message: error instanceof Error ? error.message.replaceAll('_', ' ').toLowerCase() : 'Could not accept this link.' });
    });
    return () => { active = false; };
  }, []);

  if (!state) return null;
  return (
    <div className={`fixed bottom-20 left-1/2 z-[260] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border p-3 shadow-lg ${state.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rose-300 bg-rose-50 text-rose-900'}`} role="status">
      <p className="flex items-start gap-2 text-xs font-bold">{state.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{state.message}</span></p>
    </div>
  );
}
