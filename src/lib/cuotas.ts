/**
 * Compras diferidas a cuotas.
 *
 * Sin esto hay que elegir entre dos formas de mentir: registrar el golpe
 * completo —y el mes de la compra sale disparado aunque solo hayas pagado la
 * primera cuota— o llevarlo a mano mes a mes y olvidarlo a la tercera.
 *
 * El plan se materializa como N movimientos Pendiente con fecha futura, asi
 * que las cuotas aparecen solas en la agenda de proximos pagos y en el
 * comprometido del mes que toca, sin logica aparte.
 */

export const MIN_CUOTAS = 2;
export const MAX_CUOTAS = 60;

export interface Cuota {
  numero: number;
  total: number;
  fecha: Date;
  importe: number;
}

/**
 * La misma fecha N meses despues, ajustando al ultimo dia si ese numero no
 * existe en el mes destino.
 *
 * Se cuenta SIEMPRE desde la fecha original, nunca desde la cuota anterior: si
 * se encadenara, una compra del 31 de enero caeria el 28 de febrero y de ahi en
 * adelante quedaria clavada en el 28 de todos los meses.
 */
const mesesDespues = (base: Date, meses: number): Date => {
  const year = base.getFullYear();
  const month = base.getMonth() + meses;
  const ultimoDia = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(base.getDate(), ultimoDia));
};

/**
 * Reparte el total en cuotas iguales y le carga el sobrante a la ultima.
 *
 * Dividir 1.000.000 en 3 da 333.333,33; redondear cada cuota a 333.333 deja
 * 999.999 y se pierde un peso. Con el ajuste en la ultima cuota la suma del
 * plan es SIEMPRE exactamente el total: una compra a cuotas que no cuadra con
 * el extracto del banco no sirve para nada.
 */
export const planDeCuotas = (input: {
  total: number;
  cuotas: number;
  primeraFecha: Date;
}): Cuota[] => {
  const { total, cuotas, primeraFecha } = input;

  if (!(total > 0)) throw new Error('El total debe ser mayor que cero');
  if (!Number.isInteger(cuotas) || cuotas < MIN_CUOTAS || cuotas > MAX_CUOTAS) {
    throw new Error(`El número de cuotas debe estar entre ${MIN_CUOTAS} y ${MAX_CUOTAS}`);
  }

  const base = Math.floor(total / cuotas);
  const sobrante = total - base * cuotas;

  return Array.from({ length: cuotas }, (_, index) => ({
    numero: index + 1,
    total: cuotas,
    fecha: mesesDespues(primeraFecha, index),
    importe: index === cuotas - 1 ? base + sobrante : base,
  }));
};

/** "Nevera (3/12)" — para que la cuota se identifique sola en cualquier lista. */
export const etiquetaCuota = (descripcion: string, numero: number, total: number): string => {
  const limpia = descripcion.trim();
  return limpia ? `${limpia} (${numero}/${total})` : `Cuota ${numero}/${total}`;
};
