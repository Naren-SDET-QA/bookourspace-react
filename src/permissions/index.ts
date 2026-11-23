/**
 * BookOurSpace user management and access control.
 *
 * Reusable, category-agnostic and plug-and-play:
 *
 *   import { authorize, ACCESS_CATEGORIES, accessControlRepositoryFor } from './permissions';
 *
 * The module owns user/provider/role resolution, category permissions, the
 * authorization decision, account activation and suspension, audit history,
 * health checking and safe recovery. Business-category behaviour stays outside
 * it: a category is a row in the shared catalog, and a new marketplace module
 * joins the engine by being declared in `src/modules/registry.ts`.
 */

export {
  ACCESS_CATEGORIES,
  ACCESS_ACTIONS,
  ACCESS_MODULE_LABELS,
  CATEGORY_ALIASES,
  COMPLETE_ACCESS_ACTIONS,
  DEFAULT_SIGNUP_ACTIONS,
  PROVIDER_MODULE_KEYS,
  activeAccessCategories,
  canonicalCategoryKey,
  categoryForProviderModule,
  categoryLabel,
  getAccessCategory,
  isPermissionAction,
  sanitizeActions,
  type AccessCategory,
  type PermissionAction,
} from './catalog';

export {
  authorize,
  authorizeAccess,
  canManageAccess,
  defaultSignupGrantRows,
  mayModifyPermissionsFor,
  type AccessActor,
  type AccessDecision,
  type AccessErrorCode,
  type AccessGrantRow,
  type AccessReason,
  type AccessResource,
  type ProviderBusinessGrant,
} from './engine';

export {
  buildRepairPlan,
  checkPermissionHealth,
  validateRepairOperation,
  type HealthFinding,
  type HealthReport,
  type HealthSnapshot,
  type RepairOperation,
  type RepairPlan,
} from './health';

export {
  AccessControlRepository,
  AccessControlError,
  type AccountDetail,
  type AccountSummary,
  type CategoryPermissionInput,
} from './repository';

export {
  registerAccessControlApi,
  type AccessControlApiDependencies,
  type AccessControlSessionClaims,
} from './api';

export {
  createAdminAccessMiddleware,
  createAuthorizationMiddleware,
  type AuthorizationContext,
  type AuthorizationResolver,
} from './middleware';
