import type { Transaction, TransactionType } from '../types';
import { esTransferencia } from './accounts';
import { addMonths, today } from './dates';

/**
 * Registrar mas rapido a partir de lo que ya registraste.
 *
 * El formulario pide seis campos y el grueso de los movimientos de cualquiera
 * son los mismos cuatro o cinco repetidos: el almuerzo, la gasolina, el
 * mercado. Estas funciones sacan ese patron del historial —sin tabla nueva ni
 * configuracion— para que el caso comun sean dos toques.
 *
 * Todo se calcula sobre una ventana reciente: lo que pagabas hace dos anos no
 * deberia mandar sobre lo que pagas este mes.
 */

const MESES_DE_VENTANA = 6;

/** "  Almuerzo   del  trabajo " → "almuerzo del trabajo" */
export const normalizarTexto = (valor: string): string =>
  valor.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Los movimientos recientes, del mas nuevo al mas viejo.
 *
 * El orden importa y no es cosmetico: al agrupar, el PRIMERO de cada grupo es
 * el que manda (su importe, su cuenta, como escribio el texto). `fecha` es una
 * columna de solo dia, asi que todo lo registrado hoy empata; ordenar aqui y
 * quedarse con el primero hace el resultado determinista en vez de depender de
 * en que orden vinieran las filas.
 */
const enVentana = (transactions: Transaction[], hoy: Date): Transaction[] => {
  const desde = addMonths(hoy, -MESES_DE_VENTANA);
  return transactions
    .filter(item => !esTransferencia(item) && item.fecha >= desde)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
};

export interface Plantilla {
  key: string;
  tipo: TransactionType;
  categoria: string;
  descripcion: string;
  /** El importe de la vez mas reciente, no un promedio. */
  importe: number;
  account_id: string | null;
  veces: number;
  ultimaVez: Date;
}

/**
 * Los movimientos que repites, listos para registrar de un toque.
 *
 * Se agrupan por tipo + categoria + descripcion, NO por importe: el almuerzo
 * de $18.000 y el de $20.000 son la misma costumbre. El importe que se propone
 * es el de la ultima vez, que es la mejor conjetura, y de todos modos es
 * editable antes de guardar.
 *
 * Exige al menos dos ocurrencias: un movimiento unico no es una costumbre, y
 * llenar la pantalla de "plantillas" de un solo uso las volveria inservibles.
 */
export const plantillasFrecuentes = (
  transactions: Transaction[],
  limite = 6,
  hoy: Date = today()
): Plantilla[] => {
  const grupos = new Map<string, Plantilla>();

  enVentana(transactions, hoy).forEach(item => {
    const descripcion = item.descripcion.trim();
    // Sin descripcion la plantilla seria "Mercado $320.000" sin mas contexto:
    // util a medias y facil de confundir con otra del mismo rubro.
    if (!descripcion) return;

    const key = `${item.tipo}|${normalizarTexto(item.categoria)}|${normalizarTexto(descripcion)}`;
    const previo = grupos.get(key);

    if (!previo) {
      grupos.set(key, {
        key,
        tipo: item.tipo,
        categoria: item.categoria,
        descripcion,
        importe: Math.abs(item.importe),
        account_id: item.account_id,
        veces: 1,
        ultimaVez: item.fecha,
      });
      return;
    }

    // Solo cuenta la repeticion: la lista viene ordenada de mas nuevo a mas
    // viejo, asi que los datos que ya tiene el grupo son los de la ultima vez.
    // Con `>=` cualquier movimiento del mismo dia pisaba al anterior y acababa
    // ganando el MAS VIEJO del monton.
    previo.veces += 1;
  });

  return Array.from(grupos.values())
    .filter(plantilla => plantilla.veces >= 2)
    .sort(
      (a, b) => b.veces - a.veces || b.ultimaVez.getTime() - a.ultimaVez.getTime()
    )
    .slice(0, limite);
};

/**
 * Las categorias ordenadas por uso real, para que las de siempre queden
 * primero y no haya que buscarlas en una lista alfabetica de veinte.
 *
 * Las que no has usado no se esconden: van despues, en orden alfabetico. Una
 * categoria recien creada tiene que poder encontrarse.
 */
export const categoriasPorUso = (
  transactions: Transaction[],
  categorias: string[],
  tipo?: TransactionType,
  hoy: Date = today()
): string[] => {
  const usos = new Map<string, number>();

  enVentana(transactions, hoy)
    .filter(item => !tipo || item.tipo === tipo)
    .forEach(item => {
      const clave = normalizarTexto(item.categoria);
      usos.set(clave, (usos.get(clave) ?? 0) + 1);
    });

  return [...categorias].sort((a, b) => {
    const usoA = usos.get(normalizarTexto(a)) ?? 0;
    const usoB = usos.get(normalizarTexto(b)) ?? 0;
    if (usoA !== usoB) return usoB - usoA;
    return a.localeCompare(b);
  });
};

export interface SugerenciaDescripcion {
  categoria: string;
  importe: number;
  account_id: string | null;
  tipo: TransactionType;
}

/**
 * Lo que usaste la ultima vez que escribiste esta misma descripcion.
 *
 * Es coincidencia exacta (normalizada), no parecido: adivinar por similitud
 * acabaria clasificando "Mercado" como "Mercadopago" y corregir una categoria
 * mal puesta cuesta mas que elegirla bien de entrada.
 */
export const sugerirDesdeDescripcion = (
  transactions: Transaction[],
  texto: string,
  hoy: Date = today()
): SugerenciaDescripcion | null => {
  const buscada = normalizarTexto(texto);
  if (!buscada) return null;

  // La lista ya viene de mas nueva a mas vieja: la primera que coincida es la
  // ultima vez que lo registraste.
  const encontrada = enVentana(transactions, hoy).find(
    item => normalizarTexto(item.descripcion) === buscada
  );

  if (!encontrada) return null;
  return {
    categoria: encontrada.categoria,
    importe: Math.abs(encontrada.importe),
    account_id: encontrada.account_id,
    tipo: encontrada.tipo,
  };
};

/** Descripciones ya usadas, para el autocompletado del campo. */
export const descripcionesFrecuentes = (
  transactions: Transaction[],
  limite = 40,
  hoy: Date = today()
): string[] => {
  const conteo = new Map<string, { texto: string; veces: number; ultimaVez: Date }>();

  enVentana(transactions, hoy).forEach(item => {
    const descripcion = item.descripcion.trim();
    if (!descripcion) return;

    const clave = normalizarTexto(descripcion);
    const previo = conteo.get(clave);

    if (!previo) {
      conteo.set(clave, { texto: descripcion, veces: 1, ultimaVez: item.fecha });
      return;
    }

    // Igual que en las plantillas: el primero del grupo ya es el mas reciente.
    previo.veces += 1;
  });

  return Array.from(conteo.values())
    .sort((a, b) => b.veces - a.veces || b.ultimaVez.getTime() - a.ultimaVez.getTime())
    .slice(0, limite)
    .map(item => item.texto);
};
