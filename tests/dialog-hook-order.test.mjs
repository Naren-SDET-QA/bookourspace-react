import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');

const components = [
  {
    file: 'src/components/PaymentModal.tsx',
    start: 'export const PaymentModal: React.FC<PaymentModalProps>',
    panelRef: 'dialogPanelRef',
  },
  {
    file: 'src/components/PostListingWizard.tsx',
    start: 'export const PostListingWizard: React.FC<PostListingWizardProps>',
    panelRef: 'panelRef',
  },
];

const HOOK_CALL = /\buse(?:State|Ref|Effect|LayoutEffect|Memo|Callback|Context|Reducer|DialogFocus|SyncExternalStore|Transition|DeferredValue|Id)\s*[<(]/g;

function componentBody({ file, start }) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${file} must still declare the reviewed component`);
  return { source, body: source.slice(startIndex) };
}

for (const component of components) {
  test(`${component.file}: hooks run before every conditional early return`, () => {
    const { body } = componentBody(component);
    const earlyReturn = body.indexOf('if (!isOpen) return null;');
    assert.notEqual(earlyReturn, -1, `${component.file} must still short-circuit a closed overlay`);

    const hooksAfterReturn = [...body.matchAll(HOOK_CALL)]
      .filter((match) => match.index > earlyReturn)
      .map((match) => body.slice(match.index, body.indexOf('\n', match.index)).trim());
    assert.deepEqual(
      hooksAfterReturn,
      [],
      `${component.file} calls hooks after the closed-overlay return, so the closed render has a different hook count than the open render`,
    );
  });

  test(`${component.file}: dialog focus follows the isOpen prop`, () => {
    const { body } = componentBody(component);
    const hookCalls = [...body.matchAll(/\buseDialogFocus\s*\(/g)];
    assert.equal(hookCalls.length, 1, `${component.file} must call useDialogFocus exactly once`);

    const callIndex = hookCalls[0].index;
    const call = body.slice(callIndex, body.indexOf(';', callIndex));
    assert.match(
      call,
      /^useDialogFocus\(\s*isOpen\s*,/,
      `${component.file} must pass the real isOpen state to useDialogFocus instead of a constant`,
    );
    assert.doesNotMatch(
      body,
      /useDialogFocus\(\s*true\s*,/,
      `${component.file} must not activate dialog focus while the overlay is closed`,
    );
    assert.ok(
      call.includes(component.panelRef),
      `${component.file} must hand its rendered panel ref to useDialogFocus`,
    );
    const panelTags = body
      .split('<')
      .filter((tag) => tag.includes(`ref={${component.panelRef}}`))
      .map((tag) => tag.slice(0, tag.indexOf('>') + 1));
    assert.ok(panelTags.length > 0, `${component.file} must attach ${component.panelRef} to rendered markup`);
    assert.ok(
      panelTags.every((tag) => tag.includes('role="dialog"')),
      `${component.file} must attach ${component.panelRef} only to the role="dialog" panel`,
    );
  });

  test(`${component.file}: the close path stays reachable`, () => {
    const { body } = componentBody(component);
    const closeControl = body.match(/<button[^>]*aria-label="[^"]*(?:Close|Back)[^"]*"[^>]*>/);
    assert.ok(closeControl, `${component.file} must keep an aria-labelled close control`);
    assert.match(closeControl[0], /onClick=/, `${component.file} close control must keep its click handler`);
  });
}

test('the overlays still pass their live close callbacks', () => {
  const payment = readFileSync(path.join(repoRoot, 'src/components/PaymentModal.tsx'), 'utf8');
  assert.match(payment, /useDialogFocus\(isOpen, handleReset, dialogPanelRef\)/);
  assert.match(payment, /const handleReset = \(\) => \{[\s\S]*?setPaymentSuccess\(false\);[\s\S]*?onClose\(\);/);

  const wizard = readFileSync(path.join(repoRoot, 'src/components/PostListingWizard.tsx'), 'utf8');
  assert.match(wizard, /useDialogFocus\(isOpen, onClose, panelRef\)/);
  assert.match(wizard, /if \(!authUser \|\| !\['provider', 'admin'\]\.includes\(authUser\.role\)\) \{\s*return <ProviderOnboardingForm/);
});
