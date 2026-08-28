import { useState } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import { confirmPassword } from '@/lib/maintenance';

export default function ConfirmPasswordModal({
  title, description, onCancel, onConfirmed,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirmed: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    setChecking(true);
    setError(null);
    try {
      await confirmPassword(password);
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mot de passe incorrect.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200">
          <h2 className="font-display text-lg font-bold text-sand-900 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-red-600" /> {title}</h2>
          <button onClick={onCancel} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-sand-600">{description}</p>
          <div>
            <label className="label">Confirmez avec votre mot de passe</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              autoFocus
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-lg border border-sand-200 text-sand-600 hover:bg-sand-50 text-sm font-medium">Annuler</button>
            <button disabled={checking || !password} onClick={() => void submit()} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {checking ? 'Vérification...' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
