/**
 * Universal Live Builder validators.
 *
 * The browser may only submit data that matches the registry. Every value is
 * rebuilt into a fresh object from an allowlist instead of being trusted, so an
 * unknown key, prototype-polluting name, script URL or executable field is
 * dropped or rejected before it can reach PostgreSQL.
 *
 * The server runs exactly this module. The SQL guard independently checks
 * document size, block types and immutability, so a validation bug in one layer
 * does not let an unreviewed component go live.
 */
import {
  BUILDER_ACTIONS,
  BUILDER_ALIGNMENTS,
  BUILDER_MAX_BLOCKS,
  BUILDER_MAX_DOCUMENT_BYTES,
  BUILDER_MAX_FIELDS,
  BUILDER_MAX_RECORD_BYTES,
  BUILDER_METRIC_IDS,
  BUILDER_MODULES,
  BUILDER_RADII,
  BUILDER_SCHEMA_VERSION,
  BUILDER_SPACING,
  BUILDER_THEME_KEYS,
  ENTITY_FIELD_TYPES,
  ENTITY_READ_SCOPES,
  ENTITY_RELATION_TYPES,
  ENTITY_WRITE_SCOPES,
  builderComponent,
  type BuilderBlockCategory,
  type BuilderModule,
  type BuilderPropDescriptor,
  type EntitySchemaDocument,
} from './registry';

export class BuilderValidationError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'BuilderValidationError';
  }
}

function fail(code: string, path: string, message: string): never {
  throw new BuilderValidationError(code, path, message);
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,40}$/;
const BLOCK_ID = /^[A-Za-z0-9_-]{6,64}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Markup is never rendered, so the text check only rejects content that would
// be dangerous if a renderer ever regressed. URL schemes are validated by
// cleanUrl, which returns BUILDER_UNSAFE_URL for javascript:/data:/vbscript:.
const DANGEROUS_TEXT = /<\s*script|<iframe|<object|<embed/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>, path: string): string[] {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail('BUILDER_FORBIDDEN_KEY', path, 'forbidden key');
  }
  return Object.keys(value);
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of ownKeys(value, path)) {
    if (!allowed.includes(key)) fail('BUILDER_UNKNOWN_FIELD', `${path}.${key}`, 'field is not allowed');
  }
}

function cleanText(value: unknown, path: string, maxLength: number, required = false): string {
  if (typeof value !== 'string') {
    if (value === undefined || value === null) {
      if (required) fail('BUILDER_FIELD_REQUIRED', path, 'value is required');
      return '';
    }
    fail('BUILDER_INVALID_TYPE', path, 'expected text');
  }
  if (DANGEROUS_TEXT.test(value)) fail('BUILDER_UNSAFE_CONTENT', path, 'executable content is not allowed');
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !text) fail('BUILDER_FIELD_REQUIRED', path, 'value is required');
  if (text.length > maxLength) fail('BUILDER_TEXT_TOO_LONG', path, `limit is ${maxLength} characters`);
  return text;
}

function cleanUrl(value: unknown, path: string, required = false): string {
  if (value === undefined || value === null) {
    if (required) fail('BUILDER_FIELD_REQUIRED', path, 'value is required');
    return '';
  }
  if (typeof value !== 'string') fail('BUILDER_INVALID_TYPE', path, 'expected text');
  // Scheme rejection runs before the generic text check so an unsafe URL always
  // reports BUILDER_UNSAFE_URL rather than a content error.
  const text = value.trim();
  if (!text) {
    if (required) fail('BUILDER_FIELD_REQUIRED', path, 'value is required');
    return '';
  }
  if (/^(javascript|data|vbscript|file):/i.test(text)) fail('BUILDER_UNSAFE_URL', path, 'unsafe scheme');
  if (!/^https:\/\//i.test(text) && !/^(\/|#)/.test(text)) {
    fail('BUILDER_UNSAFE_URL', path, 'only https://, app paths or in-page anchors are allowed');
  }
  if (/\s/.test(text) || /[\u0000-\u001F\u007F]/.test(text)) fail('BUILDER_UNSAFE_URL', path, 'URLs cannot contain whitespace or control characters');
  if (text.length > 500) fail('BUILDER_TEXT_TOO_LONG', path, 'limit is 500 characters');
  return text;
}

function cleanImage(value: unknown, path: string, required = false): string {
  const text = cleanUrl(value, path, required);
  if (text && !/^https:\/\//i.test(text)) {
    fail('BUILDER_UNSAFE_URL', path, 'images must be https:// URLs');
  }
  return text;
}

function cleanColor(value: unknown, path: string): string {
  const text = cleanText(value, path, 32);
  if (!text) return '';
  if (!HEX_COLOR.test(text)) fail('BUILDER_INVALID_COLOR', path, 'expected #RRGGBB');
  return text.toUpperCase();
}

function cleanNumber(
  value: unknown,
  path: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) fail('BUILDER_INVALID_NUMBER', path, 'expected a number');
  if (options.integer && !Number.isInteger(parsed)) fail('BUILDER_INVALID_NUMBER', path, 'expected a whole number');
  if (options.min !== undefined && parsed < options.min) fail('BUILDER_OUT_OF_RANGE', path, `minimum is ${options.min}`);
  if (options.max !== undefined && parsed > options.max) fail('BUILDER_OUT_OF_RANGE', path, `maximum is ${options.max}`);
  return parsed;
}

function cleanBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('BUILDER_INVALID_TYPE', path, 'expected a boolean');
  return value;
}

function cleanEnum<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  const text = cleanText(value, path, 80);
  if (!allowed.includes(text as T)) fail('BUILDER_INVALID_OPTION', path, `expected one of ${allowed.join(', ')}`);
  return text as T;
}

function cleanAction(value: unknown, path: string, required = false): string {
  const text = cleanText(value, path, 80, required);
  if (!text) return '';
  if (!BUILDER_ACTIONS.includes(text as never)) {
    fail('BUILDER_UNKNOWN_ACTION', path, 'action is not in the approved action registry');
  }
  return text;
}

function cleanModule(value: unknown, path: string): BuilderModule {
  return cleanEnum(value, path, BUILDER_MODULES);
}

function cleanMetric(value: unknown, path: string): string {
  const text = cleanText(value, path, 80, true);
  if (!BUILDER_METRIC_IDS.includes(text)) fail('BUILDER_UNKNOWN_METRIC', path, 'metric is not approved');
  return text;
}

function cleanProp(
  descriptor: BuilderPropDescriptor,
  value: unknown,
  path: string,
): string | number | boolean {
  switch (descriptor.kind) {
    case 'text':
      return cleanText(value, path, descriptor.maxLength ?? 200, descriptor.required);
    case 'longtext':
      return cleanText(value, path, descriptor.maxLength ?? 5000, descriptor.required);
    case 'url':
      return cleanUrl(value, path, descriptor.required);
    case 'image':
      return cleanImage(value, path, descriptor.required);
    case 'color':
      return cleanColor(value, path);
    case 'number':
      return cleanNumber(value, path, { min: descriptor.min, max: descriptor.max });
    case 'boolean':
      return cleanBoolean(value === undefined ? false : value, path);
    case 'select':
      return cleanEnum(value ?? descriptor.options?.[0], path, descriptor.options ?? []);
    case 'action':
      return cleanAction(value, path, descriptor.required);
    case 'module':
      return cleanModule(value ?? 'platform', path);
    case 'metric':
      return cleanMetric(value, path);
    case 'entity':
      return cleanText(value, path, 60, descriptor.required);
    default:
      return fail('BUILDER_UNKNOWN_PROP_KIND', path, 'unsupported property kind');
  }
}

export interface NormalizedBlock {
  id: string;
  type: string;
  visible: boolean;
  category: BuilderBlockCategory;
  props: Record<string, string | number | boolean>;
  style: Record<string, string>;
  children: NormalizedBlock[];
}

export interface NormalizedPageDocument {
  schemaVersion: number;
  pageKey: string;
  title: string;
  module: BuilderModule;
  description: string;
  theme: Record<string, string>;
  navigation: Array<{ id: string; label: string; href: string; visible: boolean }>;
  blocks: NormalizedBlock[];
}

const PAGE_KEYS = ['schemaVersion', 'pageKey', 'title', 'module', 'description', 'theme', 'navigation', 'blocks'];
const THEME_KEYS = [...BUILDER_THEME_KEYS];
const NAV_KEYS = ['id', 'label', 'href', 'visible'];
const BLOCK_KEYS = ['id', 'type', 'visible', 'props', 'style', 'children'];
const STYLE_KEYS = ['background', 'textColor', 'padding', 'margin', 'align'];

function normalizeTheme(value: unknown, path: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isPlainObject(value)) fail('BUILDER_INVALID_TYPE', path, 'theme must be an object');
  assertAllowedKeys(value, THEME_KEYS, path);
  const theme: Record<string, string> = {};
  for (const key of THEME_KEYS) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (key === 'buttonRadius') theme[key] = cleanEnum(raw, `${path}.${key}`, BUILDER_RADII);
    else if (key === 'spacing') theme[key] = cleanEnum(raw, `${path}.${key}`, BUILDER_SPACING);
    else theme[key] = cleanColor(raw, `${path}.${key}`);
  }
  return theme;
}

function normalizeNavigation(value: unknown, path: string): NormalizedPageDocument['navigation'] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('BUILDER_INVALID_TYPE', path, 'navigation must be an array');
  if (value.length > 24) fail('BUILDER_TOO_MANY_ITEMS', path, 'at most 24 navigation items');
  return value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(entry)) fail('BUILDER_INVALID_TYPE', itemPath, 'navigation item must be an object');
    assertAllowedKeys(entry, NAV_KEYS, itemPath);
    const id = cleanText(entry.id, `${itemPath}.id`, 64, true) || `nav_${index}`;
    if (!BLOCK_ID.test(id)) fail('BUILDER_INVALID_ID', `${itemPath}.id`, 'invalid id');
    return {
      id,
      label: cleanText(entry.label, `${itemPath}.label`, 60, true),
      href: cleanUrl(entry.href, `${itemPath}.href`, true),
      visible: entry.visible === undefined ? true : cleanBoolean(entry.visible, `${itemPath}.visible`),
    };
  });
}

export interface NormalizeBlockOptions {
  path: string;
  depth: number;
  counters: Map<string, number>;
  total: { count: number };
}

function normalizeStyle(value: unknown, path: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isPlainObject(value)) fail('BUILDER_INVALID_TYPE', path, 'style must be an object');
  assertAllowedKeys(value, STYLE_KEYS, path);
  const style: Record<string, string> = {};
  for (const key of STYLE_KEYS) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (key === 'background' || key === 'textColor') style[key] = cleanColor(raw, `${path}.${key}`);
    else if (key === 'padding' || key === 'margin') style[key] = cleanEnum(raw, `${path}.${key}`, BUILDER_SPACING);
    else style[key] = cleanEnum(raw, `${path}.${key}`, BUILDER_ALIGNMENTS);
  }
  return style;
}

function normalizeBlock(value: unknown, options: NormalizeBlockOptions): NormalizedBlock {
  const { path, depth, counters, total } = options;
  if (!isPlainObject(value)) fail('BUILDER_INVALID_TYPE', path, 'block must be an object');
  assertAllowedKeys(value, BLOCK_KEYS, path);
  if (depth > 3) fail('BUILDER_NESTING_TOO_DEEP', path, 'maximum nesting depth is 3');
  const type = cleanText(value.type, `${path}.type`, 40, true);
  const definition = builderComponent(type);
  if (!definition) fail('BUILDER_UNKNOWN_COMPONENT', `${path}.type`, 'component is not in the approved registry');
  const id = cleanText(value.id, `${path}.id`, 64, true);
  if (!BLOCK_ID.test(id)) fail('BUILDER_INVALID_ID', `${path}.id`, 'invalid block id');
  const used = (counters.get(type) ?? 0) + 1;
  if (used > definition.maxPerPage) {
    fail('BUILDER_COMPONENT_LIMIT', `${path}.type`, `at most ${definition.maxPerPage} ${type} blocks`);
  }
  counters.set(type, used);
  total.count += 1;
  if (total.count > BUILDER_MAX_BLOCKS) fail('BUILDER_TOO_MANY_BLOCKS', path, 'document block limit exceeded');

  const propsInput = value.props === undefined ? {} : value.props;
  if (!isPlainObject(propsInput)) fail('BUILDER_INVALID_TYPE', `${path}.props`, 'props must be an object');
  const allowedProps = definition.props.map((prop) => prop.key);
  assertAllowedKeys(propsInput, allowedProps, `${path}.props`);
  const props: Record<string, string | number | boolean> = {};
  for (const descriptor of definition.props) {
    if (propsInput[descriptor.key] === undefined) {
      if (descriptor.required) fail('BUILDER_FIELD_REQUIRED', `${path}.props.${descriptor.key}`, 'value is required');
      continue;
    }
    props[descriptor.key] = cleanProp(descriptor, propsInput[descriptor.key], `${path}.props.${descriptor.key}`);
  }

  const childrenInput = value.children === undefined ? [] : value.children;
  if (!Array.isArray(childrenInput)) fail('BUILDER_INVALID_TYPE', `${path}.children`, 'children must be an array');
  if (childrenInput.length > 0 && !definition.acceptsChildren) {
    fail('BUILDER_CHILDREN_NOT_ALLOWED', `${path}.children`, `${type} cannot contain children`);
  }
  if (childrenInput.length > 30) fail('BUILDER_TOO_MANY_ITEMS', `${path}.children`, 'at most 30 children');

  return {
    id,
    type,
    visible: value.visible === undefined ? true : cleanBoolean(value.visible, `${path}.visible`),
    category: definition.category,
    props,
    style: normalizeStyle(value.style, `${path}.style`),
    children: childrenInput.map((child, index) =>
      normalizeBlock(child, {
        path: `${path}.children[${index}]`,
        depth: depth + 1,
        counters,
        total,
      }),
    ),
  };
}

export function normalizePageDocument(input: unknown, expectedKey?: string): NormalizedPageDocument {
  if (!isPlainObject(input)) fail('BUILDER_INVALID_DOCUMENT', 'document', 'must be an object');
  const bytes = BufferByteLength(input);
  if (bytes > BUILDER_MAX_DOCUMENT_BYTES) {
    fail('BUILDER_DOCUMENT_TOO_LARGE', 'document', `limit is ${BUILDER_MAX_DOCUMENT_BYTES} bytes`);
  }
  assertAllowedKeys(input, PAGE_KEYS, 'document');

  const pageKey = cleanText(input.pageKey, 'document.pageKey', 41, true);
  if (!KEY_PATTERN.test(pageKey)) fail('BUILDER_INVALID_KEY', 'document.pageKey', 'expected lower_snake_case');
  if (expectedKey && pageKey !== expectedKey) {
    fail('BUILDER_KEY_MISMATCH', 'document.pageKey', `must equal ${expectedKey}`);
  }
  const schemaVersion = input.schemaVersion === undefined
    ? BUILDER_SCHEMA_VERSION
    : cleanNumber(input.schemaVersion, 'document.schemaVersion', { min: 1, integer: true });
  if (schemaVersion !== BUILDER_SCHEMA_VERSION) {
    fail('BUILDER_SCHEMA_UNSUPPORTED', 'document.schemaVersion', `client must send ${BUILDER_SCHEMA_VERSION}`);
  }

  const blocksInput = input.blocks === undefined ? [] : input.blocks;
  if (!Array.isArray(blocksInput)) fail('BUILDER_INVALID_TYPE', 'document.blocks', 'blocks must be an array');
  const counters = new Map<string, number>();
  const total = { count: 0 };
  const blocks = blocksInput.map((block, index) =>
    normalizeBlock(block, { path: `document.blocks[${index}]`, depth: 1, counters, total }),
  );

  const ids = new Set<string>();
  const visit = (list: NormalizedBlock[]) => {
    for (const block of list) {
      if (ids.has(block.id)) fail('BUILDER_DUPLICATE_ID', 'document.blocks', `duplicate block id ${block.id}`);
      ids.add(block.id);
      visit(block.children);
    }
  };
  visit(blocks);

  return {
    schemaVersion,
    pageKey,
    title: cleanText(input.title, 'document.title', 120, true),
    module: cleanModule(input.module ?? 'platform', 'document.module'),
    description: cleanText(input.description, 'document.description', 300),
    theme: normalizeTheme(input.theme, 'document.theme'),
    navigation: normalizeNavigation(input.navigation, 'document.navigation'),
    blocks,
  };
}

export function BufferByteLength(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(json, 'utf8');
    return new TextEncoder().encode(json).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

// ---------------------------------------------------------------------------
// Entity definitions
// ---------------------------------------------------------------------------

const ENTITY_KEYS = [
  'schemaVersion',
  'key',
  'label',
  'module',
  'description',
  'fields',
  'relations',
  'listView',
  'permissions',
  'workflow',
];
const ENTITY_FIELD_KEYS = [
  'key',
  'label',
  'type',
  'required',
  'options',
  'relationTarget',
  'min',
  'max',
  'maxLength',
];

function cleanStringList(value: unknown, path: string, maxItems: number, maxLength: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('BUILDER_INVALID_TYPE', path, 'expected an array of strings');
  if (value.length > maxItems) fail('BUILDER_TOO_MANY_ITEMS', path, `at most ${maxItems} entries`);
  const result: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, path, maxLength, true);
    if (!result.includes(text)) result.push(text);
  }
  return result;
}

export function normalizeEntitySchema(input: unknown, expectedKey?: string): EntitySchemaDocument {
  if (!isPlainObject(input)) fail('BUILDER_INVALID_DOCUMENT', 'entity', 'must be an object');
  if (BufferByteLength(input) > BUILDER_MAX_DOCUMENT_BYTES) {
    fail('BUILDER_DOCUMENT_TOO_LARGE', 'entity', 'entity definition is too large');
  }
  assertAllowedKeys(input, ENTITY_KEYS, 'entity');
  const key = cleanText(input.key, 'entity.key', 41, true);
  if (!KEY_PATTERN.test(key)) fail('BUILDER_INVALID_KEY', 'entity.key', 'expected lower_snake_case');
  if (expectedKey && key !== expectedKey) fail('BUILDER_KEY_MISMATCH', 'entity.key', `must equal ${expectedKey}`);

  const fieldsInput = input.fields === undefined ? [] : input.fields;
  if (!Array.isArray(fieldsInput)) fail('BUILDER_INVALID_TYPE', 'entity.fields', 'fields must be an array');
  if (fieldsInput.length === 0) fail('BUILDER_FIELD_REQUIRED', 'entity.fields', 'at least one field is required');
  if (fieldsInput.length > BUILDER_MAX_FIELDS) {
    fail('BUILDER_TOO_MANY_ITEMS', 'entity.fields', `at most ${BUILDER_MAX_FIELDS} fields`);
  }
  const fieldKeys = new Set<string>();
  const fields = fieldsInput.map((entry, index) => {
    const path = `entity.fields[${index}]`;
    if (!isPlainObject(entry)) fail('BUILDER_INVALID_TYPE', path, 'field must be an object');
    assertAllowedKeys(entry, ENTITY_FIELD_KEYS, path);
    const fieldKey = cleanText(entry.key, `${path}.key`, 41, true);
    if (!KEY_PATTERN.test(fieldKey)) fail('BUILDER_INVALID_KEY', `${path}.key`, 'expected lower_snake_case');
    if (fieldKeys.has(fieldKey)) fail('BUILDER_DUPLICATE_KEY', `${path}.key`, 'duplicate field key');
    fieldKeys.add(fieldKey);
    const type = cleanEnum(entry.type, `${path}.type`, ENTITY_FIELD_TYPES);
    const field: EntitySchemaDocument['fields'][number] = {
      key: fieldKey,
      label: cleanText(entry.label, `${path}.label`, 120, true),
      type,
      required: entry.required === undefined ? false : cleanBoolean(entry.required, `${path}.required`),
    };
    if (type === 'select' || type === 'multiselect') {
      const options = cleanStringList(entry.options, `${path}.options`, 100, 120);
      if (options.length === 0) fail('BUILDER_FIELD_REQUIRED', `${path}.options`, 'select fields need options');
      field.options = options;
    }
    if (type === 'relation') {
      const target = cleanText(entry.relationTarget, `${path}.relationTarget`, 41, true);
      if (!KEY_PATTERN.test(target)) fail('BUILDER_INVALID_KEY', `${path}.relationTarget`, 'invalid entity key');
      field.relationTarget = target;
    }
    if (entry.min !== undefined) field.min = cleanNumber(entry.min, `${path}.min`);
    if (entry.max !== undefined) field.max = cleanNumber(entry.max, `${path}.max`);
    if (entry.maxLength !== undefined) {
      field.maxLength = cleanNumber(entry.maxLength, `${path}.maxLength`, { min: 1, max: 20000, integer: true });
    }
    return field;
  });

  const relationsInput = input.relations === undefined ? [] : input.relations;
  if (!Array.isArray(relationsInput)) fail('BUILDER_INVALID_TYPE', 'entity.relations', 'relations must be an array');
  if (relationsInput.length > 20) fail('BUILDER_TOO_MANY_ITEMS', 'entity.relations', 'at most 20 relations');
  const relations = relationsInput.map((entry, index) => {
    const path = `entity.relations[${index}]`;
    if (!isPlainObject(entry)) fail('BUILDER_INVALID_TYPE', path, 'relation must be an object');
    assertAllowedKeys(entry, ['key', 'target', 'type', 'required'], path);
    const relationKey = cleanText(entry.key, `${path}.key`, 41, true);
    if (!KEY_PATTERN.test(relationKey)) fail('BUILDER_INVALID_KEY', `${path}.key`, 'expected lower_snake_case');
    if (relationKey === key) fail('BUILDER_INVALID_RELATION', `${path}.key`, 'an entity cannot relate to itself');
    const target = cleanText(entry.target, `${path}.target`, 41, true);
    if (!KEY_PATTERN.test(target)) fail('BUILDER_INVALID_KEY', `${path}.target`, 'invalid entity key');
    if (target === key) fail('BUILDER_INVALID_RELATION', `${path}.target`, 'an entity cannot relate to itself');
    return {
      key: relationKey,
      target,
      type: cleanEnum(entry.type ?? 'belongs_to', `${path}.type`, ENTITY_RELATION_TYPES),
      required: entry.required === undefined ? false : cleanBoolean(entry.required, `${path}.required`),
    };
  });

  const listViewInput = isPlainObject(input.listView) ? input.listView : {};
  assertAllowedKeys(listViewInput, ['columns', 'searchFields'], 'entity.listView');
  const columns = cleanStringList(listViewInput.columns, 'entity.listView.columns', 20, 41);
  for (const column of columns) {
    if (!fieldKeys.has(column)) fail('BUILDER_UNKNOWN_FIELD', 'entity.listView.columns', `unknown field ${column}`);
  }
  const searchFields = cleanStringList(listViewInput.searchFields, 'entity.listView.searchFields', 10, 41);
  for (const field of searchFields) {
    if (!fieldKeys.has(field)) fail('BUILDER_UNKNOWN_FIELD', 'entity.listView.searchFields', `unknown field ${field}`);
  }

  const permissionsInput = isPlainObject(input.permissions) ? input.permissions : {};
  assertAllowedKeys(permissionsInput, ['read', 'write'], 'entity.permissions');
  const permissions = {
    read: cleanEnum(permissionsInput.read ?? 'authenticated', 'entity.permissions.read', ENTITY_READ_SCOPES),
    write: cleanEnum(permissionsInput.write ?? 'admin', 'entity.permissions.write', ENTITY_WRITE_SCOPES),
  };

  let workflow: EntitySchemaDocument['workflow'];
  if (input.workflow !== undefined) {
    if (!isPlainObject(input.workflow)) fail('BUILDER_INVALID_TYPE', 'entity.workflow', 'must be an object');
    assertAllowedKeys(input.workflow, ['enabled', 'statuses', 'initialStatus'], 'entity.workflow');
    const statuses = cleanStringList(input.workflow.statuses, 'entity.workflow.statuses', 12, 40);
    const enabled = cleanBoolean(input.workflow.enabled ?? false, 'entity.workflow.enabled');
    const initialStatus = cleanText(input.workflow.initialStatus ?? statuses[0] ?? '', 'entity.workflow.initialStatus', 40);
    if (enabled && (statuses.length < 2 || !statuses.includes(initialStatus))) {
      fail('BUILDER_INVALID_WORKFLOW', 'entity.workflow', 'enabled workflows need 2+ statuses including the initial one');
    }
    workflow = { enabled, statuses, initialStatus };
  }

  return {
    schemaVersion: BUILDER_SCHEMA_VERSION,
    key,
    label: cleanText(input.label, 'entity.label', 120, true),
    module: cleanModule(input.module ?? 'platform', 'entity.module'),
    description: cleanText(input.description, 'entity.description', 300),
    fields,
    relations,
    listView: { columns, searchFields },
    permissions,
    ...(workflow ? { workflow } : {}),
  };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export function normalizeRecordData(
  schema: EntitySchemaDocument,
  input: unknown,
): Record<string, string | number | boolean | string[] | null> {
  if (!isPlainObject(input)) fail('BUILDER_INVALID_DOCUMENT', 'record', 'must be an object');
  if (BufferByteLength(input) > BUILDER_MAX_RECORD_BYTES) {
    fail('BUILDER_RECORD_TOO_LARGE', 'record', 'record is too large');
  }
  const fieldKeys = new Set(schema.fields.map((field) => field.key));
  const relationKeys = new Set(schema.relations.map((relation) => relation.key));
  for (const key of ownKeys(input, 'record')) {
    if (!fieldKeys.has(key) && !relationKeys.has(key) && key !== 'status') {
      fail('BUILDER_UNKNOWN_FIELD', `record.${key}`, 'field is not defined by the published entity');
    }
  }
  const result: Record<string, string | number | boolean | string[] | null> = {};
  for (const field of schema.fields) {
    const raw = input[field.key];
    const path = `record.${field.key}`;
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) fail('BUILDER_FIELD_REQUIRED', path, 'value is required');
      result[field.key] = null;
      continue;
    }
    switch (field.type) {
      case 'text':
      case 'textarea':
        result[field.key] = cleanText(raw, path, field.maxLength ?? (field.type === 'textarea' ? 5000 : 500), true);
        break;
      case 'email': {
        const email = cleanText(raw, path, 254, true);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('BUILDER_INVALID_EMAIL', path, 'invalid email');
        result[field.key] = email;
        break;
      }
      case 'phone': {
        const phone = cleanText(raw, path, 24, true);
        if (!/^\+?[0-9][0-9\s-]{6,20}$/.test(phone)) fail('BUILDER_INVALID_PHONE', path, 'invalid phone');
        result[field.key] = phone;
        break;
      }
      case 'url':
      case 'media':
        result[field.key] = cleanUrl(raw, path, true);
        break;
      case 'number': {
        const number = cleanNumber(raw, path, { min: field.min, max: field.max });
        result[field.key] = number;
        break;
      }
      case 'money': {
        const money = cleanNumber(raw, path, { min: field.min ?? 0, max: field.max ?? 1_000_000_000 });
        if (Math.abs(money * 100 - Math.round(money * 100)) > 1e-9) {
          fail('BUILDER_INVALID_AMOUNT', path, 'at most two decimals');
        }
        result[field.key] = money;
        break;
      }
      case 'boolean':
        result[field.key] = cleanBoolean(raw, path);
        break;
      case 'date': {
        const date = cleanText(raw, path, 10, true);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
          fail('BUILDER_INVALID_DATE', path, 'expected YYYY-MM-DD');
        }
        result[field.key] = date;
        break;
      }
      case 'datetime': {
        const timestamp = cleanText(raw, path, 40, true);
        if (Number.isNaN(Date.parse(timestamp))) fail('BUILDER_INVALID_DATE', path, 'invalid timestamp');
        result[field.key] = timestamp;
        break;
      }
      case 'select':
        result[field.key] = cleanEnum(raw, path, field.options ?? []);
        break;
      case 'multiselect': {
        const values = cleanStringList(raw, path, (field.options ?? []).length, 120);
        for (const value of values) {
          if (!(field.options ?? []).includes(value)) {
            fail('BUILDER_INVALID_OPTION', path, `unknown option ${value}`);
          }
        }
        result[field.key] = values;
        break;
      }
      case 'relation': {
        const id = cleanText(raw, path, 36, true);
        if (!UUID.test(id)) fail('BUILDER_INVALID_RELATION', path, 'expected a record UUID');
        result[field.key] = id;
        break;
      }
      default:
        fail('BUILDER_UNKNOWN_FIELD_TYPE', path, 'unsupported field type');
    }
  }
  for (const relation of schema.relations) {
    const raw = input[relation.key];
    if (raw === undefined || raw === null || raw === '') {
      if (relation.required) fail('BUILDER_FIELD_REQUIRED', `record.${relation.key}`, 'value is required');
      result[relation.key] = null;
      continue;
    }
    const id = cleanText(raw, `record.${relation.key}`, 36, true);
    if (!UUID.test(id)) fail('BUILDER_INVALID_RELATION', `record.${relation.key}`, 'expected a record UUID');
    result[relation.key] = id;
  }
  if (input.status !== undefined) {
    result.status = cleanText(input.status, 'record.status', 40, true);
    if (schema.workflow?.enabled && !schema.workflow.statuses.includes(String(result.status))) {
      fail('BUILDER_INVALID_WORKFLOW', 'record.status', 'status is not part of the published workflow');
    }
  } else if (schema.workflow?.enabled && schema.workflow.initialStatus) {
    result.status = schema.workflow.initialStatus;
  }
  return result;
}

/** Human-readable summary of what changed between two page documents. */
export function summarizeDocumentChange(
  previous: NormalizedPageDocument | null,
  next: NormalizedPageDocument,
): string {
  if (!previous) return `Created ${next.pageKey} with ${next.blocks.length} block(s)`;
  const previousTypes = new Map(previous.blocks.map((block) => [block.id, block.type]));
  const added = next.blocks.filter((block) => !previousTypes.has(block.id)).length;
  const removed = previous.blocks.filter((block) => !next.blocks.some((candidate) => candidate.id === block.id)).length;
  const changed = next.blocks.filter((block) => {
    const old = previous.blocks.find((candidate) => candidate.id === block.id);
    return old && JSON.stringify(old) !== JSON.stringify(block);
  }).length;
  const parts = [
    added ? `+${added}` : '',
    removed ? `-${removed}` : '',
    changed ? `~${changed}` : '',
  ].filter(Boolean);
  return parts.length ? `Blocks ${parts.join(' ')}` : 'Text and style updates';
}

export { ENTITY_FIELD_TYPES };
