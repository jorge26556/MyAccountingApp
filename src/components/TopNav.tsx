import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, List, Plus, Settings } from 'lucide-react';
import { useIsMobile } from '../lib/useMediaQuery';

interface NavProps {
  onAdd: () => void;
}

const ITEMS = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/transacciones', label: 'Transacciones', icon: List, end: false },
  { to: '/configuracion', label: 'Configuración', icon: Settings, end: false },
];

/**
 * En celular la navegacion vive abajo, en la zona del pulgar, con el boton de
 * anadir al centro: es la accion mas frecuente de la app y estaba arriba del
 * todo, en la esquina mas dificil de alcanzar con una mano.
 *
 * En escritorio no hay barra inferior — se ve fuera de lugar en un monitor y
 * ahi el alcance no es un problema — asi que se mantiene la nav superior.
 */
const TopNav: React.FC<NavProps> = ({ onAdd }) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <nav className="bottom-nav" aria-label="Navegación principal">
        <NavLink to="/" end className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}>
          <Home size={20} />
          <span>Inicio</span>
        </NavLink>

        <NavLink
          to="/transacciones"
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <List size={20} />
          <span>Movimientos</span>
        </NavLink>

        <button type="button" className="bottom-nav__fab" onClick={onAdd} aria-label="Añadir transacción">
          <Plus size={24} />
        </button>

        <NavLink
          to="/configuracion"
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <Settings size={20} />
          <span>Ajustes</span>
        </NavLink>
      </nav>
    );
  }

  return (
    <nav className="top-nav" aria-label="Navegación principal">
      <div className="top-nav__inner">
        {ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `top-nav__item ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default TopNav;
