import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Sin esto, cualquier excepcion durante el render deja la pagina en blanco sin
 * ninguna pista de que paso.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error no capturado en el arbol de React:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="loading-container">
        <AlertTriangle size={40} color="var(--danger)" />
        <h2 style={{ marginTop: '1rem' }}>Algo se rompio</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '460px', textAlign: 'center' }}>
          La aplicacion encontro un error inesperado. Tus datos estan a salvo en Supabase: nada se
          guarda ni se borra desde esta pantalla.
        </p>
        <pre
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            maxWidth: '560px',
            overflowX: 'auto',
            fontSize: '0.8rem',
            color: 'var(--danger)',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
          }}
        >
          {error.message}
        </pre>
        <button
          type="button"
          className="primary-action"
          style={{ marginTop: '1.5rem' }}
          onClick={() => window.location.reload()}
        >
          <RotateCcw size={16} />
          Recargar la aplicacion
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
