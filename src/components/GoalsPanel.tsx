import React from 'react';
import { CheckCircle2, Target } from 'lucide-react';
import type { GoalProgress } from '../types';
import { formatCurrency } from '../lib/format';

/**
 * El dashboard anterior hacia `savingsGoals[0]` y mostraba una sola meta: si
 * tenias cinco, cuatro eran invisibles. Aqui aparecen todas con su progreso.
 */
const GoalsPanel: React.FC<{ metas: GoalProgress[] }> = ({ metas }) => {
  if (metas.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div className="settings-card__header" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Target size={18} color="var(--info)" />
          Metas de ahorro
        </h3>
        <span className="settings-card__hint">
          Comparadas contra el balance del periodo seleccionado
        </span>
      </div>

      <div className="goals-grid">
        {metas.map(({ goal, ahorro, porcentaje, completada, faltante }) => {
          const ancho = Math.min(100, porcentaje);

          return (
            <div key={goal.id} className="goal-item">
              <div className="goal-item__head">
                <strong>{goal.name}</strong>
                {completada ? (
                  <span className="badge badge-paid" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={13} /> Completada
                  </span>
                ) : (
                  <span className="badge badge-pending">{porcentaje.toFixed(0)}%</span>
                )}
              </div>

              <div
                className="goal-item__bar"
                role="progressbar"
                aria-valuenow={Math.round(ancho)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso de ${goal.name}`}
              >
                <div
                  className="goal-item__fill"
                  style={{
                    width: `${ancho}%`,
                    background: completada
                      ? 'linear-gradient(90deg, #3fb950, #56d364)'
                      : 'linear-gradient(90deg, #58a6ff, #388bfd)',
                  }}
                />
              </div>

              <div className="goal-item__meta">
                <span>
                  {formatCurrency(Math.max(0, ahorro))} de {formatCurrency(goal.amount)}
                </span>
                <span style={{ color: completada ? 'var(--success)' : 'var(--text-muted)' }}>
                  {completada ? '¡Meta alcanzada!' : `Faltan ${formatCurrency(faltante)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GoalsPanel;
