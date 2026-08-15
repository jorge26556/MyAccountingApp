import type { DashboardFilters } from '../types';

/**
 * Estado inicial de los filtros. Vive fuera de <FiltersBar> para no romper el
 * fast refresh y porque App.tsx tambien lo usa como estado inicial.
 *
 * El periodo por defecto es el mes actual: abrir la app mostrando el historico
 * completo respondia una pregunta que casi nadie se hace.
 */
export const EMPTY_FILTERS: DashboardFilters = {
  period: 'mes-actual',
  dateFrom: null,
  dateTo: null,
  tipo: 'Todos',
  categorias: [],
  cuentas: [],
  estadoPago: 'Todos',
  activeSearch: '',
};
