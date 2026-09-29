import { supabase } from '../lib/supabase';
import { esFalloDeRed, esIdLocal, estaEnLinea, nuevoIdLocal } from '../lib/offline';
import {
  aplicarCola,
  aplicarColaAListas,
  encolarOperacion,
  type CambiosItem,
  type DatosItem,
  type OperacionLista,
} from '../lib/listas';
import type { EstadoLista, ShoppingItem, ShoppingList } from '../types';

/**
 * Listas de compras. Depende de `supabase/009_listas.sql`.
 *
 * Mientras la migracion no se ejecute, `fetchListas` devuelve "no disponible" y
 * la pestaña queda oculta, igual que deudas, presupuestos y cuentas.
 *
 * SIN SEÑAL
 * Lo que se hace dentro del supermercado —agregar, tachar, borrar un ítem y
 * terminar la compra— se guarda en una cola si no hay red y se sube despues.
 * Crear o borrar una lista entera si pide conexion: se hace en la casa.
 *
 * La cola y la copia de las listas van en localStorage y no en IndexedDB como
 * los movimientos: son unos pocos kilobytes, y localStorage es sincrono, asi
 * que tachar un ítem no espera a nada.
 */

const esTablaInexistente = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  Boolean(error?.message?.includes('does not exist'));

export const MENSAJE_MIGRACION_LISTAS =
  'Las listas necesitan la migración 009. Ejecuta supabase/009_listas.sql en el SQL Editor de Supabase.';

const MENSAJE_SIN_SENAL = 'Necesitas conexión para esto. Tachar y agregar ítems sí funciona sin señal.';

const requireUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  return session.user.id;
};

const mapLista = (row: Record<string, unknown>): ShoppingList => ({
  id: row.id as string,
  nombre: row.nombre as string,
  categoria: row.categoria as string,
  estado: row.estado as EstadoLista,
  transaction_id: (row.transaction_id as string) ?? null,
  total: row.total === null || row.total === undefined ? null : Number(row.total),
  completada_en: row.completada_en ? new Date(row.completada_en as string) : null,
  created_at: new Date(row.created_at as string),
});

const mapItem = (row: Record<string, unknown>): ShoppingItem => ({
  id: row.id as string,
  list_id: row.list_id as string,
  nombre: row.nombre as string,
  cantidad: (row.cantidad as string) ?? '',
  precio: row.precio === null || row.precio === undefined ? null : Number(row.precio),
  comprado: Boolean(row.comprado),
  orden: Number(row.orden ?? 0),
});

/* ─────────────────────────── almacenamiento local ────────────────────────── */

const claveCola = (userId: string) => `listas-cola:${userId}`;
const claveCopia = (userId: string) => `listas-copia:${userId}`;

/** localStorage puede no existir o lanzar (modo privado, cuota llena). */
const leerJson = <T>(clave: string): T | null => {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
};

const escribirJson = (clave: string, valor: unknown): boolean => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
};

const leerColaLocal = (userId: string): OperacionLista[] =>
  leerJson<OperacionLista[]>(claveCola(userId)) ?? [];

const guardarColaLocal = (userId: string, cola: OperacionLista[]): boolean => {
  if (cola.length === 0) {
    try {
      localStorage.removeItem(claveCola(userId));
    } catch {
      /* nada que hacer */
    }
    return true;
  }
  return escribirJson(claveCola(userId), cola);
};

const encolar = (userId: string, operacion: OperacionLista): void => {
  const guardada = guardarColaLocal(userId, encolarOperacion(leerColaLocal(userId), operacion));
  if (!guardada) {
    throw new Error('Sin conexión, y este navegador no permite guardar borradores.');
  }
};

export const cambiosListasPendientes = async (): Promise<number> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ? leerColaLocal(session.user.id).length : 0;
};

interface CopiaGuardada {
  listas: Array<Omit<ShoppingList, 'completada_en' | 'created_at'> & {
    completada_en: string | null;
    created_at: string;
  }>;
  items: ShoppingItem[];
}

const guardarCopia = (userId: string, listas: ShoppingList[], items: ShoppingItem[]) => {
  escribirJson(claveCopia(userId), {
    listas: listas.map(lista => ({
      ...lista,
      completada_en: lista.completada_en?.toISOString() ?? null,
      created_at: lista.created_at.toISOString(),
    })),
    items,
  } satisfies CopiaGuardada);
};

/** Al cerrar sesion. La cola NO se borra: son cambios que solo existen aqui. */
export const borrarCopiaListas = (): void => {
  try {
    Object.keys(localStorage)
      .filter(clave => clave.startsWith('listas-copia:'))
      .forEach(clave => localStorage.removeItem(clave));
  } catch {
    /* nada que hacer */
  }
};

/* ───────────────────────────────── lectura ───────────────────────────────── */

export interface ResultadoListas {
  disponible: boolean;
  listas: ShoppingList[];
  items: ShoppingItem[];
  /** true = no hubo red y se muestra la ultima copia guardada. */
  desdeCopia: boolean;
}

/**
 * Listas e ítems, con lo pendiente de la cola ya aplicado encima: lo que se
 * tacho sin señal tiene que seguir tachado aunque todavia no se haya subido.
 */
export const fetchListas = async (): Promise<ResultadoListas> => {
  const userId = await requireUserId();
  const cola = leerColaLocal(userId);

  const desdeCopia = (): ResultadoListas | null => {
    const copia = leerJson<CopiaGuardada>(claveCopia(userId));
    if (!copia) return null;
    const listas = copia.listas.map(lista => ({
      ...lista,
      completada_en: lista.completada_en ? new Date(lista.completada_en) : null,
      created_at: new Date(lista.created_at),
    }));
    return {
      disponible: true,
      listas: aplicarColaAListas(listas, cola),
      items: aplicarCola(copia.items, cola),
      desdeCopia: true,
    };
  };

  try {
    const [listasRes, itemsRes] = await Promise.all([
      supabase
        .from('shopping_lists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('shopping_items')
        .select('*')
        .eq('user_id', userId)
        .order('orden', { ascending: true }),
    ]);

    const error = listasRes.error ?? itemsRes.error;
    if (error) {
      if (esTablaInexistente(error)) {
        return { disponible: false, listas: [], items: [], desdeCopia: false };
      }
      if (esFalloDeRed(error)) {
        const copia = desdeCopia();
        if (copia) return copia;
      }
      console.error('Error fetching listas:', error);
      throw new Error('No se pudieron cargar las listas');
    }

    const listas = (listasRes.data ?? []).map(mapLista);
    const items = (itemsRes.data ?? []).map(mapItem);
    guardarCopia(userId, listas, items);

    return {
      disponible: true,
      listas: aplicarColaAListas(listas, cola),
      items: aplicarCola(items, cola),
      desdeCopia: false,
    };
  } catch (err) {
    if (esFalloDeRed(err)) {
      const copia = desdeCopia();
      if (copia) return copia;
    }
    throw err;
  }
};

/* ───────────────────────────────── listas ────────────────────────────────── */

export interface NuevaLista {
  nombre: string;
  categoria: string;
  /** Para "Repetir lista" y para pasar lo que no se compro a una nueva. */
  items?: Array<Pick<ShoppingItem, 'nombre' | 'cantidad' | 'precio'>>;
}

export const crearLista = async (
  input: NuevaLista
): Promise<{ lista: ShoppingList; items: ShoppingItem[] }> => {
  const userId = await requireUserId();
  if (!estaEnLinea()) throw new Error(MENSAJE_SIN_SENAL);

  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Ponle un nombre a la lista');
  if (!input.categoria.trim()) throw new Error('Elige una categoría');

  const { data, error } = await supabase
    .from('shopping_lists')
    .insert({ user_id: userId, nombre, categoria: input.categoria.trim() })
    .select()
    .single();

  if (error) {
    if (esTablaInexistente(error)) throw new Error(MENSAJE_MIGRACION_LISTAS);
    if (esFalloDeRed(error)) throw new Error(MENSAJE_SIN_SENAL);
    console.error('Error creando lista:', error);
    throw new Error('No se pudo crear la lista');
  }

  const lista = mapLista(data);
  const iniciales = input.items ?? [];
  if (iniciales.length === 0) return { lista, items: [] };

  const { data: filas, error: errorItems } = await supabase
    .from('shopping_items')
    .insert(
      iniciales.map((item, indice) => ({
        user_id: userId,
        list_id: lista.id,
        nombre: item.nombre.trim(),
        cantidad: item.cantidad.trim(),
        precio: item.precio,
        orden: indice,
      }))
    )
    .select();

  if (errorItems) {
    // La lista ya existe: mejor vacia que perderla. Se avisa para que se note.
    console.error('Error copiando ítems:', errorItems);
    throw new Error('La lista se creó, pero no se pudieron copiar sus ítems');
  }

  return { lista, items: (filas ?? []).map(mapItem) };
};

export const actualizarLista = async (
  id: string,
  cambios: Partial<Pick<ShoppingList, 'nombre' | 'categoria'>>
): Promise<ShoppingList> => {
  const userId = await requireUserId();
  if (!estaEnLinea()) throw new Error(MENSAJE_SIN_SENAL);

  const payload: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim();
    if (!nombre) throw new Error('Ponle un nombre a la lista');
    payload.nombre = nombre;
  }
  if (cambios.categoria !== undefined) payload.categoria = cambios.categoria.trim();

  const { data, error } = await supabase
    .from('shopping_lists')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error actualizando lista:', error);
    throw new Error(esFalloDeRed(error) ? MENSAJE_SIN_SENAL : 'No se pudo actualizar la lista');
  }
  return mapLista(data);
};

/**
 * Borra la lista y sus ítems (cascade), pero NO el gasto que se registro al
 * terminarla: ese gasto paso de verdad.
 */
export const borrarLista = async (id: string): Promise<void> => {
  const userId = await requireUserId();
  if (!estaEnLinea()) throw new Error(MENSAJE_SIN_SENAL);

  const { error } = await supabase
    .from('shopping_lists')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error borrando lista:', error);
    throw new Error(esFalloDeRed(error) ? MENSAJE_SIN_SENAL : 'No se pudo borrar la lista');
  }

  // Lo pendiente de esa lista ya no tiene donde aplicarse.
  guardarColaLocal(
    userId,
    leerColaLocal(userId).filter(op =>
      op.tipo === 'crear_item' ? op.datos.list_id !== id : !(op.tipo === 'completar_lista' && op.id === id)
    )
  );
};

/**
 * Marca la lista como comprada. El gasto se crea antes, desde App, con el
 * mismo `createTransaction` de siempre —que ya sabe encolarse sin señal—.
 *
 * `transaction_id` llega null si ese gasto quedo en cola: su id definitivo no
 * se conoce todavia. La lista queda cerrada igual; solo pierde el enlace.
 */
export const completarLista = async (
  id: string,
  total: number,
  transactionId: string | null
): Promise<{ encolada: boolean }> => {
  const userId = await requireUserId();
  if (!(total > 0)) throw new Error('El valor final debe ser mayor que cero');

  const operacion: OperacionLista = {
    tipo: 'completar_lista',
    id,
    total,
    transaction_id: transactionId && !esIdLocal(transactionId) ? transactionId : null,
  };

  if (!estaEnLinea()) {
    encolar(userId, operacion);
    return { encolada: true };
  }

  try {
    await aplicarEnServidor(userId, operacion);
    return { encolada: false };
  } catch (err) {
    if (esFalloDeRed(err)) {
      encolar(userId, operacion);
      return { encolada: true };
    }
    throw err;
  }
};

/* ────────────────────────────────── ítems ────────────────────────────────── */

/**
 * Las tres operaciones de ítems siguen el mismo patron: se intenta contra el
 * servidor y, si no hay red —o el ítem aun no existe alla porque se creo sin
 * señal—, se encola. El que llama recibe siempre el ítem como debe verse.
 */

export const crearItem = async (datos: DatosItem): Promise<ShoppingItem> => {
  const userId = await requireUserId();
  const limpio: DatosItem = {
    ...datos,
    nombre: datos.nombre.trim(),
    cantidad: datos.cantidad.trim(),
  };
  if (!limpio.nombre) throw new Error('Escribe qué hay que comprar');

  const sinSenal = (): ShoppingItem => {
    const id = nuevoIdLocal();
    encolar(userId, { tipo: 'crear_item', id, datos: limpio });
    return { id, ...limpio };
  };

  if (!estaEnLinea()) return sinSenal();

  try {
    const { data, error } = await supabase
      .from('shopping_items')
      .insert({ user_id: userId, ...limpio })
      .select()
      .single();

    if (error) {
      if (esFalloDeRed(error)) return sinSenal();
      if (esTablaInexistente(error)) throw new Error(MENSAJE_MIGRACION_LISTAS);
      console.error('Error creando ítem:', error);
      throw new Error('No se pudo agregar');
    }
    return mapItem(data);
  } catch (err) {
    if (esFalloDeRed(err)) return sinSenal();
    throw err;
  }
};

export const actualizarItem = async (id: string, cambios: CambiosItem): Promise<void> => {
  const userId = await requireUserId();
  const operacion: OperacionLista = { tipo: 'actualizar_item', id, cambios };

  // Un ítem creado sin señal todavia no existe en el servidor: el cambio se
  // funde en su creacion pendiente.
  if (esIdLocal(id) || !estaEnLinea()) {
    encolar(userId, operacion);
    return;
  }

  try {
    await aplicarEnServidor(userId, operacion);
  } catch (err) {
    if (esFalloDeRed(err)) {
      encolar(userId, operacion);
      return;
    }
    throw err;
  }
};

export const borrarItem = async (id: string): Promise<void> => {
  const userId = await requireUserId();
  const operacion: OperacionLista = { tipo: 'borrar_item', id };

  if (esIdLocal(id) || !estaEnLinea()) {
    encolar(userId, operacion);
    return;
  }

  try {
    await aplicarEnServidor(userId, operacion);
  } catch (err) {
    if (esFalloDeRed(err)) {
      encolar(userId, operacion);
      return;
    }
    throw err;
  }
};

/* ────────────────────────────── sincronizacion ───────────────────────────── */

/** Lanza el error de Supabase tal cual para que quien llama decida si es de red. */
const aplicarEnServidor = async (userId: string, op: OperacionLista): Promise<void> => {
  const lanzar = (error: { message?: string } | null) => {
    if (!error) return;
    if (esFalloDeRed(error)) throw error;
    console.error('Error aplicando cambio de lista:', error);
    throw new Error('No se pudo guardar el cambio en la lista');
  };

  if (op.tipo === 'crear_item') {
    const { error } = await supabase.from('shopping_items').insert({ user_id: userId, ...op.datos });
    lanzar(error);
  } else if (op.tipo === 'actualizar_item') {
    const { error } = await supabase
      .from('shopping_items')
      .update(op.cambios)
      .eq('id', op.id)
      .eq('user_id', userId);
    lanzar(error);
  } else if (op.tipo === 'borrar_item') {
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('id', op.id)
      .eq('user_id', userId);
    lanzar(error);
  } else {
    const { error } = await supabase
      .from('shopping_lists')
      .update({
        estado: 'completada',
        total: op.total,
        transaction_id: op.transaction_id,
        completada_en: new Date().toISOString(),
      })
      .eq('id', op.id)
      .eq('user_id', userId);
    lanzar(error);
  }
};

/**
 * Sube la cola en orden. Igual que con los movimientos: si se corta la red a
 * mitad de camino, lo subido queda subido y lo demas espera; si el servidor
 * rechaza una operacion por su contenido, se descarta para no reintentarla
 * para siempre.
 */
export const sincronizarListas = async (): Promise<{ subidas: number; descartadas: number }> => {
  const userId = await requireUserId();
  let cola = leerColaLocal(userId);
  let subidas = 0;
  let descartadas = 0;

  while (cola.length > 0) {
    const [siguiente, ...resto] = cola;
    try {
      await aplicarEnServidor(userId, siguiente);
      subidas += 1;
    } catch (err) {
      if (esFalloDeRed(err)) break;
      descartadas += 1;
    }
    cola = resto;
    guardarColaLocal(userId, cola);
  }

  return { subidas, descartadas };
};
