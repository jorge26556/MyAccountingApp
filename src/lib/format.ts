/**
 * Formateo de moneda centralizado.
 *
 * Antes estaba duplicado en App.tsx, TransactionsTable, SettingsPanel y
 * DashboardCharts, cada uno con su propia copia de 'es-CO' / 'COP'. Cambiar de
 * moneda implicaba tocar cuatro archivos.
 */

export const CURRENCY = 'COP';
export const LOCALE = 'es-CO';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatCurrency = (value: number): string =>
  currencyFormatter.format(value);

/** Version corta para ejes de charts, donde el valor completo no cabe. */
export const formatCurrencyCompact = (value: number): string =>
  compactFormatter.format(value);

/** Gastos con signo explicito, para no confundirlos con ingresos en la tabla. */
export const formatSigned = (value: number, tipo: 'Ingreso' | 'Gasto'): string =>
  `${tipo === 'Gasto' ? '−' : '+'}${currencyFormatter.format(Math.abs(value))}`;

export const formatPercent = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
