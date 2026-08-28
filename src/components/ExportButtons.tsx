import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { exportToCsv, exportToPrintablePdf, type ExportColumn } from '@/lib/export';
import { usePermissions } from '@/lib/permissions';

export default function ExportButtons<T>({ filename, title, columns, rows }: { filename: string; title: string; columns: ExportColumn<T>[]; rows: T[] }) {
  const { has } = usePermissions();
  const [generating, setGenerating] = useState<'csv' | 'pdf' | null>(null);
  if (!has('data.export')) return null;

  const runCsv = () => {
    if (generating) return;
    setGenerating('csv');
    setTimeout(() => {
      exportToCsv(filename, columns, rows);
      setGenerating(null);
    }, 0);
  };

  const runPdf = () => {
    if (generating) return;
    setGenerating('pdf');
    setTimeout(() => {
      exportToPrintablePdf(title, columns, rows);
      setGenerating(null);
    }, 0);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={runCsv} disabled={!!generating} className="text-xs px-2.5 py-1.5 rounded-lg border border-sand-200 text-sand-600 hover:enabled:bg-sand-50 flex items-center gap-1.5 disabled:opacity-60" title="Exporter en CSV (compatible Excel)">
        {generating === 'csv' ? <div className="w-3.5 h-3.5 border-2 border-sand-400 border-t-transparent rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />} CSV
      </button>
      <button onClick={runPdf} disabled={!!generating} className="text-xs px-2.5 py-1.5 rounded-lg border border-sand-200 text-sand-600 hover:enabled:bg-sand-50 flex items-center gap-1.5 disabled:opacity-60" title="Exporter en PDF (impression)">
        {generating === 'pdf' ? <div className="w-3.5 h-3.5 border-2 border-sand-400 border-t-transparent rounded-full animate-spin" /> : <Printer className="w-3.5 h-3.5" />} PDF
      </button>
    </div>
  );
}
