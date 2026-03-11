export type TransactionType = "Ingreso" | "Gasto";
export type PaymentStatus = "Pagado" | "Pendiente";
export type AppView = "dashboard" | "settings";

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
  dateFrom: Date | null;
  dateTo: Date | null;
  tipo: string;
  categorias: string[];
  canales: string[];
  estadoPago: string;
  activeSearch: string;
}

export interface KpiData {
  totalIngresos: number;
  totalGastos: number;
  beneficioNeto: number;
  categoriaMasRentable: {
    nombre: string;
    beneficio: number;
  };
  numOperaciones: number;
  ticketMedioServicios: number;
}
