import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, List, Settings } from 'lucide-react';

/**
 * Antes la navegacion era un useState: recargar la pagina te devolvia al
 * dashboard, el boton "atras" del navegador te sacaba de la app y no se podia
 * compartir un enlace a una vista concreta. Ahora son rutas reales.
 */
const ITEMS = [
  { to: '/', label: 'Inicio', icon: <Home size={16} />, end: true },
  { to: '/transacciones', label: 'Transacciones', icon: <List size={16} />, end: false },
  { to: '/configuracion', label: 'Configuración', icon: <Settings size={16} />, end: false },
];

const TopNav: React.FC = () => (
  <nav className="top-nav">
    <div className="top-nav__inner">
      {ITEMS.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `top-nav__item ${isActive ? 'is-active' : ''}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
);

export default TopNav;
