import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { DisponibleMes, Proyeccion } from '../lib/analytics';
import { formatCurrency } from '../lib/format';

interface MesEnCursoProps {
  disponible: DisponibleMes;
  proyeccion: Proyeccion;
}

/**
 * La tarjeta que contesta "¿cuanto puedo gastar?" y "¿voy bien?" de una sola
 * mirada. Sustituye al antiguo "Ritmo de gasto", que solo respondia la segunda.
 *
 * El titular cambia segun la situacion, y esa es toda la idea:
 *
 *  - En positivo dice cuanto te queda del mes y cuanto da por dia. Es el numero
 *    que uno consulta parado en la caja del supermercado.
 *  - En deficit NO ofrece un presupuesto diario. Seria un consejo pesimo:
 *    repartir entre los dias que quedan una plata que en realidad estas sacando
 *    del ahorro. Dice justamente eso, y cuanto ahorro te queda.
 */
const MesEnCurso: React.FC<MesEnCursoProps> = ({ disponible, proyeccion }) => {
  const {
    margenDelMes,
    flujoDelMes,
    enDeficit,
    porDia,
    diasRestantes,
    disponible: tope,
    comprometido,
    porCobrar,
    costoFijoMensual,
    esMesEnCurso,
  } = disponible;

  const {
    gastadoHasta,
    proyectado,
    ritmoDiario,
    diasTranscurridos,
    diasDelMes,
    totalMesAnterior,
    diferenciaVsAnterior,
  } = proyeccion;

  // Sin nada registrado ni configurado la tarjeta serian seis ceros.
  const hayDatos = gastadoHasta > 0 || costoFijoMensual > 0 || disponible.ingresosDelMes > 0;
  if (!esMesEnCurso || !hayDatos) return null;

  const gastaMas = diferenciaVsAnterior > 0;
  const hayComparativo = totalMesAnterior > 0;

  // La barra compara el avance del gasto contra el avance del mes: si el
  // relleno va por delante de la marca, gastas mas rapido que el calendario.
  const avanceMes = (diasTranscurridos / diasDelMes) * 100;
  const referencia = Math.max(proyectado, totalMesAnterior, gastadoHasta, 1);
  const avanceGasto = (gastadoHasta / referencia) * 100;

  return (
    <section className={`mes ${enDeficit ? 'is-deficit' : ''}`}>
      <div className="mes__head">
        <span className="mes__label">Este mes</span>
        <span className="mes__days">
          Día {diasTranscurridos} de {diasDelMes}
        </span>
      </div>

      {enDeficit ? (
        <div className="mes__claim">
          <span className="mes__claim-label">Vas por encima de lo que entró</span>
          <strong className="mes__claim-value is-alto">
            {formatCurrency(Math.abs(flujoDelMes))}
          </strong>
          <span className="mes__claim-hint">
            Lo estás sacando del ahorro. Te quedan {formatCurrency(tope)} disponibles.
          </span>
        </div>
      ) : (
        <div className="mes__claim">
          <span className="mes__claim-label">Puedes gastar</span>
          <strong className="mes__claim-value is-bajo">{formatCurrency(margenDelMes)}</strong>
          <span className="mes__claim-hint">
            {formatCurrency(porDia)} por día en los {diasRestantes} que quedan
          </span>
        </div>
      )}

      <div
        className="mes__bar"
        role="img"
        aria-label={`Llevas ${formatCurrency(gastadoHasta)} gastados de ${formatCurrency(proyectado)} proyectados`}
      >
        <div className="mes__fill" style={{ width: `${Math.min(100, avanceGasto)}%` }} />
        <div
          className="mes__marker"
          style={{ left: `${Math.min(100, avanceMes)}%` }}
          title="Avance del mes"
        />
      </div>

      <div className="mes__meta">
        <span>
          Llevas {formatCurrency(gastadoHasta)} · cierras en {formatCurrency(proyectado)}
        </span>
        {hayComparativo && (
          <span className={gastaMas ? 'is-alto' : 'is-bajo'}>
            {gastaMas ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {gastaMas ? '+' : '−'}
            {formatCurrency(Math.abs(diferenciaVsAnterior))} vs el mes pasado
          </span>
        )}
      </div>

      <div className="mes__facts">
        {costoFijoMensual > 0 && (
          <div className="mes__fact">
            <span>Costo fijo</span>
            <strong>{formatCurrency(costoFijoMensual)}</strong>
          </div>
        )}
        {comprometido > 0 && (
          <div className="mes__fact">
            <span>Comprometido</span>
            <strong>{formatCurrency(comprometido)}</strong>
          </div>
        )}
        {porCobrar > 0 && (
          <div className="mes__fact">
            <span>Por cobrar</span>
            <strong>{formatCurrency(porCobrar)}</strong>
          </div>
        )}
        <div className="mes__fact">
          <span>Ritmo</span>
          <strong>{formatCurrency(ritmoDiario)}/día</strong>
        </div>
      </div>
    </section>
  );
};

export default MesEnCurso;
