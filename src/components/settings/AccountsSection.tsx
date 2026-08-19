import React, { useState } from 'react';
import { Archive, ArchiveRestore, Check, Edit2, Plus, Trash2, X } from 'lucide-react';
import type { Account, AccountType } from '../../types';
import type { SaldoCuenta } from '../../lib/accounts';
import { countTransactionsByAccount } from '../../services/accounts';
import { formatCurrency } from '../../lib/format';
import { errorMessage, useToast } from '../../lib/toast';

interface AccountsSectionProps {
  disponible: boolean;
  saldos: SaldoCuenta[];
  onCreate: (input: { nombre: string; tipo: AccountType; saldoInicial: number }) => Promise<void>;
  onUpdate: (id: string, changes: Partial<Account>) => Promise<void>;
  onDelete: (id: string, reassignTo?: string) => Promise<void>;
}

interface PendingDelete {
  cuenta: Account;
  afectados: number;
  reassignTo: string;
}

const TIPOS: AccountType[] = ['Banco', 'Efectivo', 'Tarjeta', 'Ahorro', 'Otro'];

const AccountsSection: React.FC<AccountsSectionProps> = ({
  disponible,
  saldos,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<AccountType>('Banco');
  const [saldoInicial, setSaldoInicial] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTipo, setEditTipo] = useState<AccountType>('Banco');
  const [editSaldo, setEditSaldo] = useState('');

  const cuentas = saldos.map(item => item.cuenta);

  if (!disponible) {
    return (
      <div className="settings-sections">
        <section className="settings-block settings-block--warning">
          <header className="settings-block__head">
            <h3>Cuentas no disponibles</h3>
            <p>
              Falta ejecutar <code>supabase/003_cuentas_saldos.sql</code> en el SQL Editor de
              Supabase. Mientras tanto la app funciona, pero sin saldos.
            </p>
          </header>
        </section>
      </div>
    );
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate({
        nombre,
        tipo,
        saldoInicial: saldoInicial.trim() === '' ? 0 : Number(saldoInicial),
      });
      toast.success(`Cuenta "${nombre.trim()}" creada`);
      setNombre('');
      setSaldoInicial('');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo crear la cuenta'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (cuenta: Account) => {
    setPendingDelete(null);
    setEditingId(cuenta.id);
    setEditNombre(cuenta.nombre);
    setEditTipo(cuenta.tipo);
    setEditSaldo(String(cuenta.saldoInicial));
  };

  /**
   * El error probable aqui es el 23505 ("ya tienes una cuenta con ese nombre"),
   * y llega despues de que el usuario reescribio los tres campos. Por eso al
   * fallar el formulario NO se cierra: cerrarlo perderia lo escrito y obligaria
   * a empezar de cero para cambiar una letra.
   */
  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    try {
      await onUpdate(id, {
        nombre: editNombre,
        tipo: editTipo,
        saldoInicial: editSaldo.trim() === '' ? 0 : Number(editSaldo),
      });
      toast.success('Cuenta actualizada');
      setEditingId(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar la cuenta'));
    } finally {
      setSaving(false);
    }
  };

  const toggleArchivada = async (cuenta: Account) => {
    try {
      await onUpdate(cuenta.id, { archivada: !cuenta.archivada });
      toast.success(cuenta.archivada ? 'Cuenta reactivada' : 'Cuenta archivada');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar la cuenta'));
    }
  };

  const startDelete = async (cuenta: Account) => {
    try {
      const afectados = await countTransactionsByAccount(cuenta.id);
      const destino = cuentas.find(item => item.id !== cuenta.id)?.id ?? '';
      setEditingId(null);
      setPendingDelete({ cuenta, afectados, reassignTo: afectados > 0 ? destino : '' });
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo verificar la cuenta'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    setSaving(true);
    try {
      const reasignar = pendingDelete.afectados > 0 && pendingDelete.reassignTo;
      await onDelete(pendingDelete.cuenta.id, reasignar ? pendingDelete.reassignTo : undefined);
      toast.success('Cuenta eliminada');
      setPendingDelete(null);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar la cuenta'));
    } finally {
      setSaving(false);
    }
  };

  const saldoInicialNumerico = saldoInicial.trim() === '' ? 0 : Number(saldoInicial);
  const saldoInicialValido = Number.isFinite(saldoInicialNumerico);

  const editSaldoNumerico = editSaldo.trim() === '' ? 0 : Number(editSaldo);
  const edicionValida = Boolean(editNombre.trim()) && Number.isFinite(editSaldoNumerico);

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Nueva cuenta</h3>
          <p>
            Una por cada sitio donde tengas plata: el banco, Nequi, el efectivo, la tarjeta.
          </p>
        </header>

        <form onSubmit={handleCreate}>
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="account-nombre">Nombre</label>
            <input
              id="account-nombre"
              type="text"
              className="input-style"
              placeholder="Ej: Bancolombia, Nequi, Efectivo..."
              value={nombre}
              onChange={event => setNombre(event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="settings-grid-2" style={{ marginTop: '1rem' }}>
            <div className="settings-field">
              <label className="settings-field__label" htmlFor="account-tipo">Tipo</label>
              <select
                id="account-tipo"
                className="input-style"
                value={tipo}
                onChange={event => setTipo(event.target.value as AccountType)}
                disabled={saving}
              >
                {TIPOS.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <label className="settings-field__label" htmlFor="account-saldo">Saldo inicial</label>
              <input
                id="account-saldo"
                type="number"
                inputMode="numeric"
                step="1"
                className="input-style"
                placeholder="0"
                value={saldoInicial}
                onChange={event => setSaldoInicial(event.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <p className="settings-field__hint">
            Lo que hay en la cuenta <strong>hoy</strong>, antes de registrar nada aquí. Sin este
            dato el saldo sería solo el neto de lo que apuntes, no la plata que de verdad tienes.
            Una tarjeta de crédito va en negativo.
          </p>

          <div className="settings-inline" style={{ marginTop: '1rem' }}>
            <button
              type="submit"
              className="primary-action"
              disabled={saving || !nombre.trim() || !saldoInicialValido}
            >
              <Plus size={16} />
              {saving ? 'Guardando...' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Tus cuentas</h3>
          <p>El saldo es el inicial más todo lo pagado que registraste en ella.</p>
        </header>

        <div className="settings-rows">
          {saldos.map(({ cuenta, saldo, movimientos }) => (
            <div key={cuenta.id} className={`settings-row ${cuenta.archivada ? 'is-paused' : ''}`}>
              {editingId === cuenta.id ? (
                <div className="settings-field" style={{ width: '100%' }}>
                  <input
                    type="text"
                    className="input-style"
                    value={editNombre}
                    onChange={event => setEditNombre(event.target.value)}
                    placeholder="Nombre"
                    aria-label="Nombre de la cuenta"
                    disabled={saving}
                  />

                  <div className="settings-grid-2" style={{ marginTop: '0.5rem' }}>
                    <select
                      className="input-style"
                      value={editTipo}
                      onChange={event => setEditTipo(event.target.value as AccountType)}
                      aria-label="Tipo de cuenta"
                      disabled={saving}
                    >
                      {TIPOS.map(item => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      className="input-style"
                      value={editSaldo}
                      onChange={event => setEditSaldo(event.target.value)}
                      placeholder="Saldo inicial"
                      aria-label="Saldo inicial"
                      disabled={saving}
                    />
                  </div>

                  <p className="settings-field__hint">
                    Corregir el saldo inicial mueve el saldo de la cuenta y el total. No crea
                    ningún movimiento ni toca los que ya registraste.
                  </p>

                  <div className="settings-inline" style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => handleSaveEdit(cuenta.id)}
                      disabled={saving || !edicionValida}
                    >
                      <Check size={14} />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      className="settings-link"
                      onClick={() => setEditingId(null)}
                      disabled={saving}
                    >
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{cuenta.nombre}</strong>
                    <p>
                      {cuenta.tipo} · {formatCurrency(saldo)} · {movimientos}{' '}
                      {movimientos === 1 ? 'movimiento' : 'movimientos'}
                      {cuenta.archivada && ' · archivada'}
                    </p>
                  </div>
                  <div className="settings-row__actions">
                    <button
                      type="button"
                      className="ghost-icon-button settings-row__icon"
                      onClick={() => startEdit(cuenta)}
                      title="Editar"
                      aria-label={`Editar ${cuenta.nombre}`}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      className="settings-row__icon"
                      onClick={() => toggleArchivada(cuenta)}
                      title={cuenta.archivada ? 'Reactivar' : 'Archivar'}
                      aria-label={cuenta.archivada ? 'Reactivar cuenta' : 'Archivar cuenta'}
                    >
                      {cuenta.archivada ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() => startDelete(cuenta)}
                      disabled={saving || saldos.length <= 1}
                      title={saldos.length <= 1 ? 'Debe quedar al menos una cuenta' : 'Eliminar'}
                      aria-label="Eliminar cuenta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="settings-field__hint">
          Archivar la deja fuera del formulario pero su saldo sigue contando. Para que deje de
          sumar hay que eliminarla.
        </p>
      </section>

      {pendingDelete && (
        <section className="settings-block settings-block--danger">
          <header className="settings-block__head">
            <h3>Eliminar "{pendingDelete.cuenta.nombre}"</h3>
            <p>
              {pendingDelete.afectados > 0
                ? `${pendingDelete.afectados} movimiento(s) están en esta cuenta. Si no los reasignas seguirán contando como gasto o ingreso pero desaparecerán de todos los saldos, y el total dejará de cuadrar.`
                : 'No hay movimientos en esta cuenta. Se puede eliminar sin efectos.'}
            </p>
            {/* Reasignar mueve los movimientos, pero el saldo inicial se va con
                la cuenta. Sin avisarlo, el total baja y parece un error. */}
            {pendingDelete.cuenta.saldoInicial !== 0 && (
              <p>
                Su saldo inicial de {formatCurrency(pendingDelete.cuenta.saldoInicial)} dejará de
                sumar al total, aunque reasignes los movimientos.
              </p>
            )}
          </header>

          {pendingDelete.afectados > 0 && (
            <div className="settings-field">
              <label className="settings-field__label" htmlFor="reassign-account">
                Mover esos movimientos a
              </label>
              <select
                id="reassign-account"
                className="input-style"
                value={pendingDelete.reassignTo}
                onChange={event =>
                  setPendingDelete({ ...pendingDelete, reassignTo: event.target.value })
                }
              >
                <option value="">No reasignar (dejarlos sin cuenta)</option>
                {cuentas
                  .filter(item => item.id !== pendingDelete.cuenta.id)
                  .map(item => (
                    <option key={item.id} value={item.id}>{item.nombre}</option>
                  ))}
              </select>
            </div>
          )}

          <div className="settings-inline" style={{ marginTop: '1rem' }}>
            <button type="button" className="danger-action" onClick={confirmDelete} disabled={saving}>
              <Trash2 size={15} />
              {saving ? 'Eliminando...' : 'Confirmar'}
            </button>
            <button type="button" className="settings-link" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default AccountsSection;
