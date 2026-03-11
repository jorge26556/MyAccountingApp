import React from 'react';
import type { DashboardFilters } from '../types';
import { Calendar, Filter, Search } from 'lucide-react';

interface FiltersBarProps {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  availableCategorias: string[];
  availableCanales: string[];
}

const FiltersBar: React.FC<FiltersBarProps> = ({ filters, setFilters, availableCategorias, availableCanales }) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiSelect = (name: 'categorias' | 'canales', value: string) => {
    setFilters(prev => {
      const current = prev[name];
      return current.includes(value)
        ? { ...prev, [name]: current.filter(item => item !== value) }
        : { ...prev, [name]: [...current, value] };
    });
  };

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="filter-group">
          <label style={labelStyle}>
            <Calendar size={14} /> Fecha desde
          </label>
          <input
            type="date"
            name="dateFrom"
            className="input-style"
            onChange={event => setFilters(prev => ({ ...prev, dateFrom: event.target.value ? new Date(event.target.value) : null }))}
          />
        </div>

        <div className="filter-group">
          <label style={labelStyle}>
            <Calendar size={14} /> Fecha hasta
          </label>
          <input
            type="date"
            name="dateTo"
            className="input-style"
            onChange={event => setFilters(prev => ({ ...prev, dateTo: event.target.value ? new Date(event.target.value) : null }))}
          />
        </div>

        <div className="filter-group">
          <label style={labelStyle}>
            <Filter size={14} /> Tipo
          </label>
          <select name="tipo" className="input-style" value={filters.tipo} onChange={handleChange}>
            <option value="Todos">Todos</option>
            <option value="Ingreso">Ingreso</option>
            <option value="Gasto">Gasto</option>
          </select>
        </div>

        <div className="filter-group">
          <label style={labelStyle}>
            <Filter size={14} /> Estado
          </label>
          <select name="estadoPago" className="input-style" value={filters.estadoPago} onChange={handleChange}>
            <option value="Todos">Todos</option>
            <option value="Pagado">Pagado</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>

        <div className="filter-group">
          <label style={labelStyle}>
            <Search size={14} /> Busqueda
          </label>
          <input
            type="text"
            name="activeSearch"
            placeholder="Descripcion o ID..."
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
            {availableCategorias.map(category => (
              <button
                key={category}
                type="button"
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
            {availableCanales.map(channel => (
              <button
                key={channel}
                type="button"
                onClick={() => handleMultiSelect('canales', channel)}
                className={`badge-btn ${filters.canales.includes(channel) ? 'active' : ''}`}
              >
                {channel}
              </button>
            ))}
          </div>
        </div>
      </div>
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
