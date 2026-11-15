import { supabase } from '../supabaseClient';
import { describeDatabaseError, isMissingDatabaseObjectError } from './dbErrors';
import { LIVE_EDIT_MODULES, type LiveEditAssignment, type LiveEditAuthority, type LiveEditCapabilities, type LiveEditListing, type LiveEditModule } from './types';

export interface LiveEditProfileRow {
  id: string;
  role: string;
  account_status?: string | null;
  email?: string | null;
  full_name?: string | null;
}

export interface LiveEditAssignmentsResult {
  ok: boolean;
  assignments: LiveEditAssignment[];
  /** `missing` means the assignment table is not installed in this project. */
  code?: 'TABLE_MISSING' | 'QUERY_FAILED';
  message?: string;
}

/**
 * Every dependency here reads identity from the Supabase-authenticated session
 * and the RLS-protected profile row. There is deliberately no way to pass a
 * role, `isAdmin` flag or scope string into the resolver.
 */
export interface LiveEditAuthorityDeps {
  getUser(): Promise<{ id: string; email?: string } | null>;
  getProfile(userId: string): Promise<LiveEditProfileRow | null>;
  /** `true`/`false` from the database RPC; `null` when the check could not run. */
  isSuperAdmin(): Promise<boolean | null>;
  getAssignments(userId: string): Promise<LiveEditAssignmentsResult>;
}

const PROVIDER_CAPABILITIES: LiveEditCapabilities = {
  scope: 'owned',
  canEditContent: true,
  canEditPricing: true,
  canEditImages: true,
  canEditFacilities: true,
  canEditCategories: true,
  canEditAvailability: true,
  canEditModerationAvailability: false,
  canEditVerification: false,
  canEditCinemaScreens: false,
  canChangePublicationStatus: false,
  readOnlyFields: [],
};

const ASSIGNED_CAPABILITIES: LiveEditCapabilities = {
  ...PROVIDER_CAPABILITIES,
  scope: 'assigned',
  canEditCinemaScreens: true,
};

const PLATFORM_CAPABILITIES: LiveEditCapabilities = {
  ...ASSIGNED_CAPABILITIES,
  scope: 'platform',
  canEditModerationAvailability: true,
  canEditVerification: true,
};

function denied(
  code: Extract<LiveEditAuthority, { ok: false }>['code'],
  message: string,
  blocked = false
): LiveEditAuthority {
  return { ok: false, code, message, blocked };
}

function assignmentsToScope(assignments: LiveEditAssignment[]): LiveEditModule[] {
  const modules = new Set<LiveEditModule>();
  for (const assignment of assignments) {
    if (LIVE_EDIT_MODULES.includes(assignment.moduleId)) modules.add(assignment.moduleId);
  }
  return LIVE_EDIT_MODULES.filter((module) => modules.has(module));
}

/**
 * Resolve what this session may edit. Fails closed: an unknown role, a missing
 * profile, an inactive account, or an unreadable assignment table never yields
 * edit authority.
 */
export async function resolveLiveEditAuthority(deps: LiveEditAuthorityDeps): Promise<LiveEditAuthority> {
  const user = await deps.getUser();
  if (!user?.id) {
    return denied('NOT_AUTHENTICATED', 'Sign in with a verified account to use Live Edit.');
  }

  const profile = await deps.getProfile(user.id);
  if (!profile) {
    return denied(
      'PROFILE_UNAVAILABLE',
      'The server-verified profile for this session could not be loaded. Live Edit is disabled.'
    );
  }
  if (profile.account_status && profile.account_status !== 'active') {
    return denied('ACCOUNT_INACTIVE', 'This account is not active. Live Edit is disabled.');
  }

  const role = profile.role;
  if (role === 'provider') {
    return {
      ok: true,
      actor: {
        userId: profile.id,
        role: 'provider',
        email: profile.email || user.email,
        displayName: profile.full_name || undefined,
      },
      scope: 'owned',
      modules: [...LIVE_EDIT_MODULES],
      assignments: [],
      capabilities: PROVIDER_CAPABILITIES,
    };
  }

  if (role === 'admin') {
    const superAdmin = await deps.isSuperAdmin();
    if (superAdmin === true) {
      return {
        ok: true,
        actor: {
          userId: profile.id,
          role: 'super_admin',
          email: profile.email || user.email,
          displayName: profile.full_name || undefined,
        },
        scope: 'platform',
        modules: 'all',
        assignments: [],
        capabilities: PLATFORM_CAPABILITIES,
      };
    }

    const result = await deps.getAssignments(profile.id);
    if (!result.ok) {
      return denied(
        'ASSIGNMENTS_UNAVAILABLE',
        result.code === 'TABLE_MISSING'
          ? 'Admin content assignments are not installed in this project, so assigned-content editing is blocked. Super Admin access is unaffected.'
          : `Admin content assignments could not be read (${result.message || 'database error'}). Live Edit is disabled for this account.`,
        true
      );
    }
    if (result.assignments.length === 0) {
      return denied(
        'NO_ASSIGNED_CONTENT',
        'This administrator has no assigned content. Ask a Super Admin to assign modules or listings before editing.'
      );
    }
    const modules = assignmentsToScope(result.assignments);
    if (modules.length === 0) {
      return denied('NO_ASSIGNED_CONTENT', 'The assignment records contain no supported module.');
    }
    return {
      ok: true,
      actor: {
        userId: profile.id,
        role: 'admin',
        email: profile.email || user.email,
        displayName: profile.full_name || undefined,
      },
      scope: 'assigned',
      modules,
      assignments: result.assignments,
      capabilities: {
        ...ASSIGNED_CAPABILITIES,
        canEditCinemaScreens: modules.includes('movies'),
      },
    };
  }

  return denied('ROLE_NOT_ELIGIBLE', 'Live Edit is only available to providers and administrators.');
}

export function authorityModules(authority: LiveEditAuthority | null): LiveEditModule[] {
  if (!authority || !authority.ok) return [];
  return authority.modules === 'all' ? [...LIVE_EDIT_MODULES] : authority.modules;
}

export interface ListingPermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Defense-in-depth check performed again in the UI and immediately before every
 * write. The server re-checks the session, role and listing ownership itself.
 */
export function canEditListing(authority: LiveEditAuthority, listing: LiveEditListing): ListingPermission {
  if (!authority.ok) {
    return { allowed: false, reason: authority.message };
  }
  if (authority.modules !== 'all' && !authority.modules.includes(listing.module)) {
    return { allowed: false, reason: 'This module is outside your assigned content.' };
  }
  if (listing.module === 'movies' && !authority.capabilities.canEditCinemaScreens) {
    return { allowed: false, reason: 'Cinema screen operations are limited to Super Admin / assigned admins.' };
  }

  if (authority.scope === 'platform') return { allowed: true };

  if (authority.scope === 'owned') {
    if (!listing.ownerId || listing.ownerId !== authority.actor.userId) {
      return { allowed: false, reason: 'You can only edit your own listings.' };
    }
    return { allowed: true };
  }

  const assignment = authority.assignments.find((entry) => entry.moduleId === listing.module);
  if (!assignment) {
    return { allowed: false, reason: 'No assignment covers this module.' };
  }
  if (assignment.listingIds.length === 0 && assignment.categoryIds.length === 0) return { allowed: true };
  if (assignment.listingIds.includes(listing.id)) return { allowed: true };
  if (assignment.categoryIds.includes(listing.categoryId)) return { allowed: true };
  return { allowed: false, reason: 'This listing is outside the categories/listings assigned to you.' };
}

export function describeAuthority(authority: LiveEditAuthority): string {
  if (!authority.ok) return `Live Edit unavailable — ${authority.message}`;
  if (authority.scope === 'platform') return 'Super Admin · platform-wide';
  if (authority.scope === 'assigned') {
    return `Admin · ${authority.modules.length} assigned module${authority.modules.length === 1 ? '' : 's'}`;
  }
  return 'Provider · own listings';
}

/** Production dependencies backed by the authenticated Supabase client. */
export function createSupabaseLiveEditAuthorityDeps(): LiveEditAuthorityDeps {
  return {
    async getUser() {
      if (!supabase) return null;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return null;
        return { id: data.user.id, email: data.user.email || undefined };
      } catch {
        return null;
      }
    },
    async getProfile(userId) {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, account_status, email, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return null;
      return data as LiveEditProfileRow;
    },
    async isSuperAdmin() {
      if (!supabase) return null;
      try {
        const { data, error } = await supabase.rpc('is_current_user_super_admin');
        if (error) return null;
        return data === true;
      } catch {
        return null;
      }
    },
    async getAssignments(userId) {
      if (!supabase) {
        return { ok: false, code: 'QUERY_FAILED', assignments: [], message: 'Supabase is not configured.' };
      }
      let response: {
        data?: Array<{ module_id?: string; category_id?: string | null; listing_id?: string | null }> | null;
        error?: { code?: string; message?: string; details?: string; hint?: string } | null;
      };
      try {
        response = await supabase
          .from('live_edit_admin_assignments')
          .select('module_id, category_id, listing_id')
          .eq('admin_user_id', userId);
      } catch (error) {
        return {
          ok: false,
          code: 'QUERY_FAILED',
          assignments: [],
          message: error instanceof Error ? error.message : 'assignment query failed',
        };
      }
      if (response.error) {
        return {
          ok: false,
          code: isMissingDatabaseObjectError(response.error) ? 'TABLE_MISSING' : 'QUERY_FAILED',
          assignments: [],
          message: describeDatabaseError(response.error),
        };
      }
      const grouped = new Map<LiveEditModule, LiveEditAssignment>();
      for (const row of response.data || []) {
        const moduleId = row.module_id as LiveEditModule;
        if (!LIVE_EDIT_MODULES.includes(moduleId)) continue;
        const entry =
          grouped.get(moduleId) || { moduleId, categoryIds: [], listingIds: [] };
        if (typeof row.category_id === 'string' && row.category_id.trim()) {
          entry.categoryIds.push(row.category_id.trim());
        }
        if (typeof row.listing_id === 'string' && row.listing_id.trim()) {
          entry.listingIds.push(row.listing_id.trim());
        }
        grouped.set(moduleId, entry);
      }
      return { ok: true, assignments: [...grouped.values()] };
    },
  };
}
