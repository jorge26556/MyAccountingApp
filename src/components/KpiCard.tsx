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

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon: Icon, color = 'var(--accent-primary)', isPositive }) => {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{title}</p>
          <h3 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>{value}</h3>
        </div>
        <div style={{ 
          backgroundColor: `${color}15`, 
          padding: '0.75rem', 
          borderRadius: '10px',
          color: color 
        }}>
          <Icon size={24} />
        </div>
      </div>
      {subtitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ 
            fontSize: '0.85rem', 
            color: isPositive === undefined ? 'var(--text-secondary)' : (isPositive ? 'var(--success)' : 'var(--danger)') 
          }}>
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
};

export default KpiCard;
