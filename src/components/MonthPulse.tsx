import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Proyeccion } from '../lib/analytics';
import { formatCurrency } from '../lib/format';

/**
 * "A este ritmo terminas el mes en $X."
 *
 * Es lo mas accionable del dashboard y por eso no va escondido entre las
 * graficas: un total te dice donde estas, esto te dice hacia donde vas mientras
 * todavia puedes corregir.
 */
const MonthPulse: React.FC<{ proyeccion: Proyeccion }> = ({ proyeccion }) => {
  const {
    gastadoHasta,
    proyectado,
    ritmoDiario,
    diasTranscurridos,
    diasDelMes,
    totalMesAnterior,
    diferenciaVsAnterior,
    esMesEnCurso,
  } = proyeccion;

  if (!esMesEnCurso) return null;

  const gastaMas = diferenciaVsAnterior > 0;
  const hayComparativo = totalMesAnterior > 0;

  // La barra compara el avance del gasto contra el avance del mes: si la barra
  // llena va por delante de la marca, vas gastando mas rapido que el calendario.
  const avanceMes = (diasTranscurridos / diasDelMes) * 100;
  const referencia = Math.max(proyectado, totalMesAnterior, gastadoHasta, 1);
  const avanceGasto = (gastadoHasta / referencia) * 100;

  return (
    <div className="pulse">
      <div className="pulse__head">
        <span className="pulse__label">Ritmo de gasto</span>
        <span className="pulse__days">
          Día {diasTranscurridos} de {diasDelMes}
        </span>
      </div>

      <p className="pulse__claim">
        A este ritmo cierras el mes en{' '}
        <strong className={gastaMas ? 'is-alto' : 'is-bajo'}>{formatCurrency(proyectado)}</strong>
      </p>

      <div className="pulse__bar" role="img" aria-label={`Gastado ${formatCurrency(gastadoHasta)} de ${formatCurrency(proyectado)} proyectado`}>
        <div className="pulse__fill" style={{ width: `${Math.min(100, avanceGasto)}%` }} />
        <div className="pulse__marker" style={{ left: `${Math.min(100, avanceMes)}%` }} title="Avance del mes" />
      </div>

      <div className="pulse__meta">
        <span>
          Llevas {formatCurrency(gastadoHasta)} · {formatCurrency(ritmoDiario)} por día
        </span>
        {hayComparativo && (
          <span className={gastaMas ? 'is-alto' : 'is-bajo'}>
            {gastaMas ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {gastaMas ? '+' : '−'}
            {formatCurrency(Math.abs(diferenciaVsAnterior))} vs el mes pasado
          </span>
        )}
      </div>
    </div>
  );
};

export default MonthPulse;
