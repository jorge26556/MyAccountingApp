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

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'var(--accent-primary)',
  isPositive,
}) => (
  <div className="card kpi-card">
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1rem',
        gap: '0.75rem',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          {title}
        </div>
        <h3
          style={{
            fontSize: '1.65rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontVariantNumeric: 'tabular-nums',
          }}
          title={value}
        >
          {value}
        </h3>
      </div>
      <div
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
          padding: '0.75rem',
          borderRadius: '10px',
          color,
          flexShrink: 0,
        }}
      >
        <Icon size={22} />
      </div>
    </div>

    {subtitle && (
      <span
        style={{
          fontSize: '0.85rem',
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
