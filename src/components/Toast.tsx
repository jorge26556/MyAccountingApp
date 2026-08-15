import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastContext, type ToastAccion, type ToastApi } from '../lib/toast';

/**
 * Reemplaza los `alert()` que habia en SettingsPanel y TransactionModal.
 * `alert` bloquea el hilo, no se puede estilar y en movil se ve como un error
 * del navegador, no de la app.
 *
 * El hook `useToast` y el helper `errorMessage` estan en ../lib/toast.
 */

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  accion?: ToastAccion;
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, accion?: ToastAccion) => {
      const id = ++nextId;
      setToasts(prev => [...prev, { id, kind, message, accion }]);

      // Los errores duran mas porque hay que leerlos, y los que traen boton
      // mas todavia: 4 segundos no alcanzan para notar el borrado, decidir que
      // fue un error y llegar a "Deshacer".
      const duracion = accion ? 8000 : kind === 'error' ? 7000 : 4000;
      window.setTimeout(() => dismiss(id), duracion);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, accion) => push('success', message, accion),
      error: (message, accion) => push('error', message, accion),
      info: (message, accion) => push('info', message, accion),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <span className="toast__icon">{ICONS[toast.kind]}</span>
            <span className="toast__message">{toast.message}</span>
            {toast.accion && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  dismiss(toast.id);
                  toast.accion!.onClick();
                }}
              >
                {toast.accion.label}
              </button>
            )}
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar notificación"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
