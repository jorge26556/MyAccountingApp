import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react';
import type { Transaction } from '../types';
import { formatCurrency } from '../lib/format';

interface TransactionsTableProps {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}

type SortKey = 'fecha' | 'importe' | 'categoria' | 'canal';

const ITEMS_PER_PAGE = 15;

const TransactionsTable: React.FC<TransactionsTableProps> = ({ transactions, onEdit, onDelete }) => {
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
   * Estar en la pagina 4 y aplicar un filtro que dejaba 5 resultados mostraba
   * una tabla vacia sin explicacion.
   *
   * La pagina visible se DERIVA en vez de corregirse desde un efecto: un efecto
   * que llama setState provoca un render extra y deja un frame intermedio en
   * blanco. Se acota en lugar de volver siempre a la 1, asi borrar un registro
   * estando en la pagina 3 no te devuelve al principio.
   */
  const page = Math.min(currentPage, totalPages);

  // Si el registro en confirmacion de borrado ya no esta en la lista (se borro,
  // o un filtro lo saco), la confirmacion deja de aplicar.
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
      <div
        className="card"
        style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.95rem' }}
      >
        No hay transacciones en este periodo. Cambia el rango de fechas o agrega la primera.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
              <th onClick={() => requestSort('fecha')} style={thStyle} scope="col">
                Fecha <ChevronsUpDown size={12} /> {sortIndicator('fecha')}
              </th>
              <th style={thStyle} scope="col">Tipo</th>
              <th onClick={() => requestSort('categoria')} style={thStyle} scope="col">
                Categoría <ChevronsUpDown size={12} /> {sortIndicator('categoria')}
              </th>
              <th onClick={() => requestSort('canal')} style={thStyle} scope="col">
                Canal <ChevronsUpDown size={12} /> {sortIndicator('canal')}
              </th>
              <th onClick={() => requestSort('importe')} style={{ ...thStyle, textAlign: 'right' }} scope="col">
                Importe <ChevronsUpDown size={12} /> {sortIndicator('importe')}
              </th>
              <th style={thStyle} scope="col">Estado</th>
              <th style={thStyle} scope="col">Descripción</th>
              <th style={{ ...thStyle, textAlign: 'center', cursor: 'default' }} scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {currentData.map(item => {
              const esGasto = item.tipo === 'Gasto';
              const enBorrado = activeDeleteId === item.id;

              return (
                <React.Fragment key={item.id}>
                  <tr
                    style={{
                      borderBottom: enBorrado ? 'none' : '1px solid var(--border-color)',
                      backgroundColor: enBorrado ? 'rgba(248,81,73,0.05)' : 'transparent',
                      transition: 'background 0.2s',
                    }}
                  >
                    <td style={tdStyle}>{format(item.fecha, 'dd MMM yyyy', { locale: es })}</td>
                    <td style={tdStyle}>
                      <span className={esGasto ? 'badge-expense' : 'badge-income'}>{item.tipo}</span>
                    </td>
                    <td style={tdStyle}>{item.categoria}</td>
                    <td style={tdStyle}>{item.canal}</td>
                    {/* Un gasto y un ingreso se veian identicos: mismo color, sin signo. */}
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: 700,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: esGasto ? 'var(--danger)' : 'var(--success)',
                      }}
                    >
                      {esGasto ? '−' : '+'}
                      {formatCurrency(Math.abs(item.importe))}
                    </td>
                    <td style={tdStyle}>
                      <span className={`badge ${item.estado_pago === 'Pagado' ? 'badge-paid' : 'badge-pending'}`}>
                        {item.estado_pago}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={item.descripcion}
                    >
                      {item.descripcion || '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          title="Editar"
                          aria-label={`Editar transaccion de ${item.categoria}`}
                          onClick={() => {
                            setDeletingId(null);
                            onEdit(item);
                          }}
                          style={editBtnStyle}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          title={enBorrado ? 'Cancelar' : 'Eliminar'}
                          aria-label={`Eliminar transaccion de ${item.categoria}`}
                          onClick={() => setDeletingId(enBorrado ? null : item.id)}
                          style={{
                            ...deleteBtnStyle,
                            backgroundColor: enBorrado ? 'rgba(248,81,73,0.25)' : 'rgba(248,81,73,0.1)',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {enBorrado && (
                    <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(248,81,73,0.06)' }}>
                      <td colSpan={8} style={{ padding: '0.6rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                            ¿Eliminar {formatCurrency(Math.abs(item.importe))} de {item.categoria}? No se puede deshacer.
                          </span>
                          <button
                            onClick={() => {
                              setDeletingId(null);
                              onDelete(item.id);
                            }}
                            style={confirmDeleteBtnStyle}
                          >
                            Sí, eliminar
                          </button>
                          <button onClick={() => setDeletingId(null)} style={cancelBtnStyle}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedTransactions.length > ITEMS_PER_PAGE && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            backgroundColor: 'var(--bg-tertiary)',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {(page - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(sortedTransactions.length, page * ITEMS_PER_PAGE)} de{' '}
            {sortedTransactions.length}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Página {page} de {totalPages}
            </span>
            <button
              disabled={page === 1}
              onClick={() => setCurrentPage(page - 1)}
              style={paginationBtnStyle}
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setCurrentPage(page + 1)}
              style={paginationBtnStyle}
              aria-label="Página siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '1rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

const tdStyle: React.CSSProperties = {
  padding: '0.9rem 1rem',
  fontSize: '0.9rem',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const editBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.55rem',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  backgroundColor: 'rgba(88,166,255,0.1)',
  color: 'var(--accent-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const deleteBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.55rem',
  border: '1px solid rgba(248,81,73,0.3)',
  borderRadius: '6px',
  color: 'var(--danger)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const confirmDeleteBtnStyle: React.CSSProperties = {
  padding: '0.35rem 0.85rem',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'var(--danger)',
  color: '#fff',
  fontWeight: 600,
  fontSize: '0.82rem',
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.35rem 0.85rem',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: '0.82rem',
  cursor: 'pointer',
};

const paginationBtnStyle: React.CSSProperties = {
  padding: '0.5rem',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

export default TransactionsTable;
