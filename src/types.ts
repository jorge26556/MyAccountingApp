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
  canal: string;
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
  canales: string[];
  estadoPago: string;
  activeSearch: string;
}

export interface CategoryTotal {
  nombre: string;
  monto: number;
}

export interface GoalProgress {
  goal: SavingsGoal;
  ahorro: number;
  porcentaje: number;
  completada: boolean;
  faltante: number;
}

export interface KpiData {
  /** Solo transacciones en estado "Pagado": es la plata que realmente se movio. */
  totalIngresos: number;
  totalGastos: number;
  beneficioNeto: number;

  /** Comprometido pero aun no ejecutado. Antes se mezclaba con lo pagado. */
  ingresosPendientes: number;
  gastosPendientes: number;

  numOperaciones: number;
  ticketMedioGasto: number;
  gastoPromedioDiario: number;
  mayorGastoIndividual: number;

  categoriaMasGasto: CategoryTotal;
  categoriaMasRentable: CategoryTotal;

  /** Comparacion contra el periodo anterior equivalente. */
  ahorroPeriodoAnterior: number;
  variacionAhorro: number;
  tieneComparativo: boolean;

  metas: GoalProgress[];
}
