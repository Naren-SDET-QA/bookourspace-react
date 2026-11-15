/**
 * Universal Live Builder registry/validator tests.
 *
 * These run without a database and assert the security boundary that makes the
 * builder safe to expose to administrators: only reviewed components, props and
 * value shapes can reach persistence, and nothing executable is representable.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUILDER_COMPONENTS,
  BUILDER_COMPONENT_MAP,
  BUILDER_METRICS,
  builderComponent,
} from '../src/lib/builder/registry.ts';
import {
  BuilderValidationError,
  normalizeEntitySchema,
  normalizePageDocument,
  normalizeRecordData,
} from '../src/lib/builder/validate.ts';

function page(overrides = {}) {
  return {
    schemaVersion: 1,
    pageKey: 'services',
    title: 'Home Services',
    module: 'services',
    description: '',
    theme: { primaryColor: '#4338CA', buttonRadius: 'rounded-xl' },
    navigation: [{ id: 'nav_home', label: 'Home', href: '/#', visible: true }],
    blocks: [],
    ...overrides,
  };
}

function heading(text, extra = {}) {
  return { id: 'heading_001', type: 'heading', visible: true, props: { text, level: 'h2' }, ...extra };
}

test('the registry has unique reviewed component types', () => {
  const types = BUILDER_COMPONENTS.map((component) => component.type);
  assert.equal(new Set(types).size, types.length);
  assert.ok(types.length >= 25);
  assert.ok(builderComponent('booking_widget'));
  assert.equal(builderComponent('script'), null);
  assert.equal(builderComponent('custom_component'), null);
  assert.ok(BUILDER_METRICS.length >= 6);
});

test('a valid page document is normalised and defaults are not injected', () => {
  const normalized = normalizePageDocument(page({ blocks: [heading('Verified pros')] }));
  assert.equal(normalized.pageKey, 'services');
  assert.equal(normalized.module, 'services');
  assert.equal(normalized.theme.primaryColor, '#4338CA');
  assert.equal(normalized.blocks.length, 1);
  assert.equal(normalized.blocks[0].type, 'heading');
});

test('unknown components, props and document fields are rejected', () => {
  assert.throws(
    () => normalizePageDocument(page({ blocks: [{ id: 'x_custom_1', type: 'custom_html', props: {} }] })),
    (error) => error instanceof BuilderValidationError && error.code === 'BUILDER_UNKNOWN_COMPONENT',
  );
  assert.throws(
    () => normalizePageDocument(page({ blocks: [{ ...heading('Hi'), props: { text: 'Hi', onclick: 'alert(1)' } }] })),
    (error) => error.code === 'BUILDER_UNKNOWN_FIELD',
  );
  assert.throws(
    () => normalizePageDocument(page({ injected: true })),
    (error) => error.code === 'BUILDER_UNKNOWN_FIELD',
  );
});

test('executable text and unsafe URLs never pass validation', () => {
  assert.throws(
    () => normalizePageDocument(page({ blocks: [heading('<script>alert(1)</script>')] })),
    (error) => error.code === 'BUILDER_UNSAFE_CONTENT',
  );
  assert.throws(
    () => normalizePageDocument(page({ blocks: [{ id: 'button_001', type: 'button', props: { label: 'Go', href: 'javascript:alert(1)' } }] })),
    (error) => error.code === 'BUILDER_UNSAFE_URL',
  );
  assert.throws(
    () => normalizePageDocument(page({ blocks: [{ id: 'image_001', type: 'image', props: { src: 'http://insecure.example/x.png', alt: 'x' } }] })),
    (error) => error.code === 'BUILDER_UNSAFE_URL',
  );
  assert.throws(
    () => normalizePageDocument(page({ navigation: [{ id: 'navbad01', label: 'x', href: 'data:text/html,<script>' }] })),
    (error) => error.code === 'BUILDER_UNSAFE_URL',
  );
});

test('colors, radii and navigation are restricted to design tokens', () => {
  assert.throws(
    () => normalizePageDocument(page({ theme: { primaryColor: 'red' } })),
    (error) => error.code === 'BUILDER_INVALID_COLOR',
  );
  assert.throws(
    () => normalizePageDocument(page({ theme: { buttonRadius: 'rounded-none' } })),
    (error) => error.code === 'BUILDER_INVALID_OPTION',
  );
  const normalized = normalizePageDocument(page());
  assert.equal(normalized.navigation[0].href, '/#');
});

test('required props, duplicate ids and component limits are enforced', () => {
  assert.throws(
    () => normalizePageDocument(page({ blocks: [{ id: 'heading_002', type: 'heading', props: {} }] })),
    (error) => error.code === 'BUILDER_FIELD_REQUIRED',
  );
  assert.throws(
    () => normalizePageDocument(page({ blocks: [heading('A'), heading('B')] })),
    (error) => error.code === 'BUILDER_DUPLICATE_ID',
  );
  const hearings = Array.from({ length: 41 }, (_, index) => ({
    id: `heading_${String(index).padStart(3, '0')}`,
    type: 'heading',
    props: { text: `Heading ${index}` },
  }));
  assert.throws(
    () => normalizePageDocument(page({ blocks: hearings })),
    (error) => error.code === 'BUILDER_COMPONENT_LIMIT',
  );
});

test('nesting is limited and children are only accepted by containers', () => {
  const nested = {
    id: 'section_001',
    type: 'section',
    props: { title: 'Outer' },
    children: [{
      id: 'section_002',
      type: 'section',
      props: { title: 'Inner' },
      children: [{
        id: 'section_003',
        type: 'section',
        props: { title: 'Too deep' },
        children: [{
          id: 'section_004',
          type: 'section',
          props: { title: 'Deeper' },
          children: [heading('Overflow')],
        }],
      }],
    }],
  };
  assert.throws(
    () => normalizePageDocument(page({ blocks: [nested] })),
    (error) => error.code === 'BUILDER_NESTING_TOO_DEEP',
  );
  assert.throws(
    () => normalizePageDocument(page({ blocks: [{ ...heading('Hi'), children: [heading('Child')] }] })),
    (error) => error.code === 'BUILDER_CHILDREN_NOT_ALLOWED',
  );
});

test('entity schemas require real field types and safe relations', () => {
  const schema = (overrides = {}) => ({
    schemaVersion: 1,
    key: 'schools',
    label: 'Schools',
    module: 'classes',
    fields: [
      { key: 'name', label: 'School name', type: 'text', required: true },
      { key: 'board', label: 'Board', type: 'select', required: false, options: ['CBSE', 'ICSE'] },
    ],
    relations: [],
    listView: { columns: ['name'], searchFields: ['name'] },
    permissions: { read: 'authenticated', write: 'admin' },
    ...overrides,
  });
  const normalized = normalizeEntitySchema(schema());
  assert.equal(normalized.fields.length, 2);
  assert.throws(
    () => normalizeEntitySchema(schema({ fields: [{ key: 'x', label: 'X', type: 'sql' }] })),
    (error) => error.code === 'BUILDER_INVALID_OPTION',
  );
  assert.throws(
    () => normalizeEntitySchema(schema({ relations: [{ key: 'parent', target: 'schools', type: 'belongs_to' }] })),
    (error) => error.code === 'BUILDER_INVALID_RELATION',
  );
  assert.throws(
    () => normalizeEntitySchema(schema({ listView: { columns: ['missing'], searchFields: [] } })),
    (error) => error.code === 'BUILDER_UNKNOWN_FIELD',
  );
});

test('records are rebuilt from the published schema only', () => {
  const schema = normalizeEntitySchema({
    schemaVersion: 1,
    key: 'jobs',
    label: 'Jobs',
    module: 'classes',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, maxLength: 120 },
      { key: 'salary', label: 'Salary', type: 'money', required: false, min: 0 },
      { key: 'school_id', label: 'School', type: 'relation', required: true, relationTarget: 'schools' },
      { key: 'status', label: 'Status', type: 'select', required: false, options: ['open', 'closed'] },
    ],
    relations: [],
    listView: { columns: ['title'], searchFields: ['title'] },
    permissions: { read: 'public', write: 'admin' },
  });
  const data = normalizeRecordData(schema, {
    title: 'Maths teacher',
    salary: 45000.5,
    school_id: '11111111-1111-4111-8111-111111111111',
    status: 'open',
  });
  assert.equal(data.title, 'Maths teacher');
  assert.equal(data.salary, 45000.5);
  assert.throws(
    () => normalizeRecordData(schema, { title: 'x', school_id: '11111111-1111-4111-8111-111111111111', injected: 'DROP TABLE users' }),
    (error) => error.code === 'BUILDER_UNKNOWN_FIELD',
  );
  assert.throws(
    () => normalizeRecordData(schema, { title: 'x', school_id: 'not-a-uuid' }),
    (error) => error.code === 'BUILDER_INVALID_RELATION',
  );
  assert.throws(
    () => normalizeRecordData(schema, { title: 'x', school_id: '11111111-1111-4111-8111-111111111111', salary: 10.999 }),
    (error) => error.code === 'BUILDER_INVALID_AMOUNT',
  );
  assert.throws(
    () => normalizeRecordData(schema, { school_id: '11111111-1111-4111-8111-111111111111' }),
    (error) => error.code === 'BUILDER_FIELD_REQUIRED',
  );
});

test('keys and schema versions fail closed', () => {
  assert.throws(() => normalizePageDocument(page({ pageKey: 'Bad Key' })), (error) => error.code === 'BUILDER_INVALID_KEY');
  assert.throws(
    () => normalizePageDocument(page({ schemaVersion: 99 })),
    (error) => error.code === 'BUILDER_SCHEMA_UNSUPPORTED',
  );
  assert.throws(
    () => normalizePageDocument(page(), 'classes'),
    (error) => error.code === 'BUILDER_KEY_MISMATCH',
  );
  assert.equal(BUILDER_COMPONENT_MAP.booking_widget.superAdminPublish, true);
});
