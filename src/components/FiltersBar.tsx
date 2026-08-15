import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Account, DashboardFilters } from '../types';
import { toDateString, parseLocalDate } from '../lib/dates';
import { EMPTY_FILTERS } from '../lib/filters';

interface FiltersBarProps {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  availableCategorias: string[];
  accounts: Account[];
  resultCount: number;
}

/** Un filtro activo, con la forma de deshacerlo. */
interface ActiveChip {
  key: string;
  label: string;
  clear: (prev: DashboardFilters) => DashboardFilters;
}

const formatoCorto = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

const buildChips = (filters: DashboardFilters, accounts: Account[]): ActiveChip[] => {
  const chips: ActiveChip[] = [];
  const nombrePorId = new Map(accounts.map(cuenta => [cuenta.id, cuenta.nombre]));

  if (filters.tipo !== 'Todos') {
    chips.push({ key: 'tipo', label: filters.tipo, clear: prev => ({ ...prev, tipo: 'Todos' }) });
  }

  if (filters.estadoPago !== 'Todos') {
    chips.push({
      key: 'estado',
      label: filters.estadoPago,
      clear: prev => ({ ...prev, estadoPago: 'Todos' }),
    });
  }

  filters.categorias.forEach(categoria => {
    chips.push({
      key: `cat-${categoria}`,
      label: categoria,
      clear: prev => ({ ...prev, categorias: prev.categorias.filter(item => item !== categoria) }),
    });
  });

  filters.cuentas.forEach(cuenta => {
    chips.push({
      key: `cuenta-${cuenta}`,
      label: nombrePorId.get(cuenta) ?? 'Sin cuenta',
      clear: prev => ({ ...prev, cuentas: prev.cuentas.filter(item => item !== cuenta) }),
    });
  });

  if (filters.activeSearch.trim()) {
    chips.push({
      key: 'busqueda',
      label: `"${filters.activeSearch.trim()}"`,
      clear: prev => ({ ...prev, activeSearch: '' }),
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    const desde = filters.dateFrom ? formatoCorto.format(filters.dateFrom) : '…';
    const hasta = filters.dateTo ? formatoCorto.format(filters.dateTo) : '…';
    chips.push({
      key: 'fechas',
      label: `${desde} — ${hasta}`,
      clear: prev => ({ ...prev, dateFrom: null, dateTo: null, period: EMPTY_FILTERS.period }),
    });
  }

  return chips;
};

const FiltersBar: React.FC<FiltersBarProps> = ({
  filters,
  setFilters,
  availableCategorias,
  accounts,
  resultCount,
}) => {
  /**
   * Cerrado por defecto. Abierto ocupaba ~500px del alto de un celular con
   * controles que casi nunca se tocan, empujando todos los datos fuera de la
   * primera pantalla.
   */
  const [isOpen, setIsOpen] = useState(false);

  const chips = buildChips(filters, accounts);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (key: 'dateFrom' | 'dateTo', value: string) => {
    setFilters(prev => ({
      ...prev,
      // Elegir una fecha a mano implica periodo personalizado.
      period: 'custom',
      [key]: value ? parseLocalDate(value) : null,
    }));
  };

  const toggleMulti = (name: 'categorias' | 'cuentas', value: string) => {
    setFilters(prev => {
      const current = prev[name];
      return current.includes(value)
        ? { ...prev, [name]: current.filter(item => item !== value) }
        : { ...prev, [name]: [...current, value] };
    });
  };

  return (
    <div className="filters">
      <div className="filters__bar">
        <button
          type="button"
          className={`filters__toggle ${chips.length > 0 ? 'has-active' : ''}`}
          onClick={() => setIsOpen(value => !value)}
          aria-expanded={isOpen}
        >
          <SlidersHorizontal size={16} />
          <span>Filtros</span>
          {chips.length > 0 && <span className="filters__count">{chips.length}</span>}
          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        <span className="filters__result">
          {resultCount} {resultCount === 1 ? 'registro' : 'registros'}
        </span>

        {chips.length > 0 && (
          <button
            type="button"
            className="filters__clear"
            onClick={() => setFilters(prev => ({ ...EMPTY_FILTERS, period: prev.period }))}
          >
            <RotateCcw size={14} />
            <span className="hide-mobile">Limpiar</span>
          </button>
        )}
      </div>

      {/* Los filtros activos siguen visibles con el panel cerrado: si no, los
          numeros cambian y no hay nada en pantalla que explique por que. */}
      {chips.length > 0 && (
        <div className="filters__chips">
          {chips.map(chip => (
            <button
              key={chip.key}
              type="button"
              className="filters__chip"
              onClick={() => setFilters(chip.clear)}
              aria-label={`Quitar filtro ${chip.label}`}
            >
              {chip.label}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="card filters__panel">
          <div className="filters__fields">
            <div className="filter-group">
              <label htmlFor="filter-date-from">
                <Calendar size={14} /> Desde
              </label>
              <input
                id="filter-date-from"
                type="date"
                className="input-style"
                value={filters.dateFrom ? toDateString(filters.dateFrom) : ''}
                onChange={event => handleDateChange('dateFrom', event.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="filter-date-to">
                <Calendar size={14} /> Hasta
              </label>
              <input
                id="filter-date-to"
                type="date"
                className="input-style"
                value={filters.dateTo ? toDateString(filters.dateTo) : ''}
                onChange={event => handleDateChange('dateTo', event.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="filter-tipo">Tipo</label>
              <select
                id="filter-tipo"
                name="tipo"
                className="input-style"
                value={filters.tipo}
                onChange={handleChange}
              >
                <option value="Todos">Todos</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Gasto">Gasto</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="filter-estado">Estado</label>
              <select
                id="filter-estado"
                name="estadoPago"
                className="input-style"
                value={filters.estadoPago}
                onChange={handleChange}
              >
                <option value="Todos">Todos</option>
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>

            <div className="filter-group filters__search">
              <label htmlFor="filter-search">
                <Search size={14} /> Búsqueda
              </label>
              <input
                id="filter-search"
                type="text"
                name="activeSearch"
                placeholder="Descripción o categoría..."
                className="input-style"
                value={filters.activeSearch}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="filters__group">
            <span className="filters__group-label">Categorías</span>
            <div className="filters__options">
              {availableCategorias.length === 0 && <span className="filters__empty">Sin categorías</span>}
              {availableCategorias.map(categoria => (
                <button
                  key={categoria}
                  type="button"
                  aria-pressed={filters.categorias.includes(categoria)}
                  onClick={() => toggleMulti('categorias', categoria)}
                  className={`badge-btn ${filters.categorias.includes(categoria) ? 'active' : ''}`}
                >
                  {categoria}
                </button>
              ))}
            </div>
          </div>

          {/* Con una sola cuenta este filtro no puede quitar nada: seria un
              boton que no hace nada ocupando media pantalla de celular. */}
          {accounts.length > 1 && (
            <div className="filters__group">
              <span className="filters__group-label">Cuentas</span>
              <div className="filters__options">
                {accounts.map(cuenta => (
                  <button
                    key={cuenta.id}
                    type="button"
                    aria-pressed={filters.cuentas.includes(cuenta.id)}
                    onClick={() => toggleMulti('cuentas', cuenta.id)}
                    className={`badge-btn ${filters.cuentas.includes(cuenta.id) ? 'active' : ''}`}
                  >
                    {cuenta.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FiltersBar;
