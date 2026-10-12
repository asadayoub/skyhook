/**
 * Scope Windowing
 * Pruning rules for active vs all plan scopes.
 */

export function isItemWithinActiveWindow(item, windowDays = 14) {
  if (!item) return false;
  if (item.status === 'cancelled') return false;

  const activeStatuses = ['ready', 'in-progress', 'in-review', 'blocked', 'backlog'];
  if (activeStatuses.includes(item.status)) {
    return true;
  }

  const completedStatuses = ['done', 'verified', 'implemented'];
  if (completedStatuses.includes(item.status)) {
    const ts = item.completedAt || item.updatedAt;
    if (!ts) {
      // Graceful fallback for mock/legacy items without timestamps
      return true;
    }
    const itemDate = new Date(ts);
    if (isNaN(itemDate.getTime())) {
      return true;
    }
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    return itemDate >= cutoff;
  }

  // Any other status: if not cancelled, default to true
  return true;
}
