/** Finds inline data URLs in metadata payloads before they reach PostgreSQL. */
export function findEmbeddedDataUrl(value: unknown, path = 'payload', depth = 0): string | null {
  if (depth > 32 || value == null) return null;
  if (typeof value === 'string') {
    return /^data:[^,]{1,200},/i.test(value.trim()) ? path : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findEmbeddedDataUrl(value[index], `${path}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const found = findEmbeddedDataUrl(entry, `${path}.${key}`, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
