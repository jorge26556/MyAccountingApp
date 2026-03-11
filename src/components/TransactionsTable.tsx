import React, { useState } from 'react';
import type { Transaction } from '../types';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react';

interface TransactionsTableProps {
  transactions: Transaction[];
  onEdit:   (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}

const TransactionsTable: React.FC<TransactionsTableProps> = ({ transactions, onEdit, onDelete }) => {
  const [currentPage, setCurrentPage]   = useState(1);
  const [deletingId,  setDeletingId]    = useState<string | null>(null);
  const [sortConfig,  setSortConfig]    = useState<{ key: keyof Transaction; direction: 'asc' | 'desc' } | null>({
    key: 'fecha',
    direction: 'desc'
  });

  const itemsPerPage = 10;

  const sortedTransactions = React.useMemo(() => {
    let items = [...transactions];
    if (sortConfig) {
      items.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1  : -1;
        return 0;
      });
    }
    return items;
  }, [transactions, sortConfig]);

  const totalPages  = Math.ceil(sortedTransactions.length / itemsPerPage);
  const currentData = sortedTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage         * itemsPerPage
  );

  const requestSort = (key: keyof Transaction) => {
    const direction: 'asc' | 'desc' =
      sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id === deletingId ? null : id); // toggle confirmation
  };

  const handleDeleteConfirm = (id: string) => {
    setDeletingId(null);
    onDelete(id);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  if (transactions.length === 0) {
    return (
      <div className="card" style={{
        padding: '3rem', textAlign: 'center',
        color: 'var(--text-secondary)', fontSize: '0.95rem'
      }}>
        No hay transacciones. ¡Añade la primera con el botón verde de arriba!
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
              <th onClick={() => requestSort('fecha')}   style={thStyle}>Fecha <ChevronsUpDown size={12}/></th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Canal</th>
              <th onClick={() => requestSort('importe')} style={thStyle}>Importe <ChevronsUpDown size={12}/></th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Descripción</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {currentData.map(item => (
              <React.Fragment key={item.id}>
                <tr style={{
                  borderBottom: deletingId === item.id ? 'none' : '1px solid var(--border-color)',
                  backgroundColor: deletingId === item.id ? 'rgba(248,81,73,0.05)' : 'transparent',
                  transition: 'background 0.2s',
                }}>
                  <td style={tdStyle}>{format(item.fecha, 'dd/MM/yyyy')}</td>
                  <td style={tdStyle}>
                    <span className={item.tipo === 'Ingreso' ? 'badge-income' : 'badge-expense'}>
                      {item.tipo}
                    </span>
                  </td>
                  <td style={tdStyle}>{item.categoria}</td>
                  <td style={tdStyle}>{item.canal}</td>
                  <td style={{ ...tdStyle, fontWeight: '700' }}>{formatCurrency(item.importe)}</td>
                  <td style={tdStyle}>
                    <span className={`badge ${item.estado_pago === 'Pagado' ? 'badge-paid' : 'badge-pending'}`}>
                      {item.estado_pago}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.descripcion}
                  </td>
                  {/* ── Action buttons ── */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        title="Editar"
                        onClick={() => { setDeletingId(null); onEdit(item); }}
                        style={editBtnStyle}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        title={deletingId === item.id ? 'Cancelar' : 'Eliminar'}
                        onClick={() => handleDeleteClick(item.id)}
                        style={{
                          ...deleteBtnStyle,
                          backgroundColor: deletingId === item.id
                            ? 'rgba(248,81,73,0.25)'
                            : 'rgba(248,81,73,0.1)',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* ── Inline delete confirmation row ── */}
                {deletingId === item.id && (
                  <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(248,81,73,0.06)' }}>
                    <td colSpan={8} style={{ padding: '0.6rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem' }}>
                        <span style={{ color: '#f85149', fontWeight: '600' }}>
                          ¿Eliminar esta transacción? Esta acción no se puede deshacer.
                        </span>
                        <button onClick={() => handleDeleteConfirm(item.id)} style={confirmDeleteBtnStyle}>
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
            ))}
          </tbody>
        </table>
      </div>

      {transactions.length > itemsPerPage && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem', backgroundColor: 'var(--bg-tertiary)'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Mostrando {Math.min(transactions.length, (currentPage - 1) * itemsPerPage + 1)}–
            {Math.min(transactions.length, currentPage * itemsPerPage)} de {transactions.length}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)} style={paginationBtnStyle}>
              <ChevronLeft size={16}/>
            </button>
            <button disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)} style={paginationBtnStyle}>
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Styles ─────────────────────────────────────────────────────────────── */
const thStyle: React.CSSProperties = {
  padding: '1rem', fontSize: '0.85rem', fontWeight: '600',
  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.9rem 1rem', fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap',
};

const editBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.55rem', border: '1px solid #30363d', borderRadius: '6px',
  backgroundColor: 'rgba(88,166,255,0.1)', color: '#58a6ff',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: 'background 0.15s',
};

const deleteBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.55rem', border: '1px solid rgba(248,81,73,0.3)', borderRadius: '6px',
  color: '#f85149', cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: 'background 0.15s',
};

const confirmDeleteBtnStyle: React.CSSProperties = {
  padding: '0.3rem 0.85rem', border: 'none', borderRadius: '6px',
  backgroundColor: '#f85149', color: '#fff', fontWeight: '600',
  fontSize: '0.82rem', cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.3rem 0.85rem', border: '1px solid #30363d', borderRadius: '6px',
  backgroundColor: 'transparent', color: 'var(--text-secondary)',
  fontSize: '0.82rem', cursor: 'pointer',
};

const paginationBtnStyle: React.CSSProperties = {
  padding: '0.5rem', border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
  borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
};

export default TransactionsTable;
