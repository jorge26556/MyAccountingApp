import React, { useEffect, useRef, useState } from 'react';
import { Download, LogOut, Menu, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AccountMenuProps {
  email: string;
  onLogout: () => void;
  onExport: () => void;
}

/**
 * Antes el correo completo y el boton de cerrar sesion vivian fijos en el
 * encabezado, ocupando espacio permanente en el celular para dos cosas que se
 * usan casi nunca. Ahora van aqui, detras de un boton en la esquina superior
 * derecha: es la zona mas incomoda para el pulgar, que es exactamente donde
 * deben estar las acciones poco frecuentes.
 */
const AccountMenu: React.FC<AccountMenuProps> = ({ email, onLogout, onExport }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const iniciales = email.slice(0, 2).toUpperCase();

  const go = (accion: () => void) => {
    setOpen(false);
    accion();
  };

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        type="button"
        className="account-menu__trigger"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Cerrar menú de cuenta' : 'Abrir menú de cuenta'}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
        <span className="account-menu__avatar" aria-hidden="true">{iniciales}</span>
      </button>

      {open && (
        <div className="account-menu__panel" role="menu">
          <div className="account-menu__identity">
            <span className="account-menu__avatar account-menu__avatar--lg" aria-hidden="true">
              {iniciales}
            </span>
            <div className="account-menu__identity-text">
              <strong>Tu cuenta</strong>
              <span title={email}>{email}</span>
            </div>
          </div>

          <button type="button" role="menuitem" onClick={() => go(() => navigate('/configuracion'))}>
            <Settings size={16} />
            Configuración
          </button>

          <button type="button" role="menuitem" onClick={() => go(onExport)}>
            <Download size={16} />
            Exportar respaldo
          </button>

          <button
            type="button"
            role="menuitem"
            className="account-menu__danger"
            onClick={() => go(onLogout)}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
