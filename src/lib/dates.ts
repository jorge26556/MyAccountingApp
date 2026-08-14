/**
 * Utilidades de fecha en zona horaria LOCAL.
 *
 * La columna `transactions.fecha` es de tipo `date` en Postgres, asi que
 * Supabase la devuelve como el string "YYYY-MM-DD". Pasarla por `new Date(...)`
 * directamente la interpreta como medianoche UTC (lo dice la especificacion de
 * ECMAScript para fechas sin hora), lo que en Colombia (UTC-5) la corre al dia
 * anterior: "2026-08-14" se renderizaba como 13/08/2026.
 *
 * Todo el parseo y serializado de fechas de la app pasa por aqui.
 */

/** Convierte "YYYY-MM-DD" (o un ISO completo) a un Date a medianoche local. */
export const parseLocalDate = (value: string | Date): Date => {
  if (value instanceof Date) return value;

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** Serializa un Date a "YYYY-MM-DD" usando sus componentes locales. */
export const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** "YYYY-MM" local, para agrupar por mes. */
export const toMonthKey = (date: Date): string => toDateString(date).slice(0, 7);

export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

export const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const addMonths = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

/** Hoy a medianoche local. */
export const today = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
