import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Filter, RotateCcw, Search } from 'lucide-react';
import type { DashboardFilters } from '../types';
import { toDateString, parseLocalDate } from '../lib/dates';
import { EMPTY_FILTERS } from '../lib/filters';

interface FiltersBarProps {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  availableCategorias: string[];
  availableCanales: string[];
  resultCount: number;
}

const FiltersBar: React.FC<FiltersBarProps> = ({
  filters,
  setFilters,
  availableCategorias,
  availableCanales,
  resultCount,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (key: 'dateFrom' | 'dateTo', value: string) => {
    setFilters(prev => ({
      ...prev,
      // Elegir una fecha manualmente implica periodo personalizado.
      period: 'custom',
      [key]: value ? parseLocalDate(value) : null,
    }));
  };

  const handleMultiSelect = (name: 'categorias' | 'canales', value: string) => {
    setFilters(prev => {
      const current = prev[name];
      return current.includes(value)
        ? { ...prev, [name]: current.filter(item => item !== value) }
        : { ...prev, [name]: [...current, value] };
    });
  };

  const handleClearFilters = () => setFilters(EMPTY_FILTERS);

  const activeCount =
    (filters.tipo !== 'Todos' ? 1 : 0) +
    (filters.estadoPago !== 'Todos' ? 1 : 0) +
    filters.categorias.length +
    filters.canales.length +
    (filters.activeSearch ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0);

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: isMinimized ? 0 : '1.5rem',
          gap: '1rem',
        }}
      >
        <h3
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-secondary)',
            fontSize: '1rem',
          }}
        >
          <Filter size={18} />
          Filtros
          {activeCount > 0 && <span className="badge badge-pending">{activeCount}</span>}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>
            · {resultCount} {resultCount === 1 ? 'registro' : 'registros'}
          </span>
        </h3>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleClearFilters}
            className="ghost-icon-button"
            title="Restablecer filtros"
            disabled={activeCount === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
          >
            <RotateCcw size={16} />
            <span className="hide-mobile">Restablecer</span>
          </button>

          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="ghost-icon-button"
            aria-expanded={!isMinimized}
            title={isMinimized ? 'Mostrar filtros' : 'Ocultar filtros'}
          >
            {isMinimized ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
            }}
          >
            <div className="filter-group">
              <label style={labelStyle} htmlFor="filter-date-from">
                <Calendar size={14} /> Fecha desde
              </label>
              <input
                id="filter-date-from"
                type="date"
                className="input-style"
                /* Antes este input no era controlado: "Restablecer" limpiaba el
                   estado pero la fecha seguia visible en pantalla. */
                value={filters.dateFrom ? toDateString(filters.dateFrom) : ''}
                onChange={event => handleDateChange('dateFrom', event.target.value)}
              />
            </div>

            <div className="filter-group">
              <label style={labelStyle} htmlFor="filter-date-to">
                <Calendar size={14} /> Fecha hasta
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
              <label style={labelStyle} htmlFor="filter-tipo">
                <Filter size={14} /> Tipo
              </label>
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
              <label style={labelStyle} htmlFor="filter-estado">
                <Filter size={14} /> Estado
              </label>
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

            <div className="filter-group">
              <label style={labelStyle} htmlFor="filter-search">
                <Search size={14} /> Busqueda
              </label>
              <input
                id="filter-search"
                type="text"
                name="activeSearch"
                placeholder="Descripcion, categoria o ID..."
                className="input-style"
                value={filters.activeSearch}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
            <div className="filter-group">
              <label style={labelStyle}>Categorias</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {availableCategorias.length === 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Sin categorias todavia
                  </span>
                )}
                {availableCategorias.map(category => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={filters.categorias.includes(category)}
                    onClick={() => handleMultiSelect('categorias', category)}
                    className={`badge-btn ${filters.categorias.includes(category) ? 'active' : ''}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label style={labelStyle}>Canales</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {availableCanales.length === 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Sin canales todavia
                  </span>
                )}
                {availableCanales.map(channel => (
                  <button
                    key={channel}
                    type="button"
                    aria-pressed={filters.canales.includes(channel)}
                    onClick={() => handleMultiSelect('canales', channel)}
                    className={`badge-btn ${filters.canales.includes(channel) ? 'active' : ''}`}
                  >
                    {channel}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '0.5rem',
};

export default FiltersBar;
