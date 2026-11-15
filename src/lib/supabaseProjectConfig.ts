export interface SupabaseProjectConfigInput {
  url?: string | null;
  projectId?: string | null;
  allowedProjectRefs?: string | null;
}

export interface ResolvedSupabaseProjectConfig {
  ok: boolean;
  url: string;
  projectId: string;
  error?: 'missing_configuration' | 'invalid_project_ref' | 'invalid_url' | 'project_ref_mismatch' | 'unapproved_project';
}

/** Resolve only an explicitly configured, allowlisted hosted Supabase project. */
export function resolveSupabaseProjectConfig(
  input: SupabaseProjectConfigInput
): ResolvedSupabaseProjectConfig {
  const rawUrl = String(input.url || '').trim();
  const projectId = String(input.projectId || '').trim().toLowerCase();
  const allowedRefs = new Set(
    String(input.allowedProjectRefs || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );

  if (!rawUrl || !projectId || allowedRefs.size === 0) {
    return { ok: false, url: '', projectId: '', error: 'missing_configuration' };
  }
  if (!/^[a-z0-9]{20}$/.test(projectId)) {
    return { ok: false, url: '', projectId: '', error: 'invalid_project_ref' };
  }
  if (!allowedRefs.has(projectId)) {
    return { ok: false, url: '', projectId: '', error: 'unapproved_project' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, url: '', projectId: '', error: 'invalid_url' };
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.hostname !== `${projectId}.supabase.co`
  ) {
    return {
      ok: false,
      url: '',
      projectId: '',
      error: parsed.hostname && parsed.hostname !== `${projectId}.supabase.co`
        ? 'project_ref_mismatch'
        : 'invalid_url',
    };
  }

  return { ok: true, url: parsed.origin, projectId };
}
