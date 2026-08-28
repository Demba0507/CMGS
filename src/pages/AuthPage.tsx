import { useState } from 'react';
import { KeyRound, Mail, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export default function AuthPage({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'reset') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}#auth` });
      if (resetError) setError('Impossible d’envoyer le lien de réinitialisation. Vérifiez votre adresse e-mail.');
      else setMessage('Un lien de réinitialisation a été envoyé à votre adresse e-mail.');
    } else if (mode === 'sign-up') {
      if (password.length < 8) {
        setError('Utilisez au moins 8 caractères pour le mot de passe.');
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/#auth` },
        });
        if (signUpError) setError('Création de compte impossible. Vérifiez les informations saisies.');
        else setMessage('Compte créé. Confirmez votre adresse e-mail, puis connectez-vous.');
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError('Adresse e-mail ou mot de passe incorrect.');
    }
    setLoading(false);
  };

  const title = mode === 'sign-in' ? 'Connexion CMGS' : mode === 'sign-up' ? 'Créer un compte' : 'Réinitialiser le mot de passe';

  return (
    <main className="min-h-screen bg-sand-50 flex items-center justify-center p-4">
      <section className="w-full max-w-md card p-6 sm:p-8">
        <button onClick={onBack} className="text-sm text-sand-500 hover:text-sand-700 mb-6">← Retour à la boutique</button>
        <div className="w-12 h-12 rounded-xl bg-ocre-100 text-ocre-700 flex items-center justify-center mb-4"><KeyRound className="w-6 h-6" /></div>
        <h1 className="font-display text-2xl font-bold text-sand-900">{title}</h1>
        <p className="text-sm text-sand-500 mt-2 mb-6">L’accès au tableau de bord est réservé aux comptes autorisés par CMGS.</p>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'sign-up' && <div><label className="label">Nom complet</label><input className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></div>}
          <div><label className="label">Adresse e-mail</label><input type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
          {mode !== 'reset' && <div><label className="label">Mot de passe</label><input type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required /></div>}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
          <button disabled={loading} className="btn-primary w-full" type="submit">{loading ? 'Veuillez patienter…' : mode === 'sign-in' ? 'Se connecter' : mode === 'sign-up' ? 'Créer mon compte' : 'Envoyer le lien'}</button>
        </form>

        <div className="mt-5 space-y-2 text-sm">
          {mode !== 'sign-in' && <button onClick={() => { setMode('sign-in'); setError(null); setMessage(null); }} className="block text-ocre-700 hover:text-ocre-800">Déjà un compte ? Se connecter</button>}
          {mode === 'sign-in' && <button onClick={() => { setMode('reset'); setError(null); setMessage(null); }} className="block text-ocre-700 hover:text-ocre-800">Mot de passe oublié ?</button>}
          {mode === 'sign-in' && <button onClick={() => { setMode('sign-up'); setError(null); setMessage(null); }} className="inline-flex items-center gap-1 text-ocre-700 hover:text-ocre-800"><UserPlus className="w-4 h-4" /> Créer un compte</button>}
        </div>
        <p className="mt-6 text-xs text-sand-400 flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> CMGS ne demande jamais votre mot de passe par téléphone.</p>
      </section>
    </main>
  );
}
