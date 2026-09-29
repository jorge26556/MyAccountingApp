import React, { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Check, Pencil, Plus, RotateCcw, ShoppingCart, Trash2, X } from 'lucide-react';
import type { Account, ShoppingItem, ShoppingList } from '../types';
import type { EstadoPresupuesto } from '../lib/analytics';
import { ordenarItems, resumenLista, sugerirItems, type CambiosItem } from '../lib/listas';
import { esIdLocal } from '../lib/offline';
import { formatCurrency } from '../lib/format';
import { errorMessage, useToast } from '../lib/toast';
import TerminarCompraModal, { type TerminarCompraInput } from './TerminarCompraModal';

export interface NuevoItemInput {
  nombre: string;
  cantidad: string;
  precio: number | null;
}

interface ListaDetalleProps {
  listas: ShoppingList[];
  items: ShoppingItem[];
  categorias: string[];
  accounts: Account[];
  presupuestos: EstadoPresupuesto[];
  /** Mientras carga, una lista que no esta todavia no es una lista borrada. */
  cargando: boolean;
  onAgregar: (lista: ShoppingList, item: NuevoItemInput) => Promise<void>;
  onActualizarItem: (item: ShoppingItem, cambios: CambiosItem) => void;
  onBorrarItem: (item: ShoppingItem) => void;
  onEditarLista: (lista: ShoppingList, cambios: Pick<ShoppingList, 'nombre' | 'categoria'>) => Promise<void>;
  onBorrarLista: (lista: ShoppingList) => Promise<void>;
  onRepetir: (lista: ShoppingList) => Promise<void>;
  onTerminar: (input: TerminarCompraInput) => Promise<void>;
}

/** "5000", "5.000" y "" (sin precio). */
const leerPrecio = (texto: string): number | null => {
  const limpio = texto.replace(/[.\s$]/g, '').replace(',', '.');
  if (!limpio) return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
};

/**
 * Una lista, pensada para usarse con una mano dentro del supermercado.
 *
 * Toda la fila del ítem se puede tocar para tacharlo: un checkbox de 16px es
 * un blanco imposible con el carrito en la otra mano. Lo tachado baja a "En el
 * carrito" para que arriba quede solo lo que falta.
 */
const ListaDetalle: React.FC<ListaDetalleProps> = ({
  listas,
  items,
  categorias,
  accounts,
  presupuestos,
  cargando,
  onAgregar,
  onActualizarItem,
  onBorrarItem,
  onEditarLista,
  onBorrarLista,
  onRepetir,
  onTerminar,
}) => {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const nombreRef = useRef<HTMLInputElement>(null);

  const lista = listas.find(item => item.id === id);
  const propios = useMemo(() => items.filter(item => item.list_id === id), [items, id]);

  const [nuevo, setNuevo] = useState({ nombre: '', cantidad: '', precio: '' });
  const [agregando, setAgregando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState({ nombre: '', cantidad: '', precio: '' });
  const [editandoLista, setEditandoLista] = useState(false);
  const [datosLista, setDatosLista] = useState({ nombre: '', categoria: '' });
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [terminando, setTerminando] = useState(false);

  // El historial para sugerir: los ítems de las OTRAS listas, de la mas
  // reciente a la mas antigua.
  const historial = useMemo(() => {
    const fechaDe = new Map(listas.map(item => [item.id, item.created_at.getTime()]));
    return items
      .filter(item => item.list_id !== id)
      .sort((a, b) => (fechaDe.get(b.list_id) ?? 0) - (fechaDe.get(a.list_id) ?? 0));
  }, [items, listas, id]);

  const sugerencias = useMemo(() => sugerirItems(historial, propios), [historial, propios]);

  if (!lista) {
    if (cargando) return null;
    return <Navigate to="/lista" replace />;
  }

  const resumen = resumenLista(propios);
  const ordenados = ordenarItems(propios);
  const pendientes = ordenados.filter(item => !item.comprado);
  const comprados = ordenados.filter(item => item.comprado);
  const abierta = lista.estado === 'abierta';
  const presupuesto = presupuestos.find(estado => estado.categoria === lista.categoria);

  const agregar = async (datos: NuevoItemInput): Promise<boolean> => {
    if (!datos.nombre.trim() || agregando) return false;
    setAgregando(true);
    try {
      await onAgregar(lista, datos);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo agregar'));
      return false;
    } finally {
      setAgregando(false);
    }
  };

  const handleAgregar = async (event: React.FormEvent) => {
    event.preventDefault();
    const agregado = await agregar({
      nombre: nuevo.nombre,
      cantidad: nuevo.cantidad,
      precio: leerPrecio(nuevo.precio),
    });
    // Si fallo, lo escrito se queda para reintentar.
    if (!agregado) return;
    setNuevo({ nombre: '', cantidad: '', precio: '' });
    // Se vuelve al nombre: lo normal es dictar la lista de corrido.
    nombreRef.current?.focus();
  };

  const empezarEdicion = (item: ShoppingItem) => {
    setEditandoId(item.id);
    setBorrador({
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio === null ? '' : String(item.precio),
    });
  };

  const guardarEdicion = (event: React.FormEvent, item: ShoppingItem) => {
    event.preventDefault();
    if (!borrador.nombre.trim()) return;
    onActualizarItem(item, {
      nombre: borrador.nombre.trim(),
      cantidad: borrador.cantidad.trim(),
      precio: leerPrecio(borrador.precio),
    });
    setEditandoId(null);
  };

  const guardarLista = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!datosLista.nombre.trim()) return;
    try {
      await onEditarLista(lista, datosLista);
      setEditandoLista(false);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo guardar'));
    }
  };

  const borrarLista = async () => {
    try {
      await onBorrarLista(lista);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo borrar la lista'));
      setConfirmandoBorrado(false);
    }
  };

  const fila = (item: ShoppingItem) => {
    if (editandoId === item.id) {
      return (
        <li key={item.id} className="lista-item is-editando">
          <form className="lista-item__editar" onSubmit={event => guardarEdicion(event, item)}>
            <input
              type="text"
              value={borrador.nombre}
              aria-label="Nombre"
              onChange={event => setBorrador(prev => ({ ...prev, nombre: event.target.value }))}
              autoFocus
              required
            />
            <input
              type="text"
              value={borrador.cantidad}
              placeholder="Cant."
              aria-label="Cantidad"
              onChange={event => setBorrador(prev => ({ ...prev, cantidad: event.target.value }))}
            />
            <input
              type="text"
              inputMode="numeric"
              value={borrador.precio}
              placeholder="$"
              aria-label="Precio estimado"
              onChange={event => setBorrador(prev => ({ ...prev, precio: event.target.value }))}
            />
            <button type="submit" aria-label="Guardar" className="lista-item__icono is-ok">
              <Check size={16} />
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              className="lista-item__icono"
              onClick={() => setEditandoId(null)}
            >
              <X size={16} />
            </button>
          </form>
        </li>
      );
    }

    const detalle = [item.cantidad, item.precio !== null ? formatCurrency(item.precio) : '']
      .filter(Boolean)
      .join(' · ');

    return (
      <li key={item.id} className={`lista-item ${item.comprado ? 'is-comprado' : ''}`}>
        <button
          type="button"
          className="lista-item__marcar"
          disabled={!abierta}
          aria-pressed={item.comprado}
          aria-label={`${item.comprado ? 'Sacar del carrito' : 'Marcar como comprado'}: ${item.nombre}`}
          onClick={() => onActualizarItem(item, { comprado: !item.comprado })}
        >
          <span className="lista-item__check" aria-hidden="true">
            {item.comprado && <Check size={14} />}
          </span>
          <span className="lista-item__texto">
            <span className="lista-item__nombre">{item.nombre}</span>
            {(detalle || esIdLocal(item.id)) && (
              <span className="lista-item__detalle">
                {detalle}
                {esIdLocal(item.id) && <span className="badge badge-local">Sin subir</span>}
              </span>
            )}
          </span>
        </button>
        {abierta && (
          <>
            <button
              type="button"
              className="lista-item__icono"
              aria-label={`Editar ${item.nombre}`}
              onClick={() => empezarEdicion(item)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="lista-item__icono is-danger"
              aria-label={`Quitar ${item.nombre}`}
              onClick={() => onBorrarItem(item)}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </li>
    );
  };

  return (
    <section className="listas lista">
      <Link to="/lista" className="lista__volver">
        <ArrowLeft size={15} /> Listas
      </Link>

      {editandoLista ? (
        <form className="listas__nueva" onSubmit={guardarLista}>
          <label>
            <span>Nombre</span>
            <input
              type="text"
              value={datosLista.nombre}
              onChange={event => setDatosLista(prev => ({ ...prev, nombre: event.target.value }))}
              autoFocus
              required
            />
          </label>
          <label>
            <span>Categoría del gasto</span>
            <select
              value={datosLista.categoria}
              onChange={event => setDatosLista(prev => ({ ...prev, categoria: event.target.value }))}
            >
              {/* La actual aunque ya no exista en Configuración. */}
              {Array.from(new Set([datosLista.categoria, ...categorias]))
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b))
                .map(categoria => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
            </select>
          </label>
          <div className="deuda__confirm-acciones">
            <button type="submit" className="tx-confirm__yes is-primary">
              Guardar
            </button>
            <button type="button" className="tx-confirm__no" onClick={() => setEditandoLista(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="lista__cabecera">
          <div>
            <h2>{lista.nombre}</h2>
            <span className="lista-card__categoria">{lista.categoria}</span>
          </div>
          {abierta && (
            <button
              type="button"
              className="lista-item__icono"
              aria-label="Editar lista"
              onClick={() => {
                setDatosLista({ nombre: lista.nombre, categoria: lista.categoria });
                setEditandoLista(true);
              }}
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
      )}

      {abierta && presupuesto && (
        <p className={`lista__presupuesto ${presupuesto.restante <= 0 ? 'is-excedido' : ''}`}>
          {presupuesto.restante > 0
            ? `Te quedan ${formatCurrency(presupuesto.restante)} de ${lista.categoria} este mes.`
            : `Ya pasaste el presupuesto de ${lista.categoria} este mes.`}
          {presupuesto.restante > 0 && resumen.estimado > presupuesto.restante && (
            <> El estimado de la lista ({formatCurrency(resumen.estimado)}) lo supera.</>
          )}
        </p>
      )}

      {!abierta && (
        <div className="lista__cerrada">
          <p>
            Compraste el{' '}
            {format(lista.completada_en ?? lista.created_at, "d 'de' MMMM", { locale: es })}
            {lista.total !== null && (
              <>
                {' '}por <strong>{formatCurrency(lista.total)}</strong>
              </>
            )}
            .
          </p>
          <button
            type="button"
            className="deudas__nueva"
            onClick={() =>
              onRepetir(lista).catch(err => toast.error(errorMessage(err, 'No se pudo repetir')))
            }
          >
            <RotateCcw size={14} /> Repetir lista
          </button>
        </div>
      )}

      {abierta && (
        <form className="lista__agregar" onSubmit={handleAgregar}>
          <input
            ref={nombreRef}
            type="text"
            list="lista-sugerencias"
            placeholder="Agregar: pan, leche..."
            aria-label="Qué hay que comprar"
            value={nuevo.nombre}
            onChange={event => setNuevo(prev => ({ ...prev, nombre: event.target.value }))}
            autoFocus={propios.length === 0}
          />
          <input
            type="text"
            placeholder="Cant."
            aria-label="Cantidad"
            value={nuevo.cantidad}
            onChange={event => setNuevo(prev => ({ ...prev, cantidad: event.target.value }))}
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="$"
            aria-label="Precio estimado (opcional)"
            value={nuevo.precio}
            onChange={event => setNuevo(prev => ({ ...prev, precio: event.target.value }))}
          />
          <button type="submit" aria-label="Agregar" disabled={!nuevo.nombre.trim() || agregando}>
            <Plus size={18} />
          </button>
          <datalist id="lista-sugerencias">
            {sugerirItems(historial, propios, 40).map(sugerencia => (
              <option key={sugerencia.nombre} value={sugerencia.nombre} />
            ))}
          </datalist>
        </form>
      )}

      {abierta && sugerencias.length > 0 && (
        <div className="lista__sugerencias">
          <span>Lo que sueles comprar</span>
          <div>
            {sugerencias.map(sugerencia => (
              <button
                key={sugerencia.nombre}
                type="button"
                onClick={() =>
                  agregar({
                    nombre: sugerencia.nombre,
                    cantidad: sugerencia.cantidad,
                    precio: sugerencia.precio,
                  })
                }
              >
                <Plus size={12} /> {sugerencia.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {propios.length === 0 ? (
        <p className="deudas__vacio">
          {abierta ? 'La lista está vacía. Escribe arriba lo que hay que comprar.' : 'Esta lista no tenía ítems.'}
        </p>
      ) : (
        <>
          {pendientes.length > 0 && <ul className="lista__items">{pendientes.map(fila)}</ul>}

          {comprados.length > 0 && (
            <div className="deudas__grupo">
              <h3>
                {abierta ? 'En el carrito' : 'Comprado'} ({comprados.length})
              </h3>
              <ul className="lista__items">{comprados.map(fila)}</ul>
            </div>
          )}
        </>
      )}

      {abierta && (
        <div className="lista__pie">
          <div>
            <span>
              {resumen.comprados} de {resumen.total}
            </span>
            {resumen.estimado > 0 && (
              <strong>
                ≈ {formatCurrency(resumen.estimado)}
                {resumen.sinPrecio > 0 && <small> +{resumen.sinPrecio} sin precio</small>}
              </strong>
            )}
          </div>
          <button
            type="button"
            className="primary-action"
            disabled={resumen.comprados === 0}
            title={resumen.comprados === 0 ? 'Tacha lo que compraste primero' : undefined}
            onClick={() => setTerminando(true)}
          >
            <ShoppingCart size={16} /> Terminar compra
          </button>
        </div>
      )}

      <div className="lista__borrar">
        {confirmandoBorrado ? (
          <div className="deuda__confirm">
            <span>
              Se borra la lista y sus ítems.
              {lista.estado === 'completada' && ' El gasto que registraste se conserva en Movimientos.'}
            </span>
            <div className="deuda__confirm-acciones">
              <button type="button" className="tx-confirm__yes" onClick={borrarLista}>
                Sí, borrar
              </button>
              <button type="button" className="tx-confirm__no" onClick={() => setConfirmandoBorrado(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="deuda__toggle is-danger" onClick={() => setConfirmandoBorrado(true)}>
            <Trash2 size={13} /> Borrar lista
          </button>
        )}
      </div>

      {terminando && (
        <TerminarCompraModal
          lista={lista}
          resumen={resumen}
          accounts={accounts}
          presupuesto={presupuesto}
          onClose={() => setTerminando(false)}
          onConfirmar={onTerminar}
        />
      )}
    </section>
  );
};

export default ListaDetalle;
