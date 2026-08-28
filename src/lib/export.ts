export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Génère un CSV (compatible Excel/LibreOffice via double-clic) et déclenche le téléchargement. */
export function exportToCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(';');
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(';'));
  const csv = '\uFEFF' + [header, ...lines].join('\r\n'); // BOM pour un accent correct dans Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Ouvre une vue imprimable propre et déclenche l'impression (le client choisit "Enregistrer en PDF"
 *  dans la boîte de dialogue du navigateur — pas de bibliothèque binaire à faire confiance en aveugle). */
export function exportToPrintablePdf<T>(title: string, columns: ExportColumn<T>[], rows: T[]): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;

  const headerRow = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const bodyRows = rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(String(c.value(row)))}</td>`).join('')}</tr>`).join('');

  win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 24px; color: #1c1917; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      p.meta { color: #78716c; font-size: 12px; margin-top: 0; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e7e5e4; }
      th { background: #fafaf9; font-weight: 600; }
      @media print { body { padding: 0; } }
    </style></head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">Exporté le ${new Date().toLocaleString('fr-FR')} — ${rows.length} ligne(s)</p>
      <table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
      <script>window.onload = () => window.print();</script>
    </body></html>`);
  win.document.close();
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
