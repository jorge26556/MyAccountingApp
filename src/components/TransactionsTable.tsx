import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Copy, Pencil, Trash2 } from 'lucide-react';
import type { Transaction } from '../types';
import { formatCurrency } from '../lib/format';
import { useIsMobile } from '../lib/useMediaQuery';

interface TransactionsTableProps {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
  onRepeat: (transaction: Transaction) => void;
}

type SortKey = 'fecha' | 'importe' | 'categoria' | 'canal';

const ITEMS_PER_PAGE = 15;

const TransactionsTable: React.FC<TransactionsTableProps> = ({
  transactions,
  onEdit,
  onDelete,
  onRepeat,
}) => {
  const isMobile = useIsMobile();
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'fecha',
    direction: 'desc',
  });

  const sortedTransactions = useMemo(() => {
    const items = [...transactions];
    const { key, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    items.sort((a, b) => {
      if (key === 'fecha') return (a.fecha.getTime() - b.fecha.getTime()) * factor;
      if (key === 'importe') return (Math.abs(a.importe) - Math.abs(b.importe)) * factor;
      return a[key].localeCompare(b[key]) * factor;
    });

    return items;
  }, [transactions, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / ITEMS_PER_PAGE));

  /**
   * La pagina visible se DERIVA en vez de corregirse desde un efecto: asi no
   * hay render intermedio en blanco al filtrar estando en una pagina alta.
   * Se acota en lugar de volver siempre a la 1, para que borrar un registro
   * desde la pagina 3 no te devuelva al principio.
   */
  const page = Math.min(currentPage, totalPages);

  const activeDeleteId =
    deletingId && sortedTransactions.some(item => item.id === deletingId) ? deletingId : null;

  const currentData = sortedTransactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const requestSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'fecha' || key === 'importe' ? 'desc' : 'asc' }
    );
  };

  const sortIndicator = (key: SortKey) =>
    sortConfig.key === key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : null;

  if (transactions.length === 0) {
    return (
      <div className="card empty-state">
        No hay movimientos en este periodo. Cambia el rango de fechas o registra el primero.
      </div>
    );
  }

  const confirmacionBorrado = (item: Transaction) => (
    <div className="tx-confirm">
      <span>¿Eliminar {formatCurrency(Math.abs(item.importe))} de {item.categoria}? No se puede deshacer.</span>
      <div className="tx-confirm__actions">
        <button
          type="button"
          className="tx-confirm__yes"
          onClick={() => {
            setDeletingId(null);
            onDelete(item.id);
          }}
        >
          Sí, eliminar
        </button>
        <button type="button" className="tx-confirm__no" onClick={() => setDeletingId(null)}>
          Cancelar
        </button>
      </div>
    </div>
  );

  const paginacion = sortedTransactions.length > ITEMS_PER_PAGE && (
    <div className="tx-pagination">
      <span>
        {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(sortedTransactions.length, page * ITEMS_PER_PAGE)} de{' '}
        {sortedTransactions.length}
      </span>
      <div className="tx-pagination__controls">
        <span className="hide-mobile">Página {page} de {totalPages}</span>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setCurrentPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setCurrentPage(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  /* ─────────────────────────────── celular ─────────────────────────────── */

  if (isMobile) {
    return (
      <div className="tx-cards">
        {currentData.map(item => {
          const esGasto = item.tipo === 'Gasto';
          const enBorrado = activeDeleteId === item.id;

          return (
            <article key={item.id} className={`card tx-card ${enBorrado ? 'is-deleting' : ''}`}>
              <div className="tx-card__top">
                <div className="tx-card__main">
                  <strong className="tx-card__categoria">{item.categoria}</strong>
                  {item.descripcion && <p className="tx-card__desc">{item.descripcion}</p>}
                </div>
                <span className={`tx-card__importe ${esGasto ? 'is-gasto' : 'is-ingreso'}`}>
                  {esGasto ? '−' : '+'}
                  {formatCurrency(Math.abs(item.importe))}
                </span>
              </div>

              <div className="tx-card__meta">
                <span>{format(item.fecha, 'dd MMM yyyy', { locale: es })}</span>
                <span>·</span>
                <span>{item.canal}</span>
                {item.estado_pago === 'Pendiente' && <span className="badge badge-pending">Pendiente</span>}
              </div>

              {enBorrado ? (
                confirmacionBorrado(item)
              ) : (
                <div className="tx-card__actions">
                  <button type="button" onClick={() => onRepeat(item)}>
                    <Copy size={15} /> Repetir
                  </button>
                  <button type="button" onClick={() => onEdit(item)}>
                    <Pencil size={15} /> Editar
                  </button>
                  <button type="button" className="is-danger" onClick={() => setDeletingId(item.id)}>
                    <Trash2 size={15} /> Eliminar
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {paginacion}
      </div>
    );
  }

  /* ────────────────────────────── escritorio ───────────────────────────── */

  return (
    <div className="card tx-table-wrapper">
      <div style={{ overflowX: 'auto' }}>
        <table className="tx-table">
          <thead>
            <tr>
              <th onClick={() => requestSort('fecha')} scope="col">
                Fecha <ChevronsUpDown size={12} /> {sortIndicator('fecha')}
              </th>
              <th scope="col">Tipo</th>
              <th onClick={() => requestSort('categoria')} scope="col">
                Categoría <ChevronsUpDown size={12} /> {sortIndicator('categoria')}
              </th>
              <th onClick={() => requestSort('canal')} scope="col">
                Canal <ChevronsUpDown size={12} /> {sortIndicator('canal')}
              </th>
              <th onClick={() => requestSort('importe')} scope="col" style={{ textAlign: 'right' }}>
                Importe <ChevronsUpDown size={12} /> {sortIndicator('importe')}
              </th>
              <th scope="col">Estado</th>
              <th scope="col">Descripción</th>
              <th scope="col" style={{ textAlign: 'center', cursor: 'default' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {currentData.map(item => {
              const esGasto = item.tipo === 'Gasto';
              const enBorrado = activeDeleteId === item.id;

              return (
                <React.Fragment key={item.id}>
                  <tr className={enBorrado ? 'is-deleting' : ''}>
                    <td>{format(item.fecha, 'dd MMM yyyy', { locale: es })}</td>
                    <td>
                      <span className={esGasto ? 'badge-expense' : 'badge-income'}>{item.tipo}</span>
                    </td>
                    <td>{item.categoria}</td>
                    <td>{item.canal}</td>
                    <td className={`tx-table__importe ${esGasto ? 'is-gasto' : 'is-ingreso'}`}>
                      {esGasto ? '−' : '+'}
                      {formatCurrency(Math.abs(item.importe))}
                    </td>
                    <td>
                      <span className={`badge ${item.estado_pago === 'Pagado' ? 'badge-paid' : 'badge-pending'}`}>
                        {item.estado_pago}
                      </span>
                    </td>
                    <td className="tx-table__desc" title={item.descripcion}>
                      {item.descripcion || '—'}
                    </td>
                    <td>
                      <div className="tx-table__actions">
                        <button
                          type="button"
                          title="Repetir"
                          aria-label={`Repetir movimiento de ${item.categoria}`}
                          onClick={() => onRepeat(item)}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          title="Editar"
                          aria-label={`Editar movimiento de ${item.categoria}`}
                          onClick={() => {
                            setDeletingId(null);
                            onEdit(item);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          title={enBorrado ? 'Cancelar' : 'Eliminar'}
                          aria-label={`Eliminar movimiento de ${item.categoria}`}
                          onClick={() => setDeletingId(enBorrado ? null : item.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {enBorrado && (
                    <tr className="is-deleting">
                      <td colSpan={8}>{confirmacionBorrado(item)}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {paginacion}
    </div>
  );
};

export default TransactionsTable;
