import fs from 'node:fs';
import path from 'node:path';
import type express from 'express';
import type { BuilderActor } from './platformBuilderRepository';
import type { PlatformSettingsRepository } from './platformSettingsApi';
import { logSafeError } from './safeLogging';

/**
 * Admin-controlled sign-in surface.
 *
 * These switches are deliberately small and non-monetary. They decide whether
 * the public sign-in screen offers guest browsing, email codes or Google.
 * Server-side authorization for protected routes never reads them: disabling a
 * button can hide a route but can never grant one.
 */

export interface AuthAccessSettings {
  guestLoginEnabled: boolean;
  emailOtpEnabled: boolean;
  googleLoginEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AuthAccessSettingsView extends AuthAccessSettings {
  source: 'database' | 'file' | 'environment' | 'default';
  emailOtpConfigured: boolean;
  googleConfigured: boolean;
}

export interface AuthAccessSettingsDependencies {
  repository: PlatformSettingsRepository | null;
  verifySession: (request: express.Request) => {
    userId?: string;
    supabaseUserId?: string;
    role?: string;
    authProvider?: string;
  } | null;
  /** Resolve a durable database admin. Required for production writes. */
  resolveAdminActor?: (request: express.Request) => Promise<BuilderActor | null>;
  /** Local-development admin authority when no database admin resolver exists. */
  isLocalAdminSession?: (claims: { userId?: string; role?: string } | null) => boolean;
  env?: NodeJS.ProcessEnv;
  /** Test and local-development override for the persisted JSON file. */
  settingsFilePath?: string;
  emailOtpConfigured: () => boolean;
  googleConfigured: boolean;
}

const DEFAULTS: AuthAccessSettings = {
  guestLoginEnabled: false,
  emailOtpEnabled: true,
  googleLoginEnabled: true,
  updatedAt: null,
  updatedBy: null,
};

const MODULE_KEY = 'app_settings';
const SETTINGS_KEY = 'authAccess';

function envBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseSettings(value: unknown): Partial<AuthAccessSettings> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parsed: Partial<AuthAccessSettings> = {};
  if (typeof record.guestLoginEnabled === 'boolean') parsed.guestLoginEnabled = record.guestLoginEnabled;
  if (typeof record.emailOtpEnabled === 'boolean') parsed.emailOtpEnabled = record.emailOtpEnabled;
  if (typeof record.googleLoginEnabled === 'boolean') parsed.googleLoginEnabled = record.googleLoginEnabled;
  if (typeof record.updatedAt === 'string' || record.updatedAt === null) parsed.updatedAt = record.updatedAt as string | null;
  if (typeof record.updatedBy === 'string' || record.updatedBy === null) parsed.updatedBy = record.updatedBy as string | null;
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function mergeSettings(base: AuthAccessSettings, patch: Partial<AuthAccessSettings> | null): AuthAccessSettings {
  if (!patch) return base;
  return {
    guestLoginEnabled: sanitizeBoolean(patch.guestLoginEnabled, base.guestLoginEnabled),
    emailOtpEnabled: sanitizeBoolean(patch.emailOtpEnabled, base.emailOtpEnabled),
    googleLoginEnabled: sanitizeBoolean(patch.googleLoginEnabled, base.googleLoginEnabled),
    updatedAt: patch.updatedAt === undefined ? base.updatedAt : patch.updatedAt,
    updatedBy: patch.updatedBy === undefined ? base.updatedBy : patch.updatedBy,
  };
}

export class AuthAccessSettingsStore {
  private readonly env: NodeJS.ProcessEnv;
  private readonly filePath: string;
  private readonly production: boolean;

  constructor(private readonly dependencies: AuthAccessSettingsDependencies) {
    this.env = dependencies.env || process.env;
    this.production = String(this.env.NODE_ENV || '') === 'production';
    this.filePath = String(
      dependencies.settingsFilePath || this.env.BOS_AUTH_SETTINGS_FILE || ''
    ).trim() || path.join(process.cwd(), '.bos-auth-settings.json');
  }

  private environmentDefaults(): AuthAccessSettings {
    return {
      guestLoginEnabled: envBoolean(this.env.BOS_GUEST_LOGIN_ENABLED, DEFAULTS.guestLoginEnabled),
      emailOtpEnabled: envBoolean(this.env.BOS_EMAIL_OTP_ENABLED, DEFAULTS.emailOtpEnabled),
      googleLoginEnabled: envBoolean(this.env.BOS_GOOGLE_LOGIN_ENABLED, DEFAULTS.googleLoginEnabled),
      updatedAt: null,
      updatedBy: null,
    };
  }

  private readFile(): AuthAccessSettings | null {
    if (this.production) return null;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const stored = parseSettings(parsed);
      if (!stored) return null;
      return mergeSettings(this.environmentDefaults(), stored);
    } catch {
      return null;
    }
  }

  private writeFile(settings: AuthAccessSettings): boolean {
    if (this.production) return false;
    const payload = JSON.stringify(settings, null, 2);
    const tempPath = `${this.filePath}.tmp-${process.pid}`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tempPath, payload, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
      return true;
    } catch (error) {
      logSafeError('auth-access', 'persist local settings', error);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      return false;
    }
  }

  private async readDatabase(): Promise<AuthAccessSettings | null> {
    const repository = this.dependencies.repository;
    if (!repository) return null;
    try {
      const state = await repository.moduleSettings();
      const payload = state.modules[MODULE_KEY]?.payload as Record<string, unknown> | undefined;
      const stored = parseSettings(payload?.[SETTINGS_KEY]);
      // No stored administrator policy means the deployment defaults apply;
      // returning a hard-coded object here would silently ignore
      // BOS_GUEST_LOGIN_ENABLED and friends on a database-backed deployment.
      if (!stored) return null;
      return mergeSettings(this.environmentDefaults(), stored);
    } catch (error) {
      logSafeError('auth-access', 'read database settings', error);
      return null;
    }
  }

  async load(): Promise<AuthAccessSettingsView> {
    const database = await this.readDatabase();
    const file = database ? null : this.readFile();
    const hasEnvironmentDefaults = Object.keys(this.env).some((key) =>
      ['BOS_GUEST_LOGIN_ENABLED', 'BOS_EMAIL_OTP_ENABLED', 'BOS_GOOGLE_LOGIN_ENABLED'].includes(key)
    );
    const settings = database || file || this.environmentDefaults();
    return {
      ...settings,
      source: database ? 'database' : file ? 'file' : hasEnvironmentDefaults ? 'environment' : 'default',
      emailOtpConfigured: this.dependencies.emailOtpConfigured(),
      googleConfigured: this.dependencies.googleConfigured,
    };
  }

  async save(
    actor: BuilderActor | null,
    patch: Partial<Pick<AuthAccessSettings, 'guestLoginEnabled' | 'emailOtpEnabled' | 'googleLoginEnabled'>>,
  ): Promise<{ ok: boolean; settings?: AuthAccessSettingsView; error?: string; message?: string }> {
    const current = await this.load();
    const next: AuthAccessSettings = mergeSettings(
      {
        guestLoginEnabled: current.guestLoginEnabled,
        emailOtpEnabled: current.emailOtpEnabled,
        googleLoginEnabled: current.googleLoginEnabled,
        updatedAt: current.updatedAt,
        updatedBy: current.updatedBy,
      },
      {
        ...patch,
        updatedAt: new Date().toISOString(),
        updatedBy: actor?.displayName || actor?.id || current.updatedBy || null,
      }
    );

    if (this.dependencies.repository) {
      if (!actor) {
        return { ok: false, error: 'AUTH_SETTINGS_ADMIN_REQUIRED', message: 'An administrator session is required.' };
      }
      try {
        const state = await this.dependencies.repository.moduleSettings();
        const existing = state.modules[MODULE_KEY]?.payload as Record<string, unknown> | undefined;
        await this.dependencies.repository.saveModuleSettings(actor, MODULE_KEY, {
          ...(existing && typeof existing === 'object' ? existing : {}),
          [SETTINGS_KEY]: next,
        });
        return { ok: true, settings: await this.load() };
      } catch (error) {
        if (error instanceof Error && /BUILDER_(?:ADMIN|SUPER_ADMIN)_REQUIRED/.test(error.message)) {
          return { ok: false, error: 'AUTH_SETTINGS_ADMIN_REQUIRED', message: 'An administrator session is required.' };
        }
        logSafeError('auth-access', 'save database settings', error);
        return { ok: false, error: 'AUTH_SETTINGS_UNAVAILABLE', message: 'Sign-in settings could not be saved.' };
      }
    }

    if (this.production) {
      return {
        ok: false,
        error: 'AUTH_SETTINGS_UNAVAILABLE',
        message: 'Sign-in settings require the configured database in production.',
      };
    }
    if (!this.writeFile(next)) {
      return { ok: false, error: 'AUTH_SETTINGS_UNAVAILABLE', message: 'Sign-in settings could not be saved.' };
    }
    return { ok: true, settings: await this.load() };
  }
}

export function registerAuthAccessSettingsApi(
  app: express.Express,
  dependencies: AuthAccessSettingsDependencies
): void {
  const store = new AuthAccessSettingsStore(dependencies);

  const requireAdminActor = async (request: express.Request): Promise<BuilderActor | null> => {
    const claims = dependencies.verifySession(request);
    if (!claims || claims.role !== 'admin') return null;
    if (dependencies.resolveAdminActor) {
      try {
        const actor = await dependencies.resolveAdminActor(request);
        if (actor) return actor;
      } catch {
        // Fall through to local-dev authority only when explicitly available.
      }
    }
    if (dependencies.isLocalAdminSession?.(claims)) {
      return {
        id: String(claims.supabaseUserId || claims.userId || 'local-admin'),
        role: 'admin',
        displayName: 'Local administrator',
      };
    }
    return null;
  };

  app.get('/api/auth/config', async (_request, response) => {
    try {
      const settings = await store.load();
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        guestLoginEnabled: settings.guestLoginEnabled,
        emailOtpEnabled: settings.emailOtpEnabled,
        googleLoginEnabled: settings.googleLoginEnabled,
        emailOtpConfigured: settings.emailOtpConfigured,
        googleConfigured: settings.googleConfigured,
        updatedAt: settings.updatedAt,
      });
    } catch (error) {
      logSafeError('auth-access', 'public config', error);
      response.setHeader('cache-control', 'no-store');
      response.status(503).json({
        ok: false,
        error: 'AUTH_CONFIG_UNAVAILABLE',
        guestLoginEnabled: false,
        emailOtpEnabled: false,
        googleLoginEnabled: false,
      });
    }
  });

  app.get('/api/admin/auth-settings', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    try {
      const settings = await store.load();
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, settings });
    } catch (error) {
      logSafeError('auth-access', 'admin read', error);
      response.status(503).json({ ok: false, error: 'AUTH_SETTINGS_UNAVAILABLE' });
    }
  });

  app.put('/api/admin/auth-settings', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    const body = (request.body || {}) as Record<string, unknown>;
    const allowed = new Set(['guestLoginEnabled', 'emailOtpEnabled', 'googleLoginEnabled']);
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
      response.status(400).json({ ok: false, error: 'AUTH_SETTINGS_INVALID' });
      return;
    }
    const patch: Partial<Pick<AuthAccessSettings, 'guestLoginEnabled' | 'emailOtpEnabled' | 'googleLoginEnabled'>> = {};
    for (const key of keys) {
      if (typeof body[key] !== 'boolean') {
        response.status(400).json({ ok: false, error: 'AUTH_SETTINGS_INVALID' });
        return;
      }
      patch[key as keyof typeof patch] = body[key] as boolean;
    }
    // At least one usable sign-in route must remain. Guest browsing is not a
    // sign-in route, so it can be disabled freely.
    const current = await store.load();
    const nextEmail = patch.emailOtpEnabled ?? current.emailOtpEnabled;
    const nextGoogle = patch.googleLoginEnabled ?? current.googleLoginEnabled;
    if (!nextEmail && !nextGoogle) {
      response.status(400).json({
        ok: false,
        error: 'AUTH_SETTINGS_NO_SIGN_IN_METHOD',
        message: 'Keep at least one account sign-in method enabled.',
      });
      return;
    }
    const result = await store.save(actor, patch);
    if (!result.ok || !result.settings) {
      response.status(result.error === 'AUTH_SETTINGS_ADMIN_REQUIRED' ? 403 : 503).json({
        ok: false,
        error: result.error || 'AUTH_SETTINGS_UNAVAILABLE',
        message: result.message,
      });
      return;
    }
    response.setHeader('cache-control', 'no-store');
    response.json({ ok: true, settings: result.settings });
  });
}
