import React from 'react';
import { CalendarRange } from 'lucide-react';
import type { PeriodPreset } from '../types';

interface PeriodSelectorProps {
  value: PeriodPreset;
  onChange: (period: PeriodPreset) => void;
  rango: { desde: Date | null; hasta: Date | null };
}

/**
 * Antes la app abria mostrando el historico completo. La pregunta que uno
 * realmente se hace es "como voy este mes", asi que el periodo por defecto es
 * el mes actual y esto lo hace explicito.
 */
const OPTIONS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'mes-actual', label: 'Este mes' },
  { id: 'mes-anterior', label: 'Mes pasado' },
  { id: 'ultimos-3-meses', label: 'Ultimos 3 meses' },
  { id: 'ano-actual', label: 'Este ano' },
  { id: 'todo', label: 'Todo' },
  { id: 'custom', label: 'Personalizado' },
];

const formatoLargo = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ value, onChange, rango }) => {
  const descripcion =
    rango.desde && rango.hasta
      ? `${formatoLargo.format(rango.desde)} — ${formatoLargo.format(rango.hasta)}`
      : 'Todo el historico';

  return (
    <div className="period-selector">
      <div className="period-selector__header">
        <CalendarRange size={17} />
        <span className="period-selector__range">{descripcion}</span>
      </div>

      <div className="period-selector__options" role="tablist" aria-label="Periodo">
        {OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={value === option.id}
            className={`badge-btn ${value === option.id ? 'active' : ''}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PeriodSelector;
