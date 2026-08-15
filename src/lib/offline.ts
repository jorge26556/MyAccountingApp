import type { Account, Category, SavingsGoal, Transaction } from '../types';
import type { Budget, RecurringTransaction } from '../services/extras';

/**
 * Funcionar sin senal.
 *
 * El momento en que uno registra un gasto es justo el peor para la conexion:
 * en la fila de la caja, en el parqueadero del centro comercial, con una raya
 * de cobertura. Hasta ahora ese movimiento simplemente se perdia con un error.
 *
 * Dos piezas:
 *   - una COLA de creaciones que no alcanzaron a salir, que se vacia sola al
 *     recuperar la conexion;
 *   - un SNAPSHOT de lo ultimo cargado, para que abrir la app sin datos
 *     muestre tus numeros en vez de una pantalla de error.
 *
 * Sobre guardar plata en el disco: el service worker tiene prohibido cachear
 * respuestas de Supabase, y con razon —CacheStorage sobrevive al cierre de
 * sesion y no lo controla la app—. Aqui el ciclo de vida SI es nuestro: el
 * snapshot se borra al cerrar sesion y todo va separado por usuario, asi que
 * una cuenta nunca ve los datos de otra.
 *
 * La cola es la excepcion deliberada: son movimientos que el usuario escribio
 * y que aun no existen en ningun lado. Borrarlos al cerrar sesion seria
 * perderle datos propios, que es peor que conservar un punado de filas.
 *
 * Todo falla en silencio y hacia lo seguro: si no hay IndexedDB (modo privado,
 * navegador viejo), la app se comporta exactamente como antes.
 */

const DB_NAME = 'mycontabilidad-offline';
const DB_VERSION = 1;
const COLA = 'cola';
const SNAPSHOT = 'snapshot';

/** Prefijo de los ids temporales: el servidor jamas emite uno asi. */
const PREFIJO_LOCAL = 'local-';

let contadorLocal = 0;

export const nuevoIdLocal = (): string => `${PREFIJO_LOCAL}${Date.now()}-${++contadorLocal}`;

export const esIdLocal = (id: string): boolean => id.startsWith(PREFIJO_LOCAL);

const soportado = (): boolean => typeof indexedDB !== 'undefined';

const abrir = (): Promise<IDBDatabase | null> =>
  new Promise(resolve => {
    if (!soportado()) return resolve(null);

    let solicitud: IDBOpenDBRequest;
    try {
      solicitud = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }

    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(COLA)) {
        db.createObjectStore(COLA, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT)) {
        db.createObjectStore(SNAPSHOT, { keyPath: 'userId' });
      }
    };

    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => resolve(null);
    solicitud.onblocked = () => resolve(null);
  });

const conStore = async <T>(
  store: string,
  modo: IDBTransactionMode,
  accion: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> => {
  const db = await abrir();
  if (!db) return null;

  return new Promise<T | null>(resolve => {
    try {
      const tx = db.transaction(store, modo);
      const solicitud = accion(tx.objectStore(store));
      solicitud.onsuccess = () => resolve(solicitud.result as T);
      solicitud.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
};

/* ─────────────────────────── cola de creaciones ──────────────────────────── */

export interface OperacionPendiente {
  id: number;
  userId: string;
  creadaEn: Date;
  /** El movimiento tal como lo escribio el usuario, listo para insertar. */
  payload: Omit<Transaction, 'id' | 'user_id'>;
}

export const encolarCreacion = async (
  userId: string,
  payload: Omit<Transaction, 'id' | 'user_id'>
): Promise<boolean> => {
  const resultado = await conStore<IDBValidKey>(COLA, 'readwrite', store =>
    store.add({ userId, creadaEn: new Date(), payload })
  );
  return resultado !== null;
};

export const leerCola = async (userId: string): Promise<OperacionPendiente[]> => {
  const todas = await conStore<OperacionPendiente[]>(COLA, 'readonly', store => store.getAll());
  if (!todas) return [];
  return todas
    .filter(item => item.userId === userId)
    .sort((a, b) => a.creadaEn.getTime() - b.creadaEn.getTime());
};

export const quitarDeCola = async (id: number): Promise<void> => {
  await conStore(COLA, 'readwrite', store => store.delete(id));
};

/* ──────────────────────────── snapshot de datos ──────────────────────────── */

export interface SnapshotDatos {
  userId: string;
  guardadoEn: Date;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  savingsGoals: SavingsGoal[];
  budgets: Budget[];
  recurrentes: RecurringTransaction[];
}

/**
 * IndexedDB usa clonado estructurado, asi que los `Date` viajan como `Date` y
 * no hay que serializarlos ni volver a parsearlos. Es justo el paso donde se
 * colaban los corrimientos de un dia.
 */
export const guardarSnapshot = async (
  datos: Omit<SnapshotDatos, 'guardadoEn'>
): Promise<void> => {
  await conStore(SNAPSHOT, 'readwrite', store =>
    store.put({ ...datos, guardadoEn: new Date() })
  );
};

export const leerSnapshot = async (userId: string): Promise<SnapshotDatos | null> => {
  const snapshot = await conStore<SnapshotDatos | undefined>(SNAPSHOT, 'readonly', store =>
    store.get(userId)
  );
  return snapshot ?? null;
};

/** Al cerrar sesion. La cola NO se toca: ver la nota de arriba. */
export const borrarSnapshots = async (): Promise<void> => {
  await conStore(SNAPSHOT, 'readwrite', store => store.clear());
};

/* ───────────────────────── deteccion de "sin red" ────────────────────────── */

const PATRON_RED = /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|timeout/i;

/**
 * Distingue "no hubo red" de "el servidor dijo que no".
 *
 * Importa mucho: encolar un error de validacion —un importe negativo, una
 * categoria que ya no existe— lo dejaria reintentando para siempre y el
 * usuario veria un contador de pendientes que nunca baja.
 */
export const esFalloDeRed = (error: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const mensaje =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';

  return PATRON_RED.test(mensaje);
};

export const estaEnLinea = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false;
