export function getTheatreCardMeta(row: { is_visible: boolean; parent_visible: boolean }) {
  if (!row.parent_visible) {
    return {
      statusLabel: row.is_visible ? 'LIVE' : 'OFF',
      actionLabel: row.is_visible ? 'Disable theatre' : 'Enable theatre',
      statusDescription: 'Source feed inactive; enable it upstream before publishing',
    } as const;
  }
  return row.is_visible
    ? {
        statusLabel: 'LIVE',
        actionLabel: 'Disable theatre',
        statusDescription: 'Visible in public movie listings',
      } as const
    : {
        statusLabel: 'OFF',
        actionLabel: 'Enable theatre',
        statusDescription: 'Hidden from public movie listings',
      } as const;
}
