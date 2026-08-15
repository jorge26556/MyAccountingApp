import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { Account, Transaction } from '../../types';
import { downloadCsv, parseCsv } from '../../lib/csv';
import { toDateString, today } from '../../lib/dates';
import { errorMessage, useToast } from '../../lib/toast';

interface DataSectionProps {
  transactions: Transaction[];
  accounts: Account[];
  onImport: (rows: Array<Omit<Transaction, 'id' | 'user_id'>>) => Promise<number>;
}

const DataSection: React.FC<DataSectionProps> = ({ transactions, accounts, onImport }) => {
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (transactions.length === 0) {
      toast.info('No hay movimientos para exportar');
      return;
    }
    downloadCsv(transactions, `mis-finanzas-${toDateString(today())}.csv`, accounts);
    toast.success(`${transactions.length} movimientos exportados`);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setErrores([]);
    try {
      const { rows, errors } = parseCsv(await file.text(), accounts);

      // Los errores se muestran en la pantalla, no en un toast: un archivo malo
      // puede tener decenas de filas con problemas y hay que poder leerlas.
      setErrores(errors);

      if (rows.length > 0) {
        const insertadas = await onImport(rows);
        toast.success(`${insertadas} movimientos importados`);
      } else if (errors.length === 0) {
        toast.info('El archivo no tenía filas para importar');
      }
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo leer el archivo'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Respaldo</h3>
          <p>Descarga todos tus movimientos en CSV. Ábrelo con Excel o Google Sheets.</p>
        </header>

        <button type="button" className="primary-action" onClick={handleExport}>
          <Download size={16} />
          Exportar {transactions.length} movimientos
        </button>
      </section>

      <section className="settings-block">
        <header className="settings-block__head">
          <h3>Importar</h3>
          <p>
            Carga el extracto de tu banco en vez de digitarlo. Columnas: fecha (YYYY-MM-DD), tipo,
            categoria, importe, y opcionalmente estado_pago, cuenta y descripcion. Las filas sin
            cuenta —o con un nombre que no existe— caen en <strong>{accounts[0]?.nombre ?? 'la primera'}</strong>.
          </p>
        </header>

        <button
          type="button"
          className="secondary-action"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          <Upload size={16} />
          {importing ? 'Importando...' : 'Elegir archivo CSV'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImportFile}
          style={{ display: 'none' }}
        />

        {errores.length > 0 && (
          <div className="settings-errores">
            <strong>{errores.length} fila(s) no se importaron:</strong>
            <ul>
              {errores.slice(0, 12).map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            {errores.length > 12 && <p>…y {errores.length - 12} más.</p>}
          </div>
        )}
      </section>
    </div>
  );
};

export default DataSection;
