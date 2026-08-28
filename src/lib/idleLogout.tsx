import { useEffect, useRef, useState, useCallback } from 'react';

/*
  Étape 14 du cahier des charges de corrections CMGS — Gestion des sessions.

  Le système d'authentification (Supabase Auth) rafraîchit la session
  automatiquement tant que l'onglet reste ouvert : une session ouverte sur le
  Dashboard peut donc rester active indéfiniment, y compris sur un poste
  partagé oublié sans surveillance. Ce composant ajoute une protection contre
  les sessions abandonnées, sans modifier le système d'authentification
  existant : il se contente de déclencher la déconnexion déjà en place
  (la même que le bouton « Se déconnecter », §1) après une période
  d'inactivité, avec un avertissement préalable pour ne pas surprendre un
  utilisateur en train de lire une commande sans bouger la souris.
*/

const IDLE_WARNING_AFTER_MS = 20 * 60 * 1000; // 20 min d'inactivité avant avertissement
const IDLE_LOGOUT_AFTER_MS = 21 * 60 * 1000; // 21 min d'inactivité -> déconnexion automatique
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export function IdleLogoutGuard({ onLogout }: { onLogout: () => void }) {
  const lastActivity = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
  }, [resetTimer]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= IDLE_LOGOUT_AFTER_MS) {
        onLogout();
      } else if (elapsed >= IDLE_WARNING_AFTER_MS) {
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_LOGOUT_AFTER_MS - elapsed) / 1000)));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [onLogout]);

  if (secondsLeft === null) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 animate-fade-in px-4">
      <div className="card max-w-sm w-full p-6 text-center">
        <h3 className="font-display text-lg font-bold text-sand-900 mb-2">Toujours là ?</h3>
        <p className="text-sm text-sand-600 mb-5">
          Par sécurité, vous allez être déconnecté pour inactivité dans{' '}
          <strong className="text-sand-900">{minutes}:{String(seconds).padStart(2, '0')}</strong>.
        </p>
        <button onClick={resetTimer} className="btn-primary w-full">Rester connecté</button>
      </div>
    </div>
  );
}
