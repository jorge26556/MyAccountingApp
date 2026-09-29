import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronDown, ChevronRight, ChevronUp, Plus, RotateCcw, ShoppingCart } from 'lucide-react';
import type { ShoppingItem, ShoppingList } from '../types';
import { categoriaPorDefecto, resumenLista } from '../lib/listas';
import { formatCurrency } from '../lib/format';
import { errorMessage, useToast } from '../lib/toast';

interface ListasPanelProps {
  listas: ShoppingList[];
  items: ShoppingItem[];
  categorias: string[];
  cambiosSinSubir: number;
  onCrear: (nombre: string, categoria: string) => Promise<void>;
  onRepetir: (lista: ShoppingList) => Promise<void>;
}

/**
 * La pestaña Lista: las listas abiertas arriba y el historial de compras abajo.
 *
 * Cada lista va ligada a una categoria de gasto. Al terminarla, el valor del
 * recibo se registra como un gasto de esa categoria: la lista deja de ser una
 * nota suelta y pasa a alimentar el presupuesto y las graficas.
 */
const ListasPanel: React.FC<ListasPanelProps> = ({
  listas,
  items,
  categorias,
  cambiosSinSubir,
  onCrear,
  onRepetir,
}) => {
  const toast = useToast();
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [form, setForm] = useState(() => {
    const categoria = categoriaPorDefecto(categorias);
    return { nombre: categoria || 'Mercado', categoria };
  });

  const itemsPorLista = useMemo(() => {
    const mapa = new Map<string, ShoppingItem[]>();
    items.forEach(item => {
      const actuales = mapa.get(item.list_id) ?? [];
      actuales.push(item);
      mapa.set(item.list_id, actuales);
    });
    return mapa;
  }, [items]);

  const abiertas = listas.filter(lista => lista.estado === 'abierta');
  const completadas = listas
    .filter(lista => lista.estado === 'completada')
    .sort(
      (a, b) =>
        (b.completada_en ?? b.created_at).getTime() - (a.completada_en ?? a.created_at).getTime()
    );

  const abrirFormulario = () => {
    const categoria = form.categoria || categoriaPorDefecto(categorias);
    setForm({ nombre: categoria || 'Mercado', categoria });
    setCreando(true);
  };

  const handleCrear = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.nombre.trim() || !form.categoria || guardando) return;
    setGuardando(true);
    try {
      await onCrear(form.nombre, form.categoria);
      setCreando(false);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo crear la lista'));
    } finally {
      setGuardando(false);
    }
  };

  const handleRepetir = async (lista: ShoppingList) => {
    try {
      await onRepetir(lista);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo repetir la lista'));
    }
  };

  return (
    <section className="listas">
      <div className="deudas__head">
        <h2>
          <ShoppingCart size={19} />
          Lista
        </h2>
        {!creando && (
          <button type="button" className="deudas__nueva" onClick={abrirFormulario}>
            <Plus size={14} />
            Nueva lista
          </button>
        )}
      </div>

      {cambiosSinSubir > 0 && (
        <p className="listas__aviso">
          {cambiosSinSubir === 1 ? '1 cambio guardado' : `${cambiosSinSubir} cambios guardados`} en
          el teléfono. Se subirán solos cuando vuelva la señal.
        </p>
      )}

      {creando && (
        <form className="listas__nueva" onSubmit={handleCrear}>
          <label>
            <span>Nombre</span>
            <input
              type="text"
              value={form.nombre}
              placeholder="Ej: Mercado de la semana"
              onChange={event => setForm(prev => ({ ...prev, nombre: event.target.value }))}
              autoFocus
              required
            />
          </label>
          <label>
            <span>Categoría del gasto</span>
            <select
              value={form.categoria}
              onChange={event => setForm(prev => ({ ...prev, categoria: event.target.value }))}
              required
            >
              {[...categorias]
                .sort((a, b) => a.localeCompare(b))
                .map(categoria => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
            </select>
          </label>
          <div className="deuda__confirm-acciones">
            <button
              type="submit"
              className="tx-confirm__yes is-primary"
              disabled={!form.nombre.trim() || !form.categoria || guardando}
            >
              {guardando ? 'Creando...' : 'Crear lista'}
            </button>
            <button type="button" className="tx-confirm__no" onClick={() => setCreando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {abiertas.length === 0 && !creando ? (
        <p className="deudas__vacio">
          Arma la lista antes de salir —pan, leche, huevos—, táchala en el supermercado y al final
          anota lo que pagaste: queda registrado como gasto en la categoría de la lista.
        </p>
      ) : (
        <ul className="listas__abiertas">
          {abiertas.map(lista => {
            const resumen = resumenLista(itemsPorLista.get(lista.id) ?? []);
            const porcentaje = resumen.total > 0 ? (resumen.comprados / resumen.total) * 100 : 0;
            return (
              <li key={lista.id}>
                <Link to={`/lista/${lista.id}`} className="lista-card">
                  <div className="lista-card__top">
                    <div>
                      <strong>{lista.nombre}</strong>
                      <span className="lista-card__categoria">{lista.categoria}</span>
                    </div>
                    <ChevronRight size={18} />
                  </div>
                  {resumen.total > 0 && (
                    <div className="deuda__barra">
                      <div className="deuda__fill" style={{ width: `${porcentaje}%` }} />
                    </div>
                  )}
                  <div className="deuda__meta">
                    <span>
                      {resumen.total === 0
                        ? 'Vacía'
                        : `${resumen.comprados} de ${resumen.total} en el carrito`}
                    </span>
                    {resumen.estimado > 0 && <span>≈ {formatCurrency(resumen.estimado)}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {completadas.length > 0 && (
        <>
          <button
            type="button"
            className="deuda__toggle listas__historial-toggle"
            aria-expanded={verHistorial}
            onClick={() => setVerHistorial(valor => !valor)}
          >
            {verHistorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {verHistorial ? 'Ocultar compras anteriores' : `Compras anteriores (${completadas.length})`}
          </button>

          {verHistorial && (
            <ul className="deuda__historial listas__historial">
              {completadas.map(lista => (
                <li key={lista.id}>
                  <Link to={`/lista/${lista.id}`}>
                    <strong>{lista.nombre}</strong>
                    <span>
                      {format(lista.completada_en ?? lista.created_at, 'd MMM yyyy', { locale: es })} ·{' '}
                      {lista.categoria}
                    </span>
                  </Link>
                  <div className="listas__historial-acciones">
                    {lista.total !== null && <span>{formatCurrency(lista.total)}</span>}
                    <button
                      type="button"
                      onClick={() => handleRepetir(lista)}
                      aria-label={`Repetir ${lista.nombre}`}
                      title="Repetir lista"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};

export default ListasPanel;
