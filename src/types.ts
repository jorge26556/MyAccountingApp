export type TransactionType = 'Ingreso' | 'Gasto';
export type PaymentStatus = 'Pagado' | 'Pendiente';
export type AppView = 'dashboard' | 'transactions' | 'settings';

/** Presets del selector de periodo. `custom` usa dateFrom/dateTo. */
export type PeriodPreset =
  | 'mes-actual'
  | 'mes-anterior'
  | 'ultimos-3-meses'
  | 'ano-actual'
  | 'todo'
  | 'custom';

export type AccountType = 'Efectivo' | 'Banco' | 'Tarjeta' | 'Ahorro' | 'Otro';

/**
 * Una bolsa de dinero real: la cuenta del banco, Nequi, el efectivo del
 * bolsillo, la tarjeta de crédito.
 *
 * `saldoInicial` es lo que había ANTES del primer movimiento registrado en la
 * app. Sin ese dato el saldo calculado seria solo el neto de lo apuntado, que
 * no es la plata que tienes. Puede ser negativo: una tarjeta arranca en deuda.
 */
export interface Account {
  id: string;
  nombre: string;
  tipo: AccountType;
  saldoInicial: number;
  archivada: boolean;
  orden: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  amount: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  fecha: Date;
  tipo: TransactionType;
  categoria: string;
  importe: number;
  estado_pago: PaymentStatus;
  descripcion: string;
  /** Cuenta afectada. `null` solo si se borró la cuenta sin reasignar. */
  account_id: string | null;
  /**
   * Las dos patas de una transferencia comparten este id.
   *
   * Mover plata de Bancolombia a Nequi no es ni ingreso ni gasto: si se contara
   * como ambos, inflaria las dos cifras y ensuciaria todas las metricas. Los
   * saldos SI las cuentan, porque el dinero de verdad cambio de bolsillo.
   */
  transfer_group: string | null;
  /**
   * Las N cuotas de una misma compra diferida comparten este id.
   *
   * Cada cuota es un movimiento normal, asi que entra sola en la agenda y en el
   * comprometido del mes que le toca. Van las tres columnas o ninguna.
   */
  compra_id: string | null;
  cuota_numero: number | null;
  cuota_total: number | null;
}

export interface Category {
  id: string;
  name: string;
}

export interface DashboardFilters {
  period: PeriodPreset;
  dateFrom: Date | null;
  dateTo: Date | null;
  tipo: string;
  categorias: string[];
  cuentas: string[];
  estadoPago: string;
  activeSearch: string;
}

export interface GoalProgress {
  goal: SavingsGoal;
  ahorro: number;
  porcentaje: number;
  completada: boolean;
  faltante: number;
}

/**
 * Se podaron seis campos que estaban en el dashboard sin que ninguna decision
 * dependiera de ellos: numero de operaciones, ticket medio, mayor gasto
 * individual y las dos categorias top (que la grafica de barras ya muestra
 * mejor). Lo que queda es lo que se mira y se usa.
 */
export interface KpiData {
  /** Solo transacciones en estado "Pagado": es la plata que realmente se movio. */
  totalIngresos: number;
  totalGastos: number;
  beneficioNeto: number;

  /** Comprometido pero aun no ejecutado. Antes se mezclaba con lo pagado. */
  ingresosPendientes: number;
  gastosPendientes: number;

  /** Comparacion contra el periodo anterior equivalente. */
  ahorroPeriodoAnterior: number;
  variacionAhorro: number;
  tieneComparativo: boolean;

  metas: GoalProgress[];
}
