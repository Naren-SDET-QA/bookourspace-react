const FAVORITES_KEY = 'bos_course_favorites_v1';

export function loadCourseFavorites(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isCourseFavorite(courseId: string): boolean {
  return loadCourseFavorites().includes(courseId);
}

export function toggleCourseFavorite(courseId: string): boolean {
  const current = loadCourseFavorites();
  const next = current.includes(courseId)
    ? current.filter((id) => id !== courseId)
    : [...current, courseId];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    /* The visual state still updates for this session. */
  }
  return next.includes(courseId);
}
