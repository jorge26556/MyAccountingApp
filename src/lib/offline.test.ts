import { afterEach, describe, expect, it, vi } from 'vitest';
import { esFalloDeRed, esIdLocal, estaEnLinea, nuevoIdLocal } from './offline';

/**
 * Solo la logica pura. La parte de IndexedDB se prueba en el navegador: un
 * mock de IndexedDB verificaria que el mock funciona, no que la cola sirve.
 */

const fingirConexion = (valor: boolean | undefined) => {
  if (valor === undefined) {
    vi.unstubAllGlobals();
    return;
  }
  vi.stubGlobal('navigator', { onLine: valor });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ids locales', () => {
  it('marca los movimientos que aun no existen en el servidor', () => {
    expect(esIdLocal(nuevoIdLocal())).toBe(true);
  });

  it('un uuid del servidor nunca se confunde con uno local', () => {
    expect(esIdLocal('9563a2bb-f1da-41a4-91fa-4d8b0f4a98fa')).toBe(false);
  });

  it('no se repiten aunque se generen en el mismo milisegundo', () => {
    const ids = Array.from({ length: 500 }, () => nuevoIdLocal());
    expect(new Set(ids).size).toBe(500);
  });
});

describe('esFalloDeRed', () => {
  it('sin conexion, cualquier fallo cuenta como de red', () => {
    fingirConexion(false);
    expect(esFalloDeRed(new Error('lo que sea'))).toBe(true);
  });

  it('reconoce los mensajes tipicos de fetch caido', () => {
    fingirConexion(true);
    const casos = [
      new Error('Failed to fetch'),
      new Error('NetworkError when attempting to fetch resource'),
      new Error('Network request failed'),
      new Error('Load failed'),
      { message: 'TypeError: Failed to fetch' },
    ];

    for (const caso of casos) expect(esFalloDeRed(caso)).toBe(true);
  });

  it('un rechazo del servidor NO es fallo de red', () => {
    // Es la distincion que evita encolar para siempre un movimiento invalido:
    // el contador de pendientes nunca bajaria.
    fingirConexion(true);
    const casos = [
      { code: '23514', message: 'new row violates check constraint' },
      { code: '23505', message: 'duplicate key value violates unique constraint' },
      { code: '42501', message: 'permission denied for table transactions' },
      new Error('No se pudo guardar la transaccion'),
    ];

    for (const caso of casos) expect(esFalloDeRed(caso)).toBe(false);
  });

  it('tolera errores raros sin mensaje', () => {
    fingirConexion(true);
    expect(esFalloDeRed(null)).toBe(false);
    expect(esFalloDeRed(undefined)).toBe(false);
    expect(esFalloDeRed('texto suelto')).toBe(false);
  });
});

describe('estaEnLinea', () => {
  it('sigue a navigator.onLine', () => {
    fingirConexion(false);
    expect(estaEnLinea()).toBe(false);

    fingirConexion(true);
    expect(estaEnLinea()).toBe(true);
  });

  it('si el navegador no lo reporta, asume que hay conexion', () => {
    // Peor caso: se intenta la peticion y falla, y ahi se encola. Al reves
    // —asumir que no hay red— se encolaria todo sin necesidad.
    vi.stubGlobal('navigator', {});
    expect(estaEnLinea()).toBe(true);
  });
});
