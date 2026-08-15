import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
  isPositive?: boolean;
}

/**
 * El icono va en la misma fila que el titulo, no al lado del numero.
 *
 * Antes ocupaba una columna propia a la derecha, asi que en el celular —con dos
 * tarjetas por fila— al importe le quedaban unos 90px y un monto en millones
 * salia recortado como "$ 5....". Con el icono arriba, el numero dispone del
 * ancho completo de la tarjeta.
 */
const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'var(--accent-primary)',
  isPositive,
}) => (
  <div className="card kpi-card">
    <div className="kpi-card__head">
      <span className="kpi-card__title">{title}</span>
      <span
        className="kpi-card__icon"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <Icon size={16} />
      </span>
    </div>

    <strong className="kpi-card__value" title={value}>
      {value}
    </strong>

    {subtitle && (
      <span
        className="kpi-card__subtitle"
        style={{
          color:
            isPositive === undefined
              ? 'var(--text-secondary)'
              : isPositive
                ? 'var(--success)'
                : 'var(--danger)',
        }}
      >
        {subtitle}
      </span>
    )}
  </div>
);

export default KpiCard;
