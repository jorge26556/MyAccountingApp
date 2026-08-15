import { describe, expect, it } from 'vitest';
import {
  categoriasPorUso,
  descripcionesFrecuentes,
  normalizarTexto,
  plantillasFrecuentes,
  sugerirDesdeDescripcion,
} from './sugerencias';
import type { Transaction } from '../types';

let seq = 0;
const tx = (fecha: string, over: Partial<Transaction> = {}): Transaction => {
  const [y, m, d] = fecha.split('-').map(Number);
  return {
    id: `id-${++seq}`,
    user_id: 'user-1',
    fecha: new Date(y, m - 1, d),
    tipo: 'Gasto',
    categoria: 'Comida',
    importe: 18_000,
    estado_pago: 'Pagado',
    descripcion: 'Almuerzo',
    account_id: 'cta-1',
    transfer_group: null,
    compra_id: null,
    cuota_numero: null,
    cuota_total: null,
    debt_id: null,
    recibo_path: null,
    ...over,
  };
};

const HOY = new Date(2026, 7, 14);

describe('normalizarTexto', () => {
  it('quita espacios sobrantes y mayusculas', () => {
    expect(normalizarTexto('  Almuerzo   DEL  trabajo ')).toBe('almuerzo del trabajo');
  });
});

describe('plantillasFrecuentes', () => {
  it('propone lo que repites', () => {
    const plantillas = plantillasFrecuentes(
      [tx('2026-08-01'), tx('2026-08-05'), tx('2026-08-10')],
      6,
      HOY
    );

    expect(plantillas).toHaveLength(1);
    expect(plantillas[0].descripcion).toBe('Almuerzo');
    expect(plantillas[0].veces).toBe(3);
  });

  it('un movimiento unico NO es una plantilla', () => {
    // Si bastara con una vez, la lista se llenaria de cosas irrepetibles y
    // dejaria de servir para lo que se hizo.
    const plantillas = plantillasFrecuentes([tx('2026-08-01', { descripcion: 'Notaría' })], 6, HOY);
    expect(plantillas).toHaveLength(0);
  });

  it('agrupa aunque el importe cambie, y propone el de la ultima vez', () => {
    // El almuerzo de 18.000 y el de 22.000 son la misma costumbre.
    const plantillas = plantillasFrecuentes(
      [
        tx('2026-08-01', { importe: 18_000 }),
        tx('2026-08-05', { importe: 20_000 }),
        tx('2026-08-12', { importe: 22_000 }),
      ],
      6,
      HOY
    );

    expect(plantillas).toHaveLength(1);
    expect(plantillas[0].veces).toBe(3);
    expect(plantillas[0].importe).toBe(22_000);
  });

  it('con todo registrado el MISMO dia, propone el importe de la ultima', () => {
    // Regresion: `fecha` es una columna de solo dia, asi que varios
    // movimientos del mismo dia empatan y el desempate por fecha no decide
    // nada. Antes ganaba el mas viejo del monton: se registraban tres
    // almuerzos seguidos de 18k, 20k y 22k y la plantilla proponia 18k.
    const mismoDia = [
      tx('2026-08-14', { importe: 22_000 }),
      tx('2026-08-14', { importe: 20_000 }),
      tx('2026-08-14', { importe: 18_000 }),
    ];

    expect(plantillasFrecuentes(mismoDia, 6, HOY)[0].importe).toBe(22_000);
  });

  it('no depende del orden en que lleguen las filas', () => {
    const datos = [
      tx('2026-08-01', { importe: 18_000 }),
      tx('2026-08-12', { importe: 22_000 }),
      tx('2026-08-05', { importe: 20_000 }),
    ];

    expect(plantillasFrecuentes(datos, 6, HOY)[0].importe).toBe(22_000);
    expect(plantillasFrecuentes([...datos].reverse(), 6, HOY)[0].importe).toBe(22_000);
  });

  it('agrupa ignorando mayusculas y espacios', () => {
    const plantillas = plantillasFrecuentes(
      [tx('2026-08-01', { descripcion: 'Almuerzo' }), tx('2026-08-05', { descripcion: '  ALMUERZO ' })],
      6,
      HOY
    );
    expect(plantillas).toHaveLength(1);
  });

  it('ordena por frecuencia y desempata por lo mas reciente', () => {
    const plantillas = plantillasFrecuentes(
      [
        tx('2026-08-01', { descripcion: 'Gasolina', categoria: 'Transporte' }),
        tx('2026-08-02', { descripcion: 'Gasolina', categoria: 'Transporte' }),
        tx('2026-08-03', { descripcion: 'Almuerzo' }),
        tx('2026-08-04', { descripcion: 'Almuerzo' }),
        tx('2026-08-13', { descripcion: 'Almuerzo' }),
      ],
      6,
      HOY
    );

    expect(plantillas.map(p => p.descripcion)).toEqual(['Almuerzo', 'Gasolina']);
  });

  it('descarta los movimientos sin descripcion', () => {
    const plantillas = plantillasFrecuentes(
      [tx('2026-08-01', { descripcion: '' }), tx('2026-08-05', { descripcion: '  ' })],
      6,
      HOY
    );
    expect(plantillas).toHaveLength(0);
  });

  it('ignora lo de hace mas de seis meses', () => {
    // Lo que pagabas el ano pasado no deberia mandar sobre lo de este mes.
    const plantillas = plantillasFrecuentes(
      [tx('2025-01-05'), tx('2025-01-20'), tx('2025-02-05')],
      6,
      HOY
    );
    expect(plantillas).toHaveLength(0);
  });

  it('las transferencias nunca son plantilla', () => {
    const plantillas = plantillasFrecuentes(
      [
        tx('2026-08-01', { transfer_group: 'g1', descripcion: 'Paso a Nequi' }),
        tx('2026-08-05', { transfer_group: 'g2', descripcion: 'Paso a Nequi' }),
      ],
      6,
      HOY
    );
    expect(plantillas).toHaveLength(0);
  });

  it('respeta el limite pedido', () => {
    const datos = ['A', 'B', 'C', 'D'].flatMap(nombre => [
      tx('2026-08-01', { descripcion: nombre }),
      tx('2026-08-02', { descripcion: nombre }),
    ]);
    expect(plantillasFrecuentes(datos, 2, HOY)).toHaveLength(2);
  });
});

describe('categoriasPorUso', () => {
  const categorias = ['Arriendo', 'Comida', 'Salud', 'Transporte'];

  it('pone primero las que mas usas', () => {
    const datos = [
      tx('2026-08-01', { categoria: 'Transporte' }),
      tx('2026-08-02', { categoria: 'Transporte' }),
      tx('2026-08-03', { categoria: 'Comida' }),
    ];

    expect(categoriasPorUso(datos, categorias, undefined, HOY).slice(0, 2)).toEqual([
      'Transporte',
      'Comida',
    ]);
  });

  it('no esconde las que nunca has usado: van despues, alfabeticas', () => {
    const datos = [tx('2026-08-01', { categoria: 'Comida' })];
    const orden = categoriasPorUso(datos, categorias, undefined, HOY);

    expect(orden[0]).toBe('Comida');
    expect(orden.slice(1)).toEqual(['Arriendo', 'Salud', 'Transporte']);
  });

  it('cuenta solo el tipo pedido', () => {
    const datos = [
      tx('2026-08-01', { categoria: 'Salud', tipo: 'Ingreso' }),
      tx('2026-08-02', { categoria: 'Comida', tipo: 'Gasto' }),
    ];

    expect(categoriasPorUso(datos, categorias, 'Gasto', HOY)[0]).toBe('Comida');
    expect(categoriasPorUso(datos, categorias, 'Ingreso', HOY)[0]).toBe('Salud');
  });

  it('sin historial devuelve la lista alfabetica intacta', () => {
    expect(categoriasPorUso([], categorias, undefined, HOY)).toEqual([
      'Arriendo',
      'Comida',
      'Salud',
      'Transporte',
    ]);
  });
});

describe('sugerirDesdeDescripcion', () => {
  const datos = [
    tx('2026-08-01', { descripcion: 'Gasolina', categoria: 'Transporte', importe: 90_000 }),
    tx('2026-08-10', { descripcion: 'Gasolina', categoria: 'Transporte', importe: 110_000 }),
    tx('2026-08-05', { descripcion: 'Almuerzo', categoria: 'Comida', importe: 18_000 }),
  ];

  it('devuelve lo de la ultima vez, no lo de la primera', () => {
    const sugerencia = sugerirDesdeDescripcion(datos, 'Gasolina', HOY)!;

    expect(sugerencia.categoria).toBe('Transporte');
    expect(sugerencia.importe).toBe(110_000);
  });

  it('ignora mayusculas y espacios', () => {
    expect(sugerirDesdeDescripcion(datos, '  gasolina ', HOY)?.categoria).toBe('Transporte');
  });

  it('exige coincidencia exacta, no parecido', () => {
    // Adivinar por similitud acabaria clasificando "Mercadopago" como
    // "Mercado", y corregir una categoria mal puesta cuesta mas que elegirla.
    expect(sugerirDesdeDescripcion(datos, 'Gasol', HOY)).toBeNull();
    expect(sugerirDesdeDescripcion(datos, 'Gasolina Terpel', HOY)).toBeNull();
  });

  it('devuelve null con texto vacio o sin historial', () => {
    expect(sugerirDesdeDescripcion(datos, '   ', HOY)).toBeNull();
    expect(sugerirDesdeDescripcion([], 'Gasolina', HOY)).toBeNull();
  });
});

describe('descripcionesFrecuentes', () => {
  it('ordena por frecuencia y no repite variantes de la misma', () => {
    // "Almuerzo" y "almuerzo" son la misma: una sola entrada en la lista.
    const datos = [
      tx('2026-08-02', { descripcion: 'almuerzo' }),
      tx('2026-08-01', { descripcion: 'Almuerzo' }),
      tx('2026-08-03', { descripcion: 'Gasolina' }),
    ];

    expect(descripcionesFrecuentes(datos, 10, HOY)).toEqual(['almuerzo', 'Gasolina']);
  });

  it('conserva la escritura mas reciente', () => {
    const datos = [
      tx('2026-08-01', { descripcion: 'almuerzo' }),
      tx('2026-08-09', { descripcion: 'Almuerzo trabajo' }),
      tx('2026-08-10', { descripcion: 'ALMUERZO' }),
    ];

    expect(descripcionesFrecuentes(datos, 10, HOY)[0]).toBe('ALMUERZO');
  });
});
