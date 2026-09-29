import React from 'react';
import { NavLink } from 'react-router-dom';
import { HandCoins, Home, List, Plus, Settings, ShoppingCart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useIsMobile } from '../lib/useMediaQuery';

interface NavProps {
  onAdd: () => void;
  /** Falso mientras la migracion 005 no se haya ejecutado. */
  conDeudas: boolean;
  /** Falso mientras la migracion 009 no se haya ejecutado. */
  conLista: boolean;
}

interface Pestana {
  to: string;
  label: string;
  /** Nombre corto para la barra inferior, donde el ancho es de un pulgar. */
  corto: string;
  icon: LucideIcon;
  end: boolean;
}

const INICIO: Pestana = { to: '/', label: 'Inicio', corto: 'Inicio', icon: Home, end: true };
const MOVIMIENTOS: Pestana = {
  to: '/transacciones',
  label: 'Transacciones',
  corto: 'Movimientos',
  icon: List,
  end: false,
};
const LISTA: Pestana = { to: '/lista', label: 'Lista', corto: 'Lista', icon: ShoppingCart, end: false };
const DEUDAS: Pestana = { to: '/deudas', label: 'Deudas', corto: 'Deudas', icon: HandCoins, end: false };
const AJUSTES: Pestana = {
  to: '/configuracion',
  label: 'Configuración',
  corto: 'Ajustes',
  icon: Settings,
  end: false,
};

/**
 * En celular la navegacion vive abajo, en la zona del pulgar, con el boton de
 * anadir al centro: es la accion mas frecuente de la app y estaba arriba del
 * todo, en la esquina mas dificil de alcanzar con una mano.
 *
 * Caben dos pestañas a cada lado del boton. A la derecha van Lista y Deudas,
 * que se usan a diario; Ajustes solo ocupa un hueco si queda libre, porque ya
 * esta en el menu de cuenta (arriba a la derecha), que es donde deben vivir
 * las cosas que se tocan poco.
 *
 * En escritorio no hay barra inferior — se ve fuera de lugar en un monitor y
 * ahi el alcance no es un problema — asi que se mantiene la nav superior con
 * todas las pestañas.
 */
const TopNav: React.FC<NavProps> = ({ onAdd, conDeudas, conLista }) => {
  const isMobile = useIsMobile();

  const opcionales = [conLista && LISTA, conDeudas && DEUDAS].filter(
    (pestana): pestana is Pestana => Boolean(pestana)
  );

  if (isMobile) {
    const derecha = [...opcionales, AJUSTES].slice(0, 2);
    const enlace = (pestana: Pestana) => {
      const Icon = pestana.icon;
      return (
        <NavLink
          key={pestana.to}
          to={pestana.to}
          end={pestana.end}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <Icon size={20} />
          <span>{pestana.corto}</span>
        </NavLink>
      );
    };

    return (
      <nav
        className={`bottom-nav ${derecha.length === 2 ? 'is-cinco' : ''}`}
        aria-label="Navegación principal"
      >
        {enlace(INICIO)}
        {enlace(MOVIMIENTOS)}

        <button type="button" className="bottom-nav__fab" onClick={onAdd} aria-label="Añadir transacción">
          <Plus size={24} />
        </button>

        {derecha.map(enlace)}
      </nav>
    );
  }

  return (
    <nav className="top-nav" aria-label="Navegación principal">
      <div className="top-nav__inner">
        {[INICIO, MOVIMIENTOS, ...opcionales, AJUSTES].map(item => {
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
