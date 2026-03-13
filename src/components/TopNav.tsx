import React from 'react';
import { Home, List, Settings } from 'lucide-react';
import type { AppView } from '../types';

interface TopNavProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
}

const TopNav: React.FC<TopNavProps> = ({ activeView, onChangeView }) => {
  const items: Array<{ id: AppView; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Inicio', icon: <Home size={16} /> },
    { id: 'transactions', label: 'Transacciones', icon: <List size={16} /> },
    { id: 'settings', label: 'Configuracion', icon: <Settings size={16} /> },
  ];

  return (
    <nav className="top-nav">
      <div className="top-nav__inner">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className={`top-nav__item ${activeView === item.id ? 'is-active' : ''}`}
            onClick={() => onChangeView(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default TopNav;
