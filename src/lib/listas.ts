import type { ShoppingItem } from '../types';

/**
 * Listas de compras: la parte que no toca la red.
 *
 * El flujo es planear → comprar → registrar. Los precios de los ítems son una
 * estimacion opcional; lo que cuenta es el valor final del recibo, que se
 * registra como UN gasto en la categoria de la lista.
 */

export interface ResumenLista {
  total: number;
  comprados: number;
  pendientes: number;
  /** Suma de los precios estimados de todos los ítems que tienen precio. */
  estimado: number;
  /** Lo mismo, solo de lo que ya esta en el carrito. */
  estimadoComprados: number;
  /** Cuantos ítems no tienen precio: el estimado se queda corto por eso. */
  sinPrecio: number;
}

export const resumenLista = (items: ShoppingItem[]): ResumenLista => {
  let comprados = 0;
  let estimado = 0;
  let estimadoComprados = 0;
  let sinPrecio = 0;

  items.forEach(item => {
    if (item.comprado) comprados += 1;
    if (item.precio === null) {
      sinPrecio += 1;
      return;
    }
    estimado += item.precio;
    if (item.comprado) estimadoComprados += item.precio;
  });

  return {
    total: items.length,
    comprados,
    pendientes: items.length - comprados,
    estimado,
    estimadoComprados,
    sinPrecio,
  };
};

/**
 * Lo que falta arriba, lo que ya esta en el carrito abajo.
 *
 * En el supermercado se mira la lista para saber que falta: si lo tachado se
 * quedara en su sitio, habria que saltarlo con la vista en cada pasillo.
 */
export const ordenarItems = (items: ShoppingItem[]): ShoppingItem[] =>
  [...items].sort(
    (a, b) => Number(a.comprado) - Number(b.comprado) || a.orden - b.orden
  );

/** "Leche ", "leche" y "LÉCHE" son el mismo ítem. */
export const normalizarNombre = (nombre: string): string =>
  nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

export interface SugerenciaItem {
  nombre: string;
  veces: number;
  cantidad: string;
  precio: number | null;
}

/**
 * Lo que sueles comprar y todavia no esta en la lista.
 *
 * Por frecuencia: lo que aparece en casi todas las listas (leche, huevos) es lo
 * que mas se olvida anotar justamente porque "siempre se compra".
 *
 * `historial` debe venir del mas reciente al mas antiguo: la cantidad y el
 * precio que se proponen son los de la ultima vez, no los de hace un año.
 */
export const sugerirItems = (
  historial: ShoppingItem[],
  actuales: ShoppingItem[],
  limite = 8
): SugerenciaItem[] => {
  const yaEstan = new Set(actuales.map(item => normalizarNombre(item.nombre)));
  const porNombre = new Map<string, SugerenciaItem>();

  historial.forEach(item => {
    const clave = normalizarNombre(item.nombre);
    if (!clave || yaEstan.has(clave)) return;

    const existente = porNombre.get(clave);
    if (existente) {
      existente.veces += 1;
      return;
    }
    porNombre.set(clave, {
      nombre: item.nombre.trim(),
      veces: 1,
      cantidad: item.cantidad,
      precio: item.precio,
    });
  });

  return Array.from(porNombre.values())
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre))
    .slice(0, limite);
};

/**
 * La categoria que se propone al crear una lista.
 *
 * "Mercado" si existe, que es para lo que casi siempre se hace una lista. Si
 * no, la primera alfabetica, igual que el desplegable.
 */
export const categoriaPorDefecto = (categorias: string[]): string => {
  const mercado = categorias.find(nombre => normalizarNombre(nombre) === 'mercado');
  if (mercado) return mercado;
  return [...categorias].sort((a, b) => a.localeCompare(b))[0] ?? '';
};

/* ─────────────────────────── cola sin conexion ───────────────────────────── */

/**
 * Lo que se hace en el supermercado tiene que funcionar sin señal: agregar un
 * ítem, tacharlo, borrarlo y terminar la compra. Esos cambios quedan en una
 * cola y se suben al volver la conexion.
 *
 * La cola se COMPACTA al encolar. Tachar y destachar un ítem cinco veces sin
 * señal deja una sola operacion, y un ítem creado y borrado sin señal no deja
 * ninguna. Asi la cola no crece con el uso, y —lo importante— nunca hay que
 * traducir el id temporal de un ítem creado sin señal al id que le asigne el
 * servidor: todo lo que le pase antes de subir se funde en su creacion.
 */

export interface DatosItem {
  list_id: string;
  nombre: string;
  cantidad: string;
  precio: number | null;
  comprado: boolean;
  orden: number;
}

export type CambiosItem = Partial<Pick<ShoppingItem, 'nombre' | 'cantidad' | 'precio' | 'comprado'>>;

export type OperacionLista =
  | { tipo: 'crear_item'; id: string; datos: DatosItem }
  | { tipo: 'actualizar_item'; id: string; cambios: CambiosItem }
  | { tipo: 'borrar_item'; id: string }
  | { tipo: 'completar_lista'; id: string; total: number; transaction_id: string | null };

export const encolarOperacion = (
  cola: OperacionLista[],
  operacion: OperacionLista
): OperacionLista[] => {
  if (operacion.tipo === 'actualizar_item') {
    const creacion = cola.find(op => op.tipo === 'crear_item' && op.id === operacion.id);
    if (creacion && creacion.tipo === 'crear_item') {
      return cola.map(op =>
        op === creacion ? { ...creacion, datos: { ...creacion.datos, ...operacion.cambios } } : op
      );
    }

    const previa = cola.find(op => op.tipo === 'actualizar_item' && op.id === operacion.id);
    if (previa && previa.tipo === 'actualizar_item') {
      return cola.map(op =>
        op === previa ? { ...previa, cambios: { ...previa.cambios, ...operacion.cambios } } : op
      );
    }

    return [...cola, operacion];
  }

  if (operacion.tipo === 'borrar_item') {
    const seCreoSinSenal = cola.some(op => op.tipo === 'crear_item' && op.id === operacion.id);
    const sinEseItem = cola.filter(
      op => !((op.tipo === 'crear_item' || op.tipo === 'actualizar_item') && op.id === operacion.id)
    );
    // Si nunca llego al servidor, no hay nada que borrar alla.
    return seCreoSinSenal ? sinEseItem : [...sinEseItem, operacion];
  }

  return [...cola, operacion];
};

/** Las listas que se terminaron sin señal se muestran ya terminadas. */
export const aplicarColaAListas = <T extends { id: string; estado: string; total: number | null }>(
  listas: T[],
  cola: OperacionLista[]
): T[] =>
  listas.map(lista => {
    const cierre = cola.find(op => op.tipo === 'completar_lista' && op.id === lista.id);
    return cierre && cierre.tipo === 'completar_lista'
      ? { ...lista, estado: 'completada', total: cierre.total }
      : lista;
  });

/** Aplica la cola sobre los ítems que llegaron del servidor o del snapshot. */
export const aplicarCola = (items: ShoppingItem[], cola: OperacionLista[]): ShoppingItem[] => {
  let resultado = [...items];
  cola.forEach(op => {
    if (op.tipo === 'crear_item') {
      if (!resultado.some(item => item.id === op.id)) resultado.push({ id: op.id, ...op.datos });
    } else if (op.tipo === 'actualizar_item') {
      resultado = resultado.map(item => (item.id === op.id ? { ...item, ...op.cambios } : item));
    } else if (op.tipo === 'borrar_item') {
      resultado = resultado.filter(item => item.id !== op.id);
    }
  });
  return resultado;
};
