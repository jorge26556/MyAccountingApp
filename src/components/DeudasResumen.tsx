import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, HandCoins } from 'lucide-react';
import type { ResumenDeudas } from '../lib/deudas';
import { formatCurrency } from '../lib/format';

interface DeudasResumenProps {
  resumen: ResumenDeudas;
}

/**
 * Una linea en el Inicio que lleva a la pestaña de Deudas.
 *
 * Las deudas se gestionan en su pestaña, pero lo pendiente no deberia quedar
 * fuera de vista: si nadie abre esa pestaña, el prestamo a Juan se olvida.
 * Solo aparece cuando hay algo abierto; sin deudas no ocupa espacio.
 */
const DeudasResumen: React.FC<DeudasResumenProps> = ({ resumen }) => {
  if (resumen.abiertas.length === 0) return null;

  const partes = [
    resumen.teDeben > 0 && (
      <span key="cobrar">
        Te deben <strong className="is-cobrar">{formatCurrency(resumen.teDeben)}</strong>
      </span>
    ),
    resumen.debes > 0 && (
      <span key="pagar">
        Debes <strong className="is-pagar">{formatCurrency(resumen.debes)}</strong>
      </span>
    ),
  ].filter(Boolean);

  return (
    <Link to="/deudas" className="deudas-resumen">
      <HandCoins size={18} className="deudas-resumen__icon" />
      <div className="deudas-resumen__texto">{partes}</div>
      <ChevronRight size={18} className="deudas-resumen__flecha" />
    </Link>
  );
};

export default DeudasResumen;
