import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeftRight, CreditCard, MinusCircle, PlusCircle, Save, X, Zap } from 'lucide-react';
import type { Account, PaymentStatus, Transaction, TransactionType } from '../types';
import { toDateString, today } from '../lib/dates';
import { cuentasActivas } from '../lib/accounts';
import { MAX_CUOTAS, MIN_CUOTAS, planDeCuotas } from '../lib/cuotas';
import {
  categoriasPorUso,
  descripcionesFrecuentes,
  plantillasFrecuentes,
  sugerirDesdeDescripcion,
  type Plantilla,
} from '../lib/sugerencias';
import { formatCurrency } from '../lib/format';
import { errorMessage, useToast } from '../lib/toast';

export interface TransferInput {
  origen: string;
  destino: string;
  importe: number;
  fecha: Date;
  descripcion: string;
}

export interface CompraInput {
  total: number;
  cuotas: number;
  primeraFecha: Date;
  categoria: string;
  descripcion: string;
  account_id: string | null;
  primeraPagada: boolean;
}

interface TransactionModalProps {
  categories: string[];
  accounts: Account[];
  /** Historial completo: de ahi salen las plantillas y las sugerencias. */
  transactions: Transaction[];
  hayCuotas: boolean;
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id' | 'user_id'>) => Promise<void>;
  onTransfer: (input: TransferInput) => Promise<void>;
  onCompra: (input: CompraInput) => Promise<void>;
  editingTransaction?: Transaction;
  /** Movimiento del cual copiar los datos al crear uno nuevo ("repetir"). */
  prefill?: Transaction;
}

type Modo = TransactionType | 'Transferencia' | 'Cuotas';

/** Cuantas categorias se muestran como chips antes de ofrecer la lista larga. */
const CHIPS_VISIBLES = 6;

const TransactionModal: React.FC<TransactionModalProps> = ({
  categories,
  accounts,
  transactions,
  hayCuotas,
  onClose,
  onSave,
  onTransfer,
  onCompra,
  editingTransaction,
  prefill,
}) => {
  const toast = useToast();
  const isEditMode = Boolean(editingTransaction);
  const importeRef = useRef<HTMLInputElement>(null);

  // Al editar se parte del movimiento real; al repetir, de una copia con la
  // fecha de hoy (repetir el arriendo del mes pasado significa registrarlo hoy,
  // no volver a registrarlo con la fecha vieja).
  const base = editingTransaction ?? prefill;

  const disponibles = useMemo(() => cuentasActivas(accounts), [accounts]);

  const [loading, setLoading] = useState(false);
  const [guardadas, setGuardadas] = useState(0);
  const [modo, setModo] = useState<Modo>((base?.tipo ?? 'Gasto') as Modo);
  const [verTodasCategorias, setVerTodasCategorias] = useState(false);
  /** Si el usuario ya eligio categoria a mano, la sugerencia no la pisa. */
  const [categoriaTocada, setCategoriaTocada] = useState(Boolean(base));
  const [sugerenciaAplicada, setSugerenciaAplicada] = useState(false);

  const tipoActual: TransactionType = modo === 'Ingreso' ? 'Ingreso' : 'Gasto';

  const selectableCategories = useMemo(() => {
    const current = base?.categoria?.trim();
    const merged = current && !categories.includes(current) ? [current, ...categories] : categories;
    return merged.filter(Boolean);
  }, [categories, base?.categoria]);

  /**
   * Las categorias que mas usas primero. Con veinte categorias en orden
   * alfabetico, "Mercado" queda a mitad de lista aunque sea la de todos los
   * dias.
   */
  const categoriasOrdenadas = useMemo(
    () => categoriasPorUso(transactions, selectableCategories, tipoActual),
    [transactions, selectableCategories, tipoActual]
  );

  const plantillas = useMemo(() => plantillasFrecuentes(transactions), [transactions]);
  const descripciones = useMemo(() => descripcionesFrecuentes(transactions), [transactions]);

  const [formData, setFormData] = useState({
    fecha: toDateString(editingTransaction?.fecha ?? today()),
    categoria: base?.categoria ?? categoriasOrdenadas[0] ?? '',
    importe: base ? String(Math.abs(base.importe)) : '',
    estado_pago: (base?.estado_pago ?? 'Pagado') as PaymentStatus,
    descripcion: base?.descripcion ?? '',
    account_id: base?.account_id ?? disponibles[0]?.id ?? '',
    destino: disponibles[1]?.id ?? '',
    cuotas: '12',
    primeraPagada: 'no',
  });

  const set = (key: keyof typeof formData, value: string) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  // Cerrar con Escape es lo que espera cualquiera frente a un modal.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, loading]);

  const esTransferencia = modo === 'Transferencia';
  const esCuotas = modo === 'Cuotas';
  const importeNumerico = Number(formData.importe);
  const importeValido = Number.isFinite(importeNumerico) && importeNumerico > 0;
  const numeroCuotas = Number(formData.cuotas);
  const cuotasValidas =
    Number.isInteger(numeroCuotas) && numeroCuotas >= MIN_CUOTAS && numeroCuotas <= MAX_CUOTAS;
  const sinCategorias = categoriasOrdenadas.length === 0;
  const sinCuentas = disponibles.length === 0;
  const cuentasDistintas = formData.account_id !== formData.destino;

  const puedeGuardar =
    importeValido &&
    !loading &&
    !sinCuentas &&
    (esTransferencia
      ? disponibles.length >= 2 && Boolean(formData.destino) && cuentasDistintas
      : esCuotas
        ? !sinCategorias && cuotasValidas
        : !sinCategorias);

  /* ─────────────────────── plantillas y sugerencias ─────────────────────── */

  const aplicarPlantilla = (plantilla: Plantilla) => {
    setModo(plantilla.tipo);
    setCategoriaTocada(true);
    setSugerenciaAplicada(false);
    setFormData(prev => ({
      ...prev,
      categoria: plantilla.categoria,
      importe: String(plantilla.importe),
      descripcion: plantilla.descripcion,
      account_id: plantilla.account_id ?? prev.account_id,
      estado_pago: 'Pagado',
    }));
  };

  /**
   * Al escribir una descripcion ya usada, se rellena lo que pusiste la ultima
   * vez. Solo rellena huecos: nunca pisa una categoria que elegiste a mano ni
   * un importe ya escrito. Y se avisa en pantalla, porque un campo que se
   * llena solo sin explicacion se siente como un error de la app.
   */
  const alCambiarDescripcion = (valor: string) => {
    if (esTransferencia || esCuotas || isEditMode) {
      set('descripcion', valor);
      return;
    }

    const sugerencia = sugerirDesdeDescripcion(transactions, valor);
    if (!sugerencia) {
      set('descripcion', valor);
      setSugerenciaAplicada(false);
      return;
    }

    /**
     * Que se rellena se decide ANTES de tocar el estado, no dentro del updater.
     * React puede ejecutar el updater despues (y en StrictMode lo ejecuta dos
     * veces), asi que una bandera puesta ahi dentro todavia vale `false` al
     * leerla aqui: el aviso de "esto se rellenó solo" nunca aparecia.
     */
    const tomaCategoria = !categoriaTocada && formData.categoria !== sugerencia.categoria;
    const tomaImporte = !formData.importe.trim();

    setFormData(prev => ({
      ...prev,
      descripcion: valor,
      ...(tomaCategoria ? { categoria: sugerencia.categoria } : {}),
      ...(tomaImporte ? { importe: String(sugerencia.importe) } : {}),
    }));

    if (tomaCategoria) setModo(sugerencia.tipo);
    setSugerenciaAplicada(tomaCategoria || tomaImporte);
  };

  /* ───────────────────────────── guardado ──────────────────────────────── */

  const guardar = async () => {
    const [year, month, day] = formData.fecha.split('-').map(Number);
    const fecha = new Date(year, month - 1, day);

    if (esTransferencia) {
      await onTransfer({
        origen: formData.account_id,
        destino: formData.destino,
        importe: Math.abs(importeNumerico),
        fecha,
        descripcion: formData.descripcion.trim(),
      });
      return;
    }

    if (esCuotas) {
      await onCompra({
        total: Math.abs(importeNumerico),
        cuotas: numeroCuotas,
        primeraFecha: fecha,
        categoria: formData.categoria,
        descripcion: formData.descripcion.trim(),
        account_id: formData.account_id || null,
        primeraPagada: formData.primeraPagada === 'si',
      });
      return;
    }

    await onSave({
      fecha,
      tipo: tipoActual,
      categoria: formData.categoria,
      importe: Math.abs(importeNumerico),
      estado_pago: formData.estado_pago,
      descripcion: formData.descripcion.trim(),
      account_id: formData.account_id || null,
      transfer_group: null,
      compra_id: null,
      cuota_numero: null,
      cuota_total: null,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeGuardar) return;

    setLoading(true);
    try {
      await guardar();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar el movimiento'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Registrar varios gastos de una misma salida (mercado, gasolina, café)
   * obligaba a reabrir el modal y volver a elegir fecha y cuenta cada vez.
   * Esto conserva fecha, tipo, cuenta y estado —lo que casi siempre se repite—
   * y limpia importe, categoría y descripción.
   */
  const handleSaveAndNew = async () => {
    if (!puedeGuardar) return;

    setLoading(true);
    try {
      await guardar();
      setGuardadas(total => total + 1);
      setFormData(prev => ({ ...prev, importe: '', descripcion: '' }));
      setSugerenciaAplicada(false);
      importeRef.current?.focus();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo guardar el movimiento'));
    } finally {
      setLoading(false);
    }
  };

  /* ────────────────────────────── render ───────────────────────────────── */

  const titulo = isEditMode
    ? 'Editar movimiento'
    : esTransferencia
      ? 'Nueva transferencia'
      : esCuotas
        ? 'Compra a cuotas'
        : prefill
          ? 'Repetir movimiento'
          : 'Nuevo movimiento';

  const modos: Array<{ id: Modo; label: string; color: string; icon: React.ElementType }> = [
    { id: 'Ingreso', label: 'Ingreso', color: 'var(--success)', icon: PlusCircle },
    { id: 'Gasto', label: 'Gasto', color: 'var(--danger)', icon: MinusCircle },
    { id: 'Transferencia', label: 'Entre cuentas', color: 'var(--accent-primary)', icon: ArrowLeftRight },
    ...(hayCuotas
      ? [{ id: 'Cuotas' as Modo, label: 'A cuotas', color: 'var(--accent-secondary)', icon: CreditCard }]
      : []),
  ];

  // Chips de categoria: las mas usadas, mas la elegida si se quedo fuera.
  const chipsCategorias = useMemo(() => {
    if (verTodasCategorias) return categoriasOrdenadas;
    const top = categoriasOrdenadas.slice(0, CHIPS_VISIBLES);
    if (formData.categoria && !top.includes(formData.categoria)) {
      return [formData.categoria, ...top.slice(0, CHIPS_VISIBLES - 1)];
    }
    return top;
  }, [categoriasOrdenadas, verTodasCategorias, formData.categoria]);

  const previsualizacion = useMemo(() => {
    if (!esCuotas || !importeValido || !cuotasValidas) return null;
    const [year, month, day] = formData.fecha.split('-').map(Number);
    try {
      const plan = planDeCuotas({
        total: Math.abs(importeNumerico),
        cuotas: numeroCuotas,
        primeraFecha: new Date(year, month - 1, day),
      });
      const primera = plan[0];
      const ultima = plan[plan.length - 1];
      return { primera, ultima, distintas: primera.importe !== ultima.importe };
    } catch {
      return null;
    }
  }, [esCuotas, importeValido, cuotasValidas, formData.fecha, importeNumerico, numeroCuotas]);

  const mostrarPlantillas = !isEditMode && !prefill && plantillas.length > 0 && !esTransferencia;

  return (
    <div
      style={overlayStyle}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={titulo} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
              {titulo}
            </h3>
            {guardadas > 0 && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--success)' }}>
                {guardadas} {guardadas === 1 ? 'movimiento guardado' : 'movimientos guardados'} en esta sesión
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={closeBtnStyle}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Las transferencias y las cuotas no se editan desde aqui: son
              varias filas enlazadas y cambiar una sola las descuadra. */}
          {!isEditMode && (
            <div className="modal-modes">
              {modos.map(({ id, label, color, icon: Icon }) => {
                const active = modo === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setModo(id)}
                    className="modal-mode"
                    style={{
                      borderColor: active ? color : 'var(--border-color)',
                      backgroundColor: active ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
                      color: active ? color : 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Lo que repites, a un toque. Sale de tu propio historial: no hay
              nada que configurar ni que mantener. */}
          {mostrarPlantillas && (
            <div className="modal-plantillas">
              <span className="modal-plantillas__titulo">
                <Zap size={13} />
                Lo de siempre
              </span>
              <div className="modal-plantillas__lista">
                {plantillas.map(plantilla => (
                  <button
                    key={plantilla.key}
                    type="button"
                    className="modal-plantilla"
                    onClick={() => aplicarPlantilla(plantilla)}
                  >
                    <strong>{plantilla.descripcion}</strong>
                    <span>
                      {plantilla.tipo === 'Gasto' ? '−' : '+'}
                      {formatCurrency(plantilla.importe)} · {plantilla.categoria}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* El importe primero: es el unico dato que siempre hay que teclear.
              Todo lo demas se puede dejar como viene. */}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tx-importe">
              {esCuotas ? 'Total de la compra (COP)' : 'Importe (COP)'}
            </label>
            <input
              ref={importeRef}
              id="tx-importe"
              type="number"
              inputMode="numeric"
              placeholder="0"
              min="1"
              step="1"
              value={formData.importe}
              onChange={event => set('importe', event.target.value)}
              required
              autoFocus
              className="modal-importe"
            />
            {/* Confirmacion visual de la cifra: evita el cero de mas al teclear. */}
            <span style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: importeValido ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {importeValido ? formatCurrency(importeNumerico) : 'Escribe un monto mayor que cero'}
            </span>
          </div>

          {/**
           * Categoria como chips y no como <select>.
           *
           * En el celular un select abre el selector del sistema: tocar, rodar,
           * elegir, confirmar. Los chips son un solo toque, y con las
           * categorias ordenadas por uso la que buscas casi siempre esta a la
           * vista. "Más…" despliega el resto, asi que ninguna queda
           * inalcanzable ni con el teclado ni con lector de pantalla: cada chip
           * es un boton de verdad con su aria-pressed.
           */}
          {!esTransferencia && (
            <div style={fieldStyle}>
              <span style={labelStyle} id="tx-categoria-label">Categoría</span>

              {sinCategorias ? (
                <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                  Agrega al menos una categoría en Configuración para poder guardar.
                </p>
              ) : (
                <div className="modal-chips" role="group" aria-labelledby="tx-categoria-label">
                  {chipsCategorias.map(categoria => (
                    <button
                      key={categoria}
                      type="button"
                      aria-pressed={formData.categoria === categoria}
                      className={`badge-btn ${formData.categoria === categoria ? 'active' : ''}`}
                      onClick={() => {
                        setCategoriaTocada(true);
                        setSugerenciaAplicada(false);
                        set('categoria', categoria);
                      }}
                    >
                      {categoria}
                    </button>
                  ))}
                  {!verTodasCategorias && categoriasOrdenadas.length > chipsCategorias.length && (
                    <button
                      type="button"
                      className="badge-btn"
                      onClick={() => setVerTodasCategorias(true)}
                    >
                      Más…
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tx-descripcion">Descripción</label>
            <input
              id="tx-descripcion"
              type="text"
              list="tx-descripciones"
              placeholder={esCuotas ? 'Ej: Nevera' : 'Ej: Almuerzo, gasolina...'}
              value={formData.descripcion}
              onChange={event => alCambiarDescripcion(event.target.value)}
              style={inputStyle}
            />
            <datalist id="tx-descripciones">
              {descripciones.map(texto => (
                <option key={texto} value={texto} />
              ))}
            </datalist>
            {sugerenciaAplicada && (
              <span style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--accent-primary)' }}>
                Categoría y monto tomados de la última vez que registraste esto.
              </span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="tx-fecha">
              {esCuotas ? 'Fecha de la primera cuota' : 'Fecha'}
            </label>
            <input
              id="tx-fecha"
              type="date"
              value={formData.fecha}
              onChange={event => set('fecha', event.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {esTransferencia ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="tx-origen">Desde</label>
                <select
                  id="tx-origen"
                  value={formData.account_id}
                  onChange={event => set('account_id', event.target.value)}
                  style={inputStyle}
                >
                  {disponibles.map(cuenta => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="tx-destino">Hacia</label>
                <select
                  id="tx-destino"
                  value={formData.destino}
                  onChange={event => set('destino', event.target.value)}
                  style={inputStyle}
                >
                  {disponibles.map(cuenta => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="tx-cuenta">Cuenta</label>
                <select
                  id="tx-cuenta"
                  value={formData.account_id}
                  onChange={event => set('account_id', event.target.value)}
                  disabled={sinCuentas}
                  style={{ ...inputStyle, opacity: sinCuentas ? 0.65 : 1 }}
                >
                  {sinCuentas ? (
                    <option value="">Sin cuentas disponibles</option>
                  ) : (
                    disponibles.map(cuenta => (
                      <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>
                    ))
                  )}
                </select>
              </div>

              {esCuotas ? (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="tx-cuotas">Número de cuotas</label>
                  <input
                    id="tx-cuotas"
                    type="number"
                    inputMode="numeric"
                    min={MIN_CUOTAS}
                    max={MAX_CUOTAS}
                    step="1"
                    value={formData.cuotas}
                    onChange={event => set('cuotas', event.target.value)}
                    style={inputStyle}
                  />
                </div>
              ) : (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="tx-estado">Estado</label>
                  <select
                    id="tx-estado"
                    value={formData.estado_pago}
                    onChange={event => set('estado_pago', event.target.value)}
                    style={inputStyle}
                  >
                    <option value="Pagado">Pagado</option>
                    <option value="Pendiente">Pendiente</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {esCuotas && (
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="tx-primera">¿La primera cuota ya se pagó?</label>
              <select
                id="tx-primera"
                value={formData.primeraPagada}
                onChange={event => set('primeraPagada', event.target.value)}
                style={inputStyle}
              >
                <option value="no">No, todas quedan pendientes</option>
                <option value="si">Sí, la cobraron al comprar</option>
              </select>
            </div>
          )}

          {previsualizacion && (
            <div className="modal-preview">
              <strong>
                {numeroCuotas} cuotas de {formatCurrency(previsualizacion.primera.importe)}
              </strong>
              {/* Se avisa del ajuste: si no, el usuario ve un peso de
                  diferencia en la ultima cuota y cree que la app calcula mal. */}
              {previsualizacion.distintas && (
                <span>
                  La última es de {formatCurrency(previsualizacion.ultima.importe)} para que la suma
                  dé exactamente el total.
                </span>
              )}
              <span>
                De {format(previsualizacion.primera.fecha, "MMM yyyy", { locale: es })} a{' '}
                {format(previsualizacion.ultima.fecha, "MMM yyyy", { locale: es })}. Cada cuota
                aparecerá en Próximos pagos cuando le toque.
              </span>
            </div>
          )}

          {formData.estado_pago === 'Pendiente' && !esTransferencia && !esCuotas && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-0.5rem 0 0' }}>
              Un pendiente no mueve el saldo todavía. Aparecerá en Próximos pagos con la fecha que
              le pongas.
            </p>
          )}

          {sinCuentas && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              Crea al menos una cuenta en Configuración → Cuentas para poder registrar movimientos.
            </p>
          )}

          {esTransferencia && disponibles.length < 2 && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              Para transferir necesitas al menos dos cuentas.
            </p>
          )}

          {esTransferencia && disponibles.length >= 2 && !cuentasDistintas && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              El origen y el destino deben ser cuentas distintas.
            </p>
          )}

          {esCuotas && !cuotasValidas && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '-0.25rem' }}>
              El número de cuotas debe estar entre {MIN_CUOTAS} y {MAX_CUOTAS}.
            </p>
          )}

          <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

          <button
            type="submit"
            disabled={!puedeGuardar}
            style={{
              padding: '0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: esTransferencia
                ? 'linear-gradient(90deg, #58a6ff, #bc8cff)'
                : esCuotas
                  ? 'linear-gradient(90deg, #f97316, #bc8cff)'
                  : modo === 'Ingreso'
                    ? 'linear-gradient(90deg, #3fb950, #388bfd)'
                    : 'linear-gradient(90deg, #f85149, #f97316)',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: puedeGuardar ? 'pointer' : 'not-allowed',
              opacity: puedeGuardar ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Save size={17} />
            {loading
              ? 'Guardando...'
              : isEditMode
                ? 'Guardar cambios'
                : esCuotas
                  ? `Crear ${cuotasValidas ? numeroCuotas : ''} cuotas`
                  : 'Guardar y cerrar'}
          </button>

          {!isEditMode && !esTransferencia && !esCuotas && (
            <button
              type="button"
              onClick={handleSaveAndNew}
              disabled={!puedeGuardar}
              className="modal-secondary-action"
            >
              <PlusCircle size={16} />
              Guardar y añadir otra
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
  overflowY: 'auto',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius)',
  padding: '2rem',
  boxShadow: 'var(--shadow-md)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  margin: 'auto',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  padding: '4px',
  borderRadius: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  outline: 'none',
  colorScheme: 'dark',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: '0.4rem',
};

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

export default TransactionModal;
