/**
 * Approved platform policy configuration.
 *
 * These values are presentation and workflow preferences only. They are
 * validated on the server before storage and are never consulted by pricing,
 * inventory availability, payment capture, refunds, RLS or any authorization
 * decision. A published policy can make a UI stricter, never grant a capability.
 */

export const POLICY_PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'wallet'] as const;
export const POLICY_SETTLEMENT_CYCLES = ['T+1', 'T+2', 'weekly'] as const;
export const POLICY_REPORT_RANGES = ['7d', '30d', '90d'] as const;

/** Marketplace sections a role may be offered in its navigation. */
export const POLICY_ROLE_SECTIONS = [
  'pg_hostels',
  'classes',
  'venues',
  'services',
  'hotel_stay',
  'movies',
  'bookings',
  'provider_portal',
] as const;

export const POLICY_REPORT_METRICS = ['bookings', 'revenue', 'occupancy', 'listings', 'users', 'refunds'] as const;

export interface PaymentPolicy {
  /** Methods the customer UI may advertise. The server still decides what is payable. */
  methods: string[];
  /** Display-only deposit hint. The authoritative amount always comes from the server. */
  depositDisplayPercent: number;
  refundWindowDays: number;
  /** Orders at or above this amount are flagged for manual review; never blocks server checks. */
  manualReviewAbove: number;
  settlementCycle: string;
}

export interface InventoryPolicy {
  holdMinutes: number;
  overbookingBuffer: number;
  minNoticeHours: number;
  autoRelease: boolean;
}

export interface RolePolicy {
  customerSections: string[];
  providerSections: string[];
  adminSections: string[];
}

export interface ReportPolicy {
  defaultRange: string;
  metrics: string[];
  exportEnabled: boolean;
}

export interface PolicyDocument {
  payment: PaymentPolicy;
  inventory: InventoryPolicy;
  roles: RolePolicy;
  reports: ReportPolicy;
}

export const DEFAULT_POLICIES: PolicyDocument = {
  payment: {
    methods: ['upi', 'card', 'netbanking'],
    depositDisplayPercent: 20,
    refundWindowDays: 7,
    manualReviewAbove: 0,
    settlementCycle: 'T+1',
  },
  inventory: {
    holdMinutes: 15,
    overbookingBuffer: 0,
    minNoticeHours: 2,
    autoRelease: true,
  },
  roles: {
    customerSections: ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'],
    providerSections: ['provider_portal'],
    adminSections: ['bookings', 'provider_portal'],
  },
  reports: {
    defaultRange: '30d',
    metrics: ['bookings', 'revenue', 'occupancy'],
    exportEnabled: true,
  },
};

export class PolicyValidationError extends Error {
  readonly code = 'POLICY_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'PolicyValidationError';
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PolicyValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new PolicyValidationError(`${path}.${key} is not an approved setting`);
  }
}

function boundedNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new PolicyValidationError(`${path} must be a number between ${min} and ${max}`);
  }
  return Math.round(value * 100) / 100;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new PolicyValidationError(`${path} must be true or false`);
  return value;
}

function oneOf(value: unknown, path: string, allowed: readonly string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new PolicyValidationError(`${path} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function subset(value: unknown, path: string, allowed: readonly string[], minimum = 1): string[] {
  if (!Array.isArray(value)) throw new PolicyValidationError(`${path} must be an array`);
  const unique = [...new Set(value)];
  if (unique.length < minimum) throw new PolicyValidationError(`${path} needs at least ${minimum} entry`);
  for (const entry of unique) {
    if (typeof entry !== 'string' || !allowed.includes(entry)) {
      throw new PolicyValidationError(`${path} contains an unapproved value`);
    }
  }
  return unique as string[];
}

/**
 * Validate an arbitrary payload into a policy document. Missing groups fall back
 * to defaults so an older client cannot erase a category it does not know about.
 */
export function normalizePolicies(input: unknown): PolicyDocument {
  const root = object(input, 'policies');
  onlyKeys(root, ['payment', 'inventory', 'roles', 'reports'], 'policies');

  const paymentInput = root.payment === undefined ? {} : object(root.payment, 'policies.payment');
  onlyKeys(
    paymentInput,
    ['methods', 'depositDisplayPercent', 'refundWindowDays', 'manualReviewAbove', 'settlementCycle'],
    'policies.payment',
  );
  const payment: PaymentPolicy = {
    methods: paymentInput.methods === undefined
      ? [...DEFAULT_POLICIES.payment.methods]
      : subset(paymentInput.methods, 'policies.payment.methods', POLICY_PAYMENT_METHODS),
    depositDisplayPercent: paymentInput.depositDisplayPercent === undefined
      ? DEFAULT_POLICIES.payment.depositDisplayPercent
      : boundedNumber(paymentInput.depositDisplayPercent, 'policies.payment.depositDisplayPercent', 0, 100),
    refundWindowDays: paymentInput.refundWindowDays === undefined
      ? DEFAULT_POLICIES.payment.refundWindowDays
      : boundedNumber(paymentInput.refundWindowDays, 'policies.payment.refundWindowDays', 0, 60),
    manualReviewAbove: paymentInput.manualReviewAbove === undefined
      ? DEFAULT_POLICIES.payment.manualReviewAbove
      : boundedNumber(paymentInput.manualReviewAbove, 'policies.payment.manualReviewAbove', 0, 10_000_000),
    settlementCycle: paymentInput.settlementCycle === undefined
      ? DEFAULT_POLICIES.payment.settlementCycle
      : oneOf(paymentInput.settlementCycle, 'policies.payment.settlementCycle', POLICY_SETTLEMENT_CYCLES),
  };

  const inventoryInput = root.inventory === undefined ? {} : object(root.inventory, 'policies.inventory');
  onlyKeys(
    inventoryInput,
    ['holdMinutes', 'overbookingBuffer', 'minNoticeHours', 'autoRelease'],
    'policies.inventory',
  );
  const inventory: InventoryPolicy = {
    holdMinutes: inventoryInput.holdMinutes === undefined
      ? DEFAULT_POLICIES.inventory.holdMinutes
      : boundedNumber(inventoryInput.holdMinutes, 'policies.inventory.holdMinutes', 1, 240),
    overbookingBuffer: inventoryInput.overbookingBuffer === undefined
      ? DEFAULT_POLICIES.inventory.overbookingBuffer
      : boundedNumber(inventoryInput.overbookingBuffer, 'policies.inventory.overbookingBuffer', 0, 20),
    minNoticeHours: inventoryInput.minNoticeHours === undefined
      ? DEFAULT_POLICIES.inventory.minNoticeHours
      : boundedNumber(inventoryInput.minNoticeHours, 'policies.inventory.minNoticeHours', 0, 168),
    autoRelease: inventoryInput.autoRelease === undefined
      ? DEFAULT_POLICIES.inventory.autoRelease
      : boolean(inventoryInput.autoRelease, 'policies.inventory.autoRelease'),
  };

  const rolesInput = root.roles === undefined ? {} : object(root.roles, 'policies.roles');
  onlyKeys(rolesInput, ['customerSections', 'providerSections', 'adminSections'], 'policies.roles');
  const roles: RolePolicy = {
    customerSections: rolesInput.customerSections === undefined
      ? [...DEFAULT_POLICIES.roles.customerSections]
      : subset(rolesInput.customerSections, 'policies.roles.customerSections', POLICY_ROLE_SECTIONS, 0),
    providerSections: rolesInput.providerSections === undefined
      ? [...DEFAULT_POLICIES.roles.providerSections]
      : subset(rolesInput.providerSections, 'policies.roles.providerSections', POLICY_ROLE_SECTIONS, 0),
    adminSections: rolesInput.adminSections === undefined
      ? [...DEFAULT_POLICIES.roles.adminSections]
      : subset(rolesInput.adminSections, 'policies.roles.adminSections', POLICY_ROLE_SECTIONS, 0),
  };

  const reportsInput = root.reports === undefined ? {} : object(root.reports, 'policies.reports');
  onlyKeys(reportsInput, ['defaultRange', 'metrics', 'exportEnabled'], 'policies.reports');
  const reports: ReportPolicy = {
    defaultRange: reportsInput.defaultRange === undefined
      ? DEFAULT_POLICIES.reports.defaultRange
      : oneOf(reportsInput.defaultRange, 'policies.reports.defaultRange', POLICY_REPORT_RANGES),
    metrics: reportsInput.metrics === undefined
      ? [...DEFAULT_POLICIES.reports.metrics]
      : subset(reportsInput.metrics, 'policies.reports.metrics', POLICY_REPORT_METRICS),
    exportEnabled: reportsInput.exportEnabled === undefined
      ? DEFAULT_POLICIES.reports.exportEnabled
      : boolean(reportsInput.exportEnabled, 'policies.reports.exportEnabled'),
  };

  return { payment, inventory, roles, reports };
}
