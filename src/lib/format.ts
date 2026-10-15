import { currencyCode } from '@/constants/theme';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode });

export function formatMoney(cents: number) {
  return money.format((Number.isFinite(cents) ? cents : 0) / 100);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function toCents(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}
