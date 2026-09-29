import { describe, expect, it } from 'vitest';
import {
  aplicarCola,
  aplicarColaAListas,
  categoriaPorDefecto,
  encolarOperacion,
  normalizarNombre,
  ordenarItems,
  resumenLista,
  sugerirItems,
  type OperacionLista,
} from './listas';
import type { ShoppingItem } from '../types';

let seq = 0;

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: `item-${++seq}`,
  list_id: 'lista-1',
  nombre: 'Leche',
  cantidad: '',
  precio: null,
  comprado: false,
  orden: seq,
  ...over,
});

describe('resumenLista', () => {
  it('cuenta comprados y pendientes', () => {
    const resumen = resumenLista([item({ comprado: true }), item(), item()]);
    expect(resumen).toMatchObject({ total: 3, comprados: 1, pendientes: 2 });
  });

  it('el estimado solo suma los ítems con precio, y avisa cuantos no tienen', () => {
    const resumen = resumenLista([
      item({ precio: 5_000, comprado: true }),
      item({ precio: 12_000 }),
      item({ precio: null, comprado: true }),
    ]);

    expect(resumen.estimado).toBe(17_000);
    expect(resumen.estimadoComprados).toBe(5_000);
    expect(resumen.sinPrecio).toBe(1);
  });

  it('una lista vacia no revienta', () => {
    expect(resumenLista([])).toMatchObject({ total: 0, estimado: 0, pendientes: 0 });
  });
});

describe('ordenarItems', () => {
  it('lo que falta va arriba y lo del carrito abajo, cada grupo en su orden', () => {
    const ordenados = ordenarItems([
      item({ id: 'a', orden: 1, comprado: true }),
      item({ id: 'b', orden: 3 }),
      item({ id: 'c', orden: 2 }),
      item({ id: 'd', orden: 0, comprado: true }),
    ]);
    expect(ordenados.map(i => i.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('normalizarNombre', () => {
  it('ignora mayusculas, tildes y espacios de sobra', () => {
    expect(normalizarNombre('  Café   molido ')).toBe('cafe molido');
    expect(normalizarNombre('LÉCHE')).toBe(normalizarNombre('leche'));
  });
});

describe('sugerirItems', () => {
  const historial = [
    item({ nombre: 'Huevos', cantidad: '30', precio: 18_000 }),
    item({ nombre: 'Leche' }),
    item({ nombre: 'huevos', cantidad: '12' }),
    item({ nombre: 'Pan' }),
    item({ nombre: 'Huevos ' }),
    item({ nombre: 'leche' }),
  ];

  it('ordena por frecuencia', () => {
    const sugerencias = sugerirItems(historial, []);
    expect(sugerencias.map(s => s.nombre)).toEqual(['Huevos', 'Leche', 'Pan']);
    expect(sugerencias[0].veces).toBe(3);
  });

  it('propone la cantidad y el precio de la vez mas reciente', () => {
    const [huevos] = sugerirItems(historial, []);
    expect(huevos.cantidad).toBe('30');
    expect(huevos.precio).toBe(18_000);
  });

  it('no sugiere lo que ya esta en la lista, aunque este escrito distinto', () => {
    const sugerencias = sugerirItems(historial, [item({ nombre: 'HUEVOS' })]);
    expect(sugerencias.map(s => s.nombre)).toEqual(['Leche', 'Pan']);
  });

  it('respeta el limite', () => {
    expect(sugerirItems(historial, [], 1)).toHaveLength(1);
  });
});

describe('categoriaPorDefecto', () => {
  it('prefiere Mercado', () => {
    expect(categoriaPorDefecto(['Arriendo', 'mercado', 'Salidas'])).toBe('mercado');
  });

  it('si no hay Mercado, la primera alfabetica', () => {
    expect(categoriaPorDefecto(['Salidas', 'Arriendo'])).toBe('Arriendo');
  });

  it('sin categorias, vacio', () => {
    expect(categoriaPorDefecto([])).toBe('');
  });
});

describe('cola sin conexion', () => {
  const datos = {
    list_id: 'lista-1',
    nombre: 'Pan',
    cantidad: '',
    precio: null,
    comprado: false,
    orden: 1,
  };

  it('los cambios a un ítem creado sin señal se funden en su creacion', () => {
    let cola: OperacionLista[] = [];
    cola = encolarOperacion(cola, { tipo: 'crear_item', id: 'local-1', datos });
    cola = encolarOperacion(cola, { tipo: 'actualizar_item', id: 'local-1', cambios: { comprado: true } });

    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ tipo: 'crear_item', datos: { comprado: true } });
  });

  it('un ítem creado y borrado sin señal no deja rastro', () => {
    let cola: OperacionLista[] = [];
    cola = encolarOperacion(cola, { tipo: 'crear_item', id: 'local-1', datos });
    cola = encolarOperacion(cola, { tipo: 'actualizar_item', id: 'local-1', cambios: { comprado: true } });
    cola = encolarOperacion(cola, { tipo: 'borrar_item', id: 'local-1' });

    expect(cola).toEqual([]);
  });

  it('tachar y destachar varias veces deja una sola operacion con el ultimo valor', () => {
    let cola: OperacionLista[] = [];
    [true, false, true].forEach(comprado => {
      cola = encolarOperacion(cola, { tipo: 'actualizar_item', id: 'srv-1', cambios: { comprado } });
    });

    expect(cola).toEqual([{ tipo: 'actualizar_item', id: 'srv-1', cambios: { comprado: true } }]);
  });

  it('borrar un ítem del servidor descarta sus cambios pendientes y encola el borrado', () => {
    let cola: OperacionLista[] = [];
    cola = encolarOperacion(cola, { tipo: 'actualizar_item', id: 'srv-1', cambios: { comprado: true } });
    cola = encolarOperacion(cola, { tipo: 'borrar_item', id: 'srv-1' });

    expect(cola).toEqual([{ tipo: 'borrar_item', id: 'srv-1' }]);
  });

  it('no mezcla ítems distintos', () => {
    let cola: OperacionLista[] = [];
    cola = encolarOperacion(cola, { tipo: 'actualizar_item', id: 'srv-1', cambios: { comprado: true } });
    cola = encolarOperacion(cola, { tipo: 'actualizar_item', id: 'srv-2', cambios: { comprado: true } });
    expect(cola).toHaveLength(2);
  });

  it('aplicarCola reproduce sobre los ítems lo que se hizo sin señal', () => {
    const servidor = [item({ id: 'srv-1' }), item({ id: 'srv-2' })];
    const cola: OperacionLista[] = [
      { tipo: 'actualizar_item', id: 'srv-1', cambios: { comprado: true } },
      { tipo: 'borrar_item', id: 'srv-2' },
      { tipo: 'crear_item', id: 'local-1', datos },
    ];

    const resultado = aplicarCola(servidor, cola);
    expect(resultado.map(i => [i.id, i.comprado])).toEqual([
      ['srv-1', true],
      ['local-1', false],
    ]);
  });

  it('aplicarColaAListas muestra como terminada la lista cerrada sin señal', () => {
    const listas = [
      { id: 'l1', estado: 'abierta', total: null },
      { id: 'l2', estado: 'abierta', total: null },
    ];
    const resultado = aplicarColaAListas(listas, [
      { tipo: 'completar_lista', id: 'l1', total: 85_000, transaction_id: null },
    ]);

    expect(resultado[0]).toEqual({ id: 'l1', estado: 'completada', total: 85_000 });
    expect(resultado[1].estado).toBe('abierta');
  });
});
