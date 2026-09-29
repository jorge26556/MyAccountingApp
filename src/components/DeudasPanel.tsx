import React, { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Account, Debt } from '../types';
import type { EstadoDeuda, ResumenDeudas } from '../lib/deudas';
import { formatCurrency } from '../lib/format';
import { toDateString, today } from '../lib/dates';
import { errorMessage, useToast } from '../lib/toast';

type Vista = 'abiertas' | 'saldadas' | 'archivadas';

interface DeudasPanelProps {
  resumen: ResumenDeudas;
  accounts: Account[];
  onNueva: () => void;
  onAbonar: (estado: EstadoDeuda) => void;
  onPrestarMas: (estado: EstadoDeuda) => void;
  onEditar: (
    estado: EstadoDeuda,
    cambios: Pick<Debt, 'persona' | 'descripcion' | 'fecha_limite'>
  ) => Promise<void>;
  onArchivar: (estado: EstadoDeuda) => void;
  onDesarchivar: (estado: EstadoDeuda) => void;
  onEliminar: (estado: EstadoDeuda) => void;
}

/**
 * La pestaña de Deudas: quien te debe y a quien le debes.
 *
 * Antes era una tarjeta en medio del Inicio, debajo del saldo, el mes y la
 * agenda: en el celular habia que bajar bastante para encontrarla, y no tenia
 * espacio para lo que una deuda necesita de verdad —su historial, poder
 * prestar otra vez, ver las archivadas—. En el Inicio queda solo una linea de
 * resumen que trae hasta aqui.
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
  accounts,
  onNueva,
  onAbonar,
  onPrestarMas,
  onEditar,
  onArchivar,
  onDesarchivar,
  onEliminar,
}) => {
  const [vista, setVista] = useState<Vista>('abiertas');

  const saldadas = resumen.estados.filter(estado => estado.saldada);

  const cabecera = (
    <div className="deudas__head">
      <h2>
        <HandCoins size={19} />
        Deudas
      </h2>
      <button type="button" className="deudas__nueva" onClick={onNueva}>
        <Plus size={14} />
        Registrar
      </button>
    </div>
  );

  if (!resumen.hayAlgo) {
    return (
      <section className="deudas is-vacio">
        {cabecera}
        <p className="deudas__vacio">
          Si le prestas plata a alguien —o te prestan— anótalo aquí. No cuenta como gasto ni como
          ingreso: sigue siendo tuya, solo que la tiene otro.
        </p>
      </section>
    );
  }

  const vistas: Array<{ id: Vista; label: string; total: number }> = [
    { id: 'abiertas', label: 'Abiertas', total: resumen.abiertas.length },
    { id: 'saldadas', label: 'Saldadas', total: saldadas.length },
    { id: 'archivadas', label: 'Archivadas', total: resumen.archivadas.length },
  ];

  const tarjeta = (estado: EstadoDeuda) => (
    <DeudaCard
      key={estado.deuda.id}
      estado={estado}
      accounts={accounts}
      onAbonar={onAbonar}
      onPrestarMas={onPrestarMas}
      onEditar={onEditar}
      onArchivar={onArchivar}
      onDesarchivar={onDesarchivar}
      onEliminar={onEliminar}
    />
  );

  // En las abiertas se separa lo que entra de lo que sale: mezcladas y
  // ordenadas solo por monto, "te debe" y "le debes" se confundian al mirar.
  const teDeben = resumen.abiertas.filter(estado => estado.deuda.tipo === 'me_deben');
  const debes = resumen.abiertas.filter(estado => estado.deuda.tipo === 'debo');

  const contenido = () => {
    if (vista === 'abiertas') {
      if (resumen.abiertas.length === 0) {
        return <p className="deudas__vacio">No tienes deudas abiertas. Todo al día.</p>;
      }
      return (
        <>
          {teDeben.length > 0 && (
            <div className="deudas__grupo">
              <h3>Te deben</h3>
              <ul className="deudas__list">{teDeben.map(tarjeta)}</ul>
            </div>
          )}
          {debes.length > 0 && (
            <div className="deudas__grupo">
              <h3>Debes</h3>
              <ul className="deudas__list">{debes.map(tarjeta)}</ul>
            </div>
          )}
        </>
      );
    }

    const lista = vista === 'saldadas' ? saldadas : resumen.archivadas;
    if (lista.length === 0) {
      return (
        <p className="deudas__vacio">
          {vista === 'saldadas'
            ? 'Cuando una deuda quede en cero aparecerá aquí.'
            : 'Las deudas que archives quedan aquí, fuera de los totales, por si las necesitas.'}
        </p>
      );
    }
    return <ul className="deudas__list">{lista.map(tarjeta)}</ul>;
  };

  return (
    <section className="deudas">
      {cabecera}

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

      <div className="deudas__vistas" role="tablist" aria-label="Filtrar deudas">
        {vistas.map(({ id, label, total }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={vista === id}
            className={`deudas__vista ${vista === id ? 'is-active' : ''}`}
            onClick={() => setVista(id)}
          >
            {label}
            <span>{total}</span>
          </button>
        ))}
      </div>

      {contenido()}
    </section>
  );
};

interface DeudaCardProps {
  estado: EstadoDeuda;
  accounts: Account[];
  onAbonar: (estado: EstadoDeuda) => void;
  onPrestarMas: (estado: EstadoDeuda) => void;
  onEditar: DeudasPanelProps['onEditar'];
  onArchivar: (estado: EstadoDeuda) => void;
  onDesarchivar: (estado: EstadoDeuda) => void;
  onEliminar: (estado: EstadoDeuda) => void;
}

const DeudaCard: React.FC<DeudaCardProps> = ({
  estado,
  accounts,
  onAbonar,
  onPrestarMas,
  onEditar,
  onArchivar,
  onDesarchivar,
  onEliminar,
}) => {
  const toast = useToast();
  const { deuda } = estado;
  const meDeben = deuda.tipo === 'me_deben';

  const [verHistorial, setVerHistorial] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const aBorrador = () => ({
    persona: deuda.persona,
    descripcion: deuda.descripcion,
    fecha_limite: deuda.fecha_limite ? toDateString(deuda.fecha_limite) : '',
  });
  const [borrador, setBorrador] = useState(aBorrador);

  const nombreCuenta = (id: string | null) =>
    accounts.find(cuenta => cuenta.id === id)?.nombre ?? 'Sin cuenta';

  const empezarEdicion = () => {
    setBorrador(aBorrador());
    setEditando(true);
  };

  const guardarEdicion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!borrador.persona.trim() || guardando) return;
    setGuardando(true);
    try {
      const [y, m, d] = borrador.fecha_limite.split('-').map(Number);
      await onEditar(estado, {
        persona: borrador.persona,
        descripcion: borrador.descripcion,
        fecha_limite: borrador.fecha_limite ? new Date(y, m - 1, d) : null,
      });
      setEditando(false);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar'));
    } finally {
      setGuardando(false);
    }
  };

  const vencida = deuda.fecha_limite !== null && deuda.fecha_limite < today();

  const estadoTexto = deuda.archivada
    ? 'Archivada'
    : estado.saldada
      ? 'Saldada'
      : meDeben
        ? 'te debe'
        : 'le debes';

  return (
    <li
      className={`deuda ${estado.saldada ? 'is-saldada' : ''} ${deuda.archivada ? 'is-archivada' : ''}`}
    >
      {editando ? (
        <form className="deuda__editar" onSubmit={guardarEdicion}>
          <label>
            <span>Persona</span>
            <input
              type="text"
              value={borrador.persona}
              onChange={event => setBorrador(prev => ({ ...prev, persona: event.target.value }))}
              autoFocus
              required
            />
          </label>
          <label>
            <span>Nota</span>
            <input
              type="text"
              value={borrador.descripcion}
              placeholder="Opcional"
              onChange={event => setBorrador(prev => ({ ...prev, descripcion: event.target.value }))}
            />
          </label>
          <label>
            <span>{meDeben ? '¿Cuándo te paga?' : '¿Cuándo pagas?'}</span>
            <input
              type="date"
              value={borrador.fecha_limite}
              onChange={event => setBorrador(prev => ({ ...prev, fecha_limite: event.target.value }))}
            />
          </label>
          <div className="deuda__confirm-acciones">
            <button
              type="submit"
              className="tx-confirm__yes is-primary"
              disabled={!borrador.persona.trim() || guardando}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" className="tx-confirm__no" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="deuda__top">
          <div className="deuda__quien">
            <strong>{deuda.persona}</strong>
            <span>
              {estadoTexto}
              {deuda.descripcion && ` · ${deuda.descripcion}`}
            </span>
          </div>
          <span className={`deuda__monto ${meDeben ? 'is-cobrar' : 'is-pagar'}`}>
            {formatCurrency(Math.max(0, estado.pendiente))}
          </span>
        </div>
      )}

      {/* La barra solo tiene sentido si ya hubo abonos parciales. */}
      {estado.abonado > 0 && !estado.saldada && (
        <div className="deuda__barra">
          <div className="deuda__fill" style={{ width: `${estado.porcentaje}%` }} />
        </div>
      )}

      <div className="deuda__meta">
        <span>
          {meDeben ? 'Prestaste' : 'Te prestaron'} {formatCurrency(estado.original)}
          {estado.abonado > 0 &&
            ` · ${meDeben ? 'devolvió' : 'has pagado'} ${formatCurrency(estado.abonado)}`}
        </span>
        {estado.ultimoMovimiento && (
          <span>{format(estado.ultimoMovimiento, 'd MMM yyyy', { locale: es })}</span>
        )}
      </div>

      {deuda.fecha_limite && !estado.saldada && !deuda.archivada && (
        <span className={`deuda__limite ${vencida ? 'is-vencida' : ''}`}>
          {vencida ? 'Venció el ' : meDeben ? 'Te paga el ' : 'Pagas el '}
          {format(deuda.fecha_limite, "d 'de' MMMM", { locale: es })}
        </span>
      )}

      {estado.historial.length > 0 && (
        <button
          type="button"
          className="deuda__toggle"
          aria-expanded={verHistorial}
          onClick={() => setVerHistorial(valor => !valor)}
        >
          {verHistorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {verHistorial ? 'Ocultar historial' : `Ver historial (${estado.historial.length})`}
        </button>
      )}

      {verHistorial && (
        <ul className="deuda__historial">
          {estado.historial.map(item => {
            // Para "me deben" el préstamo es Gasto; para "debo", Ingreso.
            const esOriginal = meDeben ? item.tipo === 'Gasto' : item.tipo === 'Ingreso';
            return (
              <li key={item.id}>
                <div>
                  <strong>{esOriginal ? 'Préstamo' : meDeben ? 'Abono recibido' : 'Pago'}</strong>
                  <span>
                    {format(item.fecha, 'd MMM yyyy', { locale: es })} · {nombreCuenta(item.account_id)}
                  </span>
                </div>
                <span className={esOriginal ? '' : meDeben ? 'is-cobrar' : 'is-pagar'}>
                  {esOriginal ? '+' : '−'}
                  {formatCurrency(Math.abs(item.importe))}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {confirmando ? (
        <div className="deuda__confirm">
          <span>
            Se borra la ficha, pero los movimientos de plata se conservan y vuelven a contar como{' '}
            {meDeben ? 'gasto' : 'ingreso'} normal — que es lo que son si la das por perdida.
          </span>
          <div className="deuda__confirm-acciones">
            <button
              type="button"
              className="tx-confirm__yes"
              onClick={() => {
                setConfirmando(false);
                onEliminar(estado);
              }}
            >
              Sí, eliminar
            </button>
            <button type="button" className="tx-confirm__no" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        !editando && (
          <>
            {!deuda.archivada && (
              <div className="deuda__acciones">
                {!estado.saldada && (
                  <button type="button" className="is-primary" onClick={() => onAbonar(estado)}>
                    {meDeben ? 'Registrar abono' : 'Registrar pago'}
                  </button>
                )}
                <button type="button" onClick={() => onPrestarMas(estado)}>
                  <Plus size={14} /> {meDeben ? 'Prestar más' : 'Me prestó más'}
                </button>
              </div>
            )}

            <div className="deuda__secundarias">
              <button type="button" onClick={empezarEdicion}>
                <Pencil size={13} /> Editar
              </button>
              {deuda.archivada ? (
                <button type="button" onClick={() => onDesarchivar(estado)}>
                  <ArchiveRestore size={13} /> Desarchivar
                </button>
              ) : (
                <button type="button" onClick={() => onArchivar(estado)}>
                  <Archive size={13} /> Archivar
                </button>
              )}
              <button type="button" className="is-danger" onClick={() => setConfirmando(true)}>
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
          </>
        )
      )}
    </li>
  );
};

export default DeudasPanel;
