import React from 'react';
import { AlertTriangle, PiggyBank } from 'lucide-react';
import type { EstadoPresupuesto } from '../lib/analytics';
import { formatCurrency } from '../lib/format';

/**
 * Presupuestos del mes en el dashboard.
 *
 * "En riesgo" se calcula por proyeccion, no por acumulado: enterarte el dia 28
 * de que te pasaste no sirve; verlo el dia 12 con el ritmo apuntando a exceso,
 * si.
 */
const BudgetsPanel: React.FC<{ estados: EstadoPresupuesto[] }> = ({ estados }) => {
  if (estados.length === 0) return null;

  const alertas = estados.filter(e => e.excedido || e.enRiesgo).length;

  return (
    <div className="card budgets">
      <div className="budgets__head">
        <h3>
          <PiggyBank size={18} color="var(--accent-primary)" />
          Presupuestos del mes
        </h3>
        {alertas > 0 && (
          <span className="badge badge-pending">
            {alertas} {alertas === 1 ? 'alerta' : 'alertas'}
          </span>
        )}
      </div>

      <div className="budgets__list">
        {estados.map(estado => {
          const ancho = Math.min(100, estado.porcentaje);
          const clase = estado.excedido ? 'is-excedido' : estado.enRiesgo ? 'is-riesgo' : 'is-ok';

          return (
            <div key={estado.categoria} className={`budget ${clase}`}>
              <div className="budget__head">
                <strong>{estado.categoria}</strong>
                <span className="budget__pct">{estado.porcentaje.toFixed(0)}%</span>
              </div>

              <div
                className="budget__bar"
                role="progressbar"
                aria-valuenow={Math.round(ancho)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Presupuesto de ${estado.categoria}`}
              >
                <div className="budget__fill" style={{ width: `${ancho}%` }} />
              </div>

              <div className="budget__meta">
                <span>
                  {formatCurrency(estado.gastado)} de {formatCurrency(estado.presupuesto)}
                </span>
                {estado.excedido ? (
                  <span className="budget__alerta">
                    <AlertTriangle size={13} />
                    Excedido en {formatCurrency(estado.gastado - estado.presupuesto)}
                  </span>
                ) : estado.enRiesgo ? (
                  <span className="budget__alerta">
                    <AlertTriangle size={13} />
                    Vas camino a excederte
                  </span>
                ) : (
                  <span>Quedan {formatCurrency(estado.restante)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BudgetsPanel;
