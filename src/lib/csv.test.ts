import { describe, expect, it } from 'vitest';
import { BOM, parseCsv, parseCsvLine, toCsv } from './csv';
import { toDateString } from './dates';
import type { Account, Transaction } from '../types';

const CUENTAS: Account[] = [
  { id: 'cta-nequi', nombre: 'Nequi', tipo: 'Banco', saldoInicial: 0, archivada: false, orden: 0 },
  { id: 'cta-efectivo', nombre: 'Efectivo', tipo: 'Efectivo', saldoInicial: 0, archivada: false, orden: 1 },
];

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'id-1',
  user_id: 'user-1',
  fecha: new Date(2026, 7, 14),
  tipo: 'Gasto',
  categoria: 'Mercado',
  importe: 50000,
  estado_pago: 'Pagado',
  descripcion: 'Compra semanal',
  account_id: 'cta-nequi',
  transfer_group: null,
  compra_id: null,
  cuota_numero: null,
  cuota_total: null,
  ...over,
});

describe('parseCsvLine', () => {
  it('separa celdas simples', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('respeta comas dentro de comillas', () => {
    expect(parseCsvLine('2026-08-14,Gasto,"Mercado, frutas",1000')).toEqual([
      '2026-08-14',
      'Gasto',
      'Mercado, frutas',
      '1000',
    ]);
  });

  it('desescapa comillas dobles', () => {
    expect(parseCsvLine('"dijo ""hola""",x')).toEqual(['dijo "hola"', 'x']);
  });
});

describe('toCsv', () => {
  it('escribe encabezado y fila, con el NOMBRE de la cuenta', () => {
    const csv = toCsv([tx()], CUENTAS);
    const [header, row] = csv.split('\r\n');

    expect(header).toBe('fecha,tipo,categoria,importe,estado_pago,cuenta,descripcion,transferencia');
    // El uuid de la cuenta no le sirve a nadie en una hoja de calculo.
    expect(row).toBe('2026-08-14,Gasto,Mercado,50000,Pagado,Nequi,Compra semanal,');
  });

  it('entrecomilla descripciones con comas', () => {
    const csv = toCsv([tx({ descripcion: 'Pan, leche y huevos' })], CUENTAS);
    expect(csv).toContain('"Pan, leche y huevos"');
  });

  it('usa la fecha local, sin corrimiento', () => {
    const csv = toCsv([tx({ fecha: new Date(2026, 0, 1) })], CUENTAS);
    expect(csv).toContain('2026-01-01');
  });
});

describe('parseCsv', () => {
  const header = 'fecha,tipo,categoria,importe,estado_pago,cuenta,descripcion';

  it('hace round-trip con toCsv', () => {
    const original = [tx(), tx({ tipo: 'Ingreso', categoria: 'Extra', importe: 1200000 })];
    const { rows, errors } = parseCsv(toCsv(original, CUENTAS), CUENTAS);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(toDateString(rows[0].fecha)).toBe('2026-08-14');
    expect(rows[1].tipo).toBe('Ingreso');
    expect(rows[1].importe).toBe(1200000);
  });

  it('el round-trip conserva la cuenta y el par de una transferencia', () => {
    // Sin la columna `transferencia`, reimportar un respaldo convertiria las dos
    // patas en un ingreso y un gasto sueltos, inflando ambos totales.
    const original = [
      tx({ account_id: 'cta-efectivo' }),
      tx({ transfer_group: 'grupo-9', categoria: 'Transferencia' }),
    ];
    const { rows } = parseCsv(toCsv(original, CUENTAS), CUENTAS);

    expect(rows[0].account_id).toBe('cta-efectivo');
    expect(rows[1].transfer_group).toBe('grupo-9');
    expect(rows[0].transfer_group).toBeNull();
  });

  it('resuelve el nombre de la cuenta sin importar mayusculas ni espacios', () => {
    const { rows } = parseCsv(`${header}\n2026-08-14,Gasto,Mercado,100,Pagado,  nequi ,x`, CUENTAS);
    expect(rows[0].account_id).toBe('cta-nequi');
  });

  it('un CSV viejo con columna "canal" sigue importando', () => {
    // Los respaldos anteriores a las cuentas no tienen columna `cuenta`. Sus
    // filas caen en la primera cuenta en vez de rechazarse.
    const viejo = 'fecha,tipo,categoria,importe,estado_pago,canal,descripcion';
    const { rows, errors } = parseCsv(`${viejo}\n2026-08-14,Gasto,Mercado,100,Pagado,Directo,x`, CUENTAS);

    expect(errors).toEqual([]);
    expect(rows[0].account_id).toBe('cta-nequi');
  });

  it('acepta importes en formato es-CO', () => {
    const { rows, errors } = parseCsv(`${header}\n2026-08-14,Gasto,Mercado,"1.234.567,89",Pagado,Nequi,x`);
    expect(errors).toEqual([]);
    expect(rows[0].importe).toBeCloseTo(1234567.89);
  });

  it('normaliza el tipo sin importar mayusculas', () => {
    const { rows } = parseCsv(`${header}\n2026-08-14,gasto,Mercado,100,pagado,Nequi,x`);
    expect(rows[0].tipo).toBe('Gasto');
    expect(rows[0].estado_pago).toBe('Pagado');
  });

  it('reporta la fila exacta de cada error y no la importa', () => {
    const contenido = [
      header,
      '2026-08-14,Gasto,Mercado,100,Pagado,Nequi,ok',
      '14/08/2026,Gasto,Mercado,100,Pagado,Nequi,fecha mala',
      '2026-08-15,Transferencia,Mercado,100,Pagado,Nequi,tipo malo',
      '2026-08-16,Gasto,Mercado,-50,Pagado,Nequi,importe negativo',
      '2026-08-17,Gasto,,100,Pagado,Nequi,sin categoria',
    ].join('\n');

    const { rows, errors } = parseCsv(contenido);

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('Fila 3');
    expect(errors[1]).toContain('Fila 4');
    expect(errors[2]).toContain('Fila 5');
    expect(errors[3]).toContain('Fila 6');
  });

  it('rechaza el archivo si faltan columnas obligatorias', () => {
    const { rows, errors } = parseCsv('fecha,tipo\n2026-08-14,Gasto');
    expect(rows).toEqual([]);
    expect(errors[0]).toContain('Faltan columnas obligatorias');
  });

  it('tolera el BOM que agrega Excel', () => {
    const { errors, rows } = parseCsv(`${BOM}${header}\n2026-08-14,Gasto,Mercado,100,Pagado,Nequi,x`);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('usa valores por defecto para columnas opcionales ausentes', () => {
    const { rows } = parseCsv('fecha,tipo,categoria,importe\n2026-08-14,Gasto,Mercado,100', CUENTAS);
    expect(rows[0].account_id).toBe('cta-nequi');
    expect(rows[0].estado_pago).toBe('Pagado');
    expect(rows[0].descripcion).toBe('');
    expect(rows[0].transfer_group).toBeNull();
  });

  it('sin cuentas configuradas deja account_id en null en vez de inventarse una', () => {
    const { rows } = parseCsv('fecha,tipo,categoria,importe\n2026-08-14,Gasto,Mercado,100');
    expect(rows[0].account_id).toBeNull();
  });
});
