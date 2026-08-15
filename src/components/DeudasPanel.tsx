import React, { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, HandCoins, Plus, Trash2 } from 'lucide-react';
import type { EstadoDeuda, ResumenDeudas } from '../lib/deudas';
import { formatCurrency } from '../lib/format';

interface DeudasPanelProps {
  resumen: ResumenDeudas;
  onNueva: () => void;
  onAbonar: (estado: EstadoDeuda) => void;
  onArchivar: (estado: EstadoDeuda) => void;
  onEliminar: (estado: EstadoDeuda) => void;
}

/**
 * Quien te debe y a quien le debes.
 *
 * Vive fuera del selector de periodo, como el saldo y la agenda: que Juan te
 * deba $300.000 no depende de si estas mirando agosto o julio.
 *
 * El monto no se guarda en ningun campo, se calcula sumando los movimientos.
 * Asi un abono es un movimiento mas y no hay dos verdades que puedan quedar
 * desincronizadas.
 */
const DeudasPanel: React.FC<DeudasPanelProps> = ({
  resumen,
  onNueva,
  onAbonar,
  onArchivar,
  onEliminar,
}) => {
  const [verSaldadas, setVerSaldadas] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const saldadas = resumen.estados.filter(estado => estado.saldada);
  const visibles = verSaldadas ? resumen.estados : resumen.abiertas;

  // Sin nada registrado, un panel vacio con dos ceros solo ocupa pantalla.
  if (!resumen.hayAlgo) {
    return (
      <section className="deudas is-vacio">
        <div className="deudas__head">
          <h3>
            <HandCoins size={17} />
            Deudas
          </h3>
          <button type="button" className="deudas__nueva" onClick={onNueva}>
            <Plus size={14} />
            Registrar
          </button>
        </div>
        <p className="deudas__vacio">
          Si le prestas plata a alguien —o te prestan— anótalo aquí. No cuenta como gasto ni como
          ingreso: sigue siendo tuya, solo que la tiene otro.
        </p>
      </section>
    );
  }

  return (
    <section className="deudas">
      <div className="deudas__head">
        <h3>
          <HandCoins size={17} />
          Deudas
        </h3>
        <button type="button" className="deudas__nueva" onClick={onNueva}>
          <Plus size={14} />
          Registrar
        </button>
      </div>

      <div className="deudas__totales">
        <div className="deudas__total">
          <span>Te deben</span>
          <strong className="is-cobrar">{formatCurrency(resumen.teDeben)}</strong>
        </div>
        <div className="deudas__total">
          <span>Debes</span>
          <strong className="is-pagar">{formatCurrency(resumen.debes)}</strong>
        </div>
      </div>

      <ul className="deudas__list">
        {visibles.map(estado => {
          const { deuda } = estado;
          const meDeben = deuda.tipo === 'me_deben';
          const enConfirmacion = confirmando === deuda.id;

          return (
            <li key={deuda.id} className={`deuda ${estado.saldada ? 'is-saldada' : ''}`}>
              <div className="deuda__top">
                <div className="deuda__quien">
                  <strong>{deuda.persona}</strong>
                  <span>
                    {estado.saldada
                      ? 'Saldada'
                      : meDeben
                        ? 'te debe'
                        : 'le debes'}
                    {deuda.descripcion && ` · ${deuda.descripcion}`}
                  </span>
                </div>
                <span className={`deuda__monto ${meDeben ? 'is-cobrar' : 'is-pagar'}`}>
                  {formatCurrency(Math.max(0, estado.pendiente))}
                </span>
              </div>

              {/* La barra solo tiene sentido si ya hubo abonos parciales. */}
              {estado.abonado > 0 && !estado.saldada && (
                <div className="deuda__barra">
                  <div className="deuda__fill" style={{ width: `${estado.porcentaje}%` }} />
                </div>
              )}

              <div className="deuda__meta">
                <span>
                  {meDeben ? 'Prestaste' : 'Te prestaron'} {formatCurrency(estado.original)}
                  {estado.abonado > 0 && ` · ${meDeben ? 'devolvió' : 'has pagado'} ${formatCurrency(estado.abonado)}`}
                </span>
                {estado.ultimoMovimiento && (
                  <span>{format(estado.ultimoMovimiento, 'd MMM yyyy', { locale: es })}</span>
                )}
              </div>

              {enConfirmacion ? (
                <div className="deuda__confirm">
                  <span>
                    Se borra la ficha, pero los movimientos de plata se conservan y vuelven a
                    contar como {meDeben ? 'gasto' : 'ingreso'} normal — que es lo que son si la
                    das por perdida.
                  </span>
                  <div className="deuda__confirm-acciones">
                    <button
                      type="button"
                      className="tx-confirm__yes"
                      onClick={() => {
                        setConfirmando(null);
                        onEliminar(estado);
                      }}
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      className="tx-confirm__no"
                      onClick={() => setConfirmando(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="deuda__acciones">
                  {!estado.saldada && (
                    <button type="button" onClick={() => onAbonar(estado)}>
                      {meDeben ? 'Registrar abono' : 'Registrar pago'}
                    </button>
                  )}
                  <button type="button" onClick={() => onArchivar(estado)}>
                    <Archive size={14} /> Archivar
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => setConfirmando(deuda.id)}
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {saldadas.length > 0 && (
        <button
          type="button"
          className="deudas__mas"
          onClick={() => setVerSaldadas(valor => !valor)}
        >
          {verSaldadas
            ? 'Ocultar las saldadas'
            : `Ver ${saldadas.length} saldada${saldadas.length === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  );
};

export default DeudasPanel;
