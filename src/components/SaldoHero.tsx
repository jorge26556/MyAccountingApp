import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Landmark, Wallet } from 'lucide-react';
import type { SaldoCuenta } from '../lib/accounts';
import { formatCurrency } from '../lib/format';

interface SaldoHeroProps {
  saldos: SaldoCuenta[];
  total: number;
  sinCuenta: number;
}

/**
 * "Tienes $X" — arriba del todo y fuera del selector de periodo.
 *
 * Esto NO depende del filtro de fechas a proposito. El saldo es cuanta plata
 * hay ahora mismo; filtrarlo por "mes pasado" no significaria nada. Todo lo
 * demas del dashboard responde "¿como me fue?"; esto responde "¿cuanto tengo?",
 * que es la pregunta que uno se hace primero al abrir la app.
 */
const SaldoHero: React.FC<SaldoHeroProps> = ({ saldos, total, sinCuenta }) => {
  const [abierto, setAbierto] = useState(false);
  const hayVarias = saldos.length > 1;

  return (
    <section className={`saldo ${total < 0 ? 'is-negative' : ''}`}>
      <div className="saldo__head">
        <span className="saldo__label">
          <Wallet size={15} />
          Tienes
        </span>
        {hayVarias && (
          <button
            type="button"
            className="saldo__toggle"
            onClick={() => setAbierto(valor => !valor)}
            aria-expanded={abierto}
          >
            {saldos.length} cuentas
            {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>

      <strong className="saldo__value">{formatCurrency(total)}</strong>

      {/* Con una sola cuenta el desglose seria la misma cifra repetida. */}
      {(abierto || !hayVarias) && (
        <ul className="saldo__list">
          {saldos.map(({ cuenta, saldo }) => (
            <li key={cuenta.id} className={cuenta.archivada ? 'is-archivada' : ''}>
              <span className="saldo__cuenta">
                <Landmark size={14} />
                {cuenta.nombre}
                {cuenta.archivada && <em>archivada</em>}
              </span>
              <span className={`saldo__monto ${saldo < 0 ? 'is-negative' : ''}`}>
                {formatCurrency(saldo)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Repartirlos en silencio entre las demas cuentas descuadraria un saldo
          sin que nada lo explicara, asi que se avisa. */}
      {sinCuenta > 0 && (
        <p className="saldo__alerta">
          <AlertTriangle size={14} />
          {sinCuenta} {sinCuenta === 1 ? 'movimiento no está' : 'movimientos no están'} asignados a
          ninguna cuenta y no suman al saldo.
        </p>
      )}
    </section>
  );
};

export default SaldoHero;
