export const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);

// Date-only values ("2026-09-20" or midnight UTC) are calendar dates, not moments: format them in UTC so
// customers west of Greenwich do not see the previous day.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z)?$/;

export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', ...(DATE_ONLY.test(iso) ? { timeZone: 'UTC' } : {}),
      })
    : '—';

export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
