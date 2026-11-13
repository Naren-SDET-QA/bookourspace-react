export type ExplorerLayout = 'classic' | 'airbnb';

export const explorerLayoutOptions: ReadonlyArray<{
  id: ExplorerLayout;
  label: string;
  description: string;
}> = [
  {
    id: 'classic',
    label: 'Classic BookOurSpace',
    description: 'The existing card-forward marketplace view.',
  },
  {
    id: 'airbnb',
    label: 'Airbnb-inspired',
    description: 'A clean, image-led search and reserve view.',
  },
];

export function normalizeExplorerLayout(value: unknown): ExplorerLayout {
  return value === 'classic' ? 'classic' : 'airbnb';
}
