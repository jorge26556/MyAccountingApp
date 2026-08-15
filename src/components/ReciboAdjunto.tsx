import React, { useRef, useState } from 'react';
import { Eye, Paperclip, Trash2 } from 'lucide-react';
import type { Transaction } from '../types';
import { ACCEPT_RECIBOS, urlDeRecibo } from '../services/recibos';
import { errorMessage, useToast } from '../lib/toast';

interface ReciboAdjuntoProps {
  transaction: Transaction;
  /** Sin conexión no se sube nada: el archivo no cabe en la cola local. */
  enLinea: boolean;
  onAdjuntar: (transaction: Transaction, archivo: File) => Promise<void>;
  onQuitar: (transaction: Transaction) => Promise<void>;
}

/**
 * La foto del recibo, desde la lista de movimientos.
 *
 * No va en el formulario de alta a proposito: subir un archivo tarda y necesita
 * red, y el formulario esta pensado para que anotar un gasto sean dos toques
 * incluso sin señal. Se adjunta despues, con calma, desde la lista.
 *
 * El archivo se guarda en un bucket privado y se mira con una URL firmada que
 * se pide en el momento: guardar la URL en la base dejaria enlaces muertos a
 * los pocos minutos.
 */
const ReciboAdjunto: React.FC<ReciboAdjuntoProps> = ({
  transaction,
  enLinea,
  onAdjuntar,
  onQuitar,
}) => {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);

  const tieneRecibo = Boolean(transaction.recibo_path);

  const ver = async () => {
    if (!transaction.recibo_path) return;
    setTrabajando(true);
    try {
      const url = await urlDeRecibo(transaction.recibo_path);
      if (!url) {
        toast.error('No se encontró el archivo. Puede que se haya borrado.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setTrabajando(false);
    }
  };

  const adjuntar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = event.target.files?.[0];
    if (!archivo) return;

    setTrabajando(true);
    try {
      await onAdjuntar(transaction, archivo);
      toast.success('Recibo adjuntado');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo adjuntar el recibo'));
    } finally {
      setTrabajando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const quitar = async () => {
    setTrabajando(true);
    try {
      await onQuitar(transaction);
      toast.success('Recibo eliminado');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar el recibo'));
    } finally {
      setTrabajando(false);
    }
  };

  if (tieneRecibo) {
    return (
      <>
        <button type="button" onClick={ver} disabled={trabajando}>
          <Eye size={15} /> Recibo
        </button>
        <button type="button" className="is-danger" onClick={quitar} disabled={trabajando || !enLinea}>
          <Trash2 size={15} /> Quitar
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={trabajando || !enLinea}
        title={enLinea ? 'Adjuntar foto del recibo' : 'Necesitas conexión para subir el archivo'}
      >
        <Paperclip size={15} /> {trabajando ? 'Subiendo…' : 'Recibo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_RECIBOS}
        // `capture` abre la camara directamente en el celular en vez del
        // explorador de archivos, que es de donde sale una foto de recibo.
        capture="environment"
        onChange={adjuntar}
        style={{ display: 'none' }}
      />
    </>
  );
};

export default ReciboAdjunto;
