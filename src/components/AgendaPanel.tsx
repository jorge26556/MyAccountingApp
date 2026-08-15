import React, { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, CalendarClock, Check, Repeat } from 'lucide-react';
import type { Agenda, GrupoAgenda, ItemAgenda } from '../lib/agenda';
import { formatCurrency } from '../lib/format';

interface AgendaPanelProps {
  agenda: Agenda;
  onMarcarPagado: (id: string) => void;
}

const TITULOS: Record<GrupoAgenda, string> = {
  vencido: 'Vencidos',
  hoy: 'Hoy',
  semana: 'Próximos 7 días',
  despues: 'Más adelante',
};

const ORDEN: GrupoAgenda[] = ['vencido', 'hoy', 'semana', 'despues'];

const cuando = (item: ItemAgenda): string => {
  if (item.diasRestantes === 0) return 'hoy';
  if (item.diasRestantes === 1) return 'mañana';
  if (item.diasRestantes === -1) return 'ayer';
  if (item.diasRestantes < 0) return `hace ${Math.abs(item.diasRestantes)} días`;
  return `en ${item.diasRestantes} días`;
};

/**
 * La agenda de lo que viene.
 *
 * El estado "Pendiente" ya existia, pero solo como un total en una tarjeta, y
 * un total no se puede pagar. Esto lo vuelve accionable: fechas, orden de
 * urgencia y un boton para marcarlo pagado sin abrir el formulario.
 *
 * Por defecto solo se ve lo urgente. Lo de dentro de tres semanas no es una
 * decision de hoy y ocupando pantalla solo estorba.
 */
const AgendaPanel: React.FC<AgendaPanelProps> = ({ agenda, onMarcarPagado }) => {
  const [verTodo, setVerTodo] = useState(false);

  if (!agenda.hayAlgo) return null;

  const visibles = verTodo ? agenda.items : agenda.urgentes;
  const ocultos = agenda.items.length - agenda.urgentes.length;

  // Sin nada urgente el panel abre directo en la lista completa: mostrar un
  // encabezado sobre el vacio y obligar a un clic extra no ayuda a nadie.
  const mostrar = visibles.length > 0 ? visibles : agenda.items;

  const grupos = ORDEN.map(grupo => ({
    grupo,
    items: mostrar.filter(item => item.grupo === grupo),
  })).filter(bloque => bloque.items.length > 0);

  return (
    <section className="agenda">
      <div className="agenda__head">
        <h3>
          <CalendarClock size={17} />
          Próximos pagos
        </h3>
        {agenda.montoUrgente > 0 && (
          <span className="agenda__total">
            {agenda.urgentes.length} en 7 días · {formatCurrency(agenda.montoUrgente)}
          </span>
        )}
      </div>

      {agenda.vencidos.length > 0 && (
        <p className="agenda__alerta">
          <AlertTriangle size={14} />
          {agenda.vencidos.length === 1
            ? 'Tienes 1 movimiento vencido sin marcar'
            : `Tienes ${agenda.vencidos.length} movimientos vencidos sin marcar`}
        </p>
      )}

      {grupos.map(({ grupo, items }) => (
        <div key={grupo} className="agenda__grupo">
          <span className={`agenda__grupo-titulo is-${grupo}`}>{TITULOS[grupo]}</span>

          <ul className="agenda__list">
            {items.map(item => (
              <li key={item.key} className={`agenda__item is-${grupo}`}>
                <div className="agenda__fecha">
                  <strong>{format(item.fecha, 'd', { locale: es })}</strong>
                  <span>{format(item.fecha, 'MMM', { locale: es })}</span>
                </div>

                <div className="agenda__cuerpo">
                  <strong className="agenda__concepto">
                    {item.descripcion || item.categoria}
                  </strong>
                  <span className="agenda__detalle">
                    {item.categoria} · {cuando(item)}
                    {/* Los recurrentes se registran solos al llegar el dia: no
                        hay nada que marcar, solo que saber que vienen. */}
                    {item.origen === 'recurrente' && (
                      <span className="agenda__auto">
                        <Repeat size={11} />
                        automático
                      </span>
                    )}
                  </span>
                </div>

                <div className="agenda__derecha">
                  <span className={`agenda__importe ${item.tipo === 'Gasto' ? 'is-gasto' : 'is-ingreso'}`}>
                    {item.tipo === 'Gasto' ? '−' : '+'}
                    {formatCurrency(item.importe)}
                  </span>
                  {item.origen === 'pendiente' && (
                    <button
                      type="button"
                      className="agenda__pagar"
                      onClick={() => onMarcarPagado(item.id)}
                      aria-label={`Marcar como pagado: ${item.descripcion || item.categoria}`}
                    >
                      <Check size={14} />
                      {item.tipo === 'Gasto' ? 'Pagado' : 'Cobrado'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {ocultos > 0 && (
        <button type="button" className="agenda__mas" onClick={() => setVerTodo(valor => !valor)}>
          {verTodo ? 'Ver solo lo urgente' : `Ver ${ocultos} más adelante`}
        </button>
      )}
    </section>
  );
};

export default AgendaPanel;
