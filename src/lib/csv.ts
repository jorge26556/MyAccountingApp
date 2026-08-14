import { parseLocalDate, toDateString } from './dates';
import type { PaymentStatus, Transaction, TransactionType } from '../types';

/**
 * Export/import CSV. Sin dependencias: el formato es suficientemente acotado
 * (lo genera esta misma app o una hoja de calculo) y meter una libreria de
 * parseo para siete columnas no se justifica.
 */

const COLUMNS = [
  'fecha',
  'tipo',
  'categoria',
  'importe',
  'estado_pago',
  'canal',
  'descripcion',
] as const;

/** Marca de orden de bytes que Excel antepone a los CSV en UTF-8. */
export const BOM = '\uFEFF';

/** Envuelve en comillas solo si hace falta, y escapa las comillas internas. */
const escapeCell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const toCsv = (transactions: Transaction[]): string => {
  const header = COLUMNS.join(',');

  const rows = transactions.map(item =>
    [
      toDateString(item.fecha),
      item.tipo,
      item.categoria,
      String(item.importe),
      item.estado_pago,
      item.canal,
      item.descripcion,
    ]
      .map(escapeCell)
      .join(',')
  );

  return [header, ...rows].join('\r\n');
};

export const downloadCsv = (transactions: Transaction[], filename: string): void => {
  // El BOM hace que Excel en Windows reconozca UTF-8 y no rompa las tildes.
  const blob = new Blob([BOM + toCsv(transactions)], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/** Parser de una linea CSV que respeta comillas y comas internas. */
export const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map(cell => cell.trim());
};

export interface CsvParseResult {
  rows: Array<Omit<Transaction, 'id' | 'user_id'>>;
  errors: string[];
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export const parseCsv = (contenido: string): CsvParseResult => {
  const rows: Array<Omit<Transaction, 'id' | 'user_id'>> = [];
  const errors: string[] = [];

  const lines = contenido
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    return { rows, errors: ['El archivo no tiene filas de datos'] };
  }

  const header = parseCsvLine(lines[0]).map(cell => cell.toLowerCase());
  const indexOf = (name: string) => header.indexOf(name);

  const faltantes = ['fecha', 'tipo', 'categoria', 'importe'].filter(
    col => indexOf(col) === -1
  );
  if (faltantes.length > 0) {
    return { rows, errors: [`Faltan columnas obligatorias: ${faltantes.join(', ')}`] };
  }

  lines.slice(1).forEach((line, index) => {
    const numeroFila = index + 2;
    const cells = parseCsvLine(line);
    const get = (name: string) => {
      const i = indexOf(name);
      return i === -1 ? '' : (cells[i] ?? '');
    };

    const fechaRaw = get('fecha');
    if (!FECHA_RE.test(fechaRaw)) {
      errors.push(`Fila ${numeroFila}: fecha "${fechaRaw}" no tiene formato YYYY-MM-DD`);
      return;
    }

    const fecha = parseLocalDate(fechaRaw);
    if (Number.isNaN(fecha.getTime())) {
      errors.push(`Fila ${numeroFila}: fecha "${fechaRaw}" no es valida`);
      return;
    }

    const tipoRaw = get('tipo');
    const tipo = (tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1).toLowerCase()) as TransactionType;
    if (tipo !== 'Ingreso' && tipo !== 'Gasto') {
      errors.push(`Fila ${numeroFila}: tipo debe ser "Ingreso" o "Gasto", llego "${tipoRaw}"`);
      return;
    }

    const categoria = get('categoria');
    if (!categoria) {
      errors.push(`Fila ${numeroFila}: la categoria es obligatoria`);
      return;
    }

    // Acepta "1.234.567,89" (formato es-CO) y "1234567.89".
    const importeRaw = get('importe').replace(/\s/g, '');
    const normalizado = importeRaw.includes(',')
      ? importeRaw.replace(/\./g, '').replace(',', '.')
      : importeRaw;
    const importe = Number(normalizado);

    if (!Number.isFinite(importe) || importe < 0) {
      errors.push(`Fila ${numeroFila}: importe "${importeRaw}" no es un numero valido >= 0`);
      return;
    }

    const estadoRaw = get('estado_pago');
    const estado_pago: PaymentStatus = estadoRaw.toLowerCase() === 'pendiente' ? 'Pendiente' : 'Pagado';

    rows.push({
      fecha,
      tipo,
      categoria,
      importe,
      estado_pago,
      canal: get('canal') || 'Directo',
      descripcion: get('descripcion'),
    });
  });

  return { rows, errors };
};
