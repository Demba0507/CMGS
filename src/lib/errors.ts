/**
 * Filtre les messages d'erreur avant affichage (§60 du cahier des charges) :
 * ne jamais montrer une erreur SQL/contrainte/stack trace brute au client.
 * Toutes les RPC de l'application renvoient des messages métier clairs en français via
 * `RAISE EXCEPTION ... message = '...'` — ce filtre est un filet de sécurité pour les cas
 * où une erreur technique imprévue (contrainte non validée en amont, erreur réseau, etc.)
 * remonterait telle quelle.
 */
const TECHNICAL_ERROR_PATTERNS = [
  /column/i, /relation/i, /constraint/i, /duplicate key/i, /null value/i,
  /syntax error/i, /violates/i, /permission denied for/i, /pg_/i,
  /uuid/i, /jsonb?/i, /invalid input syntax/i, /42501/, /23505/, /23503/,
  /fetch failed/i, /networkerror/i, /failed to fetch/i,
];

export function friendlyError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return fallback;
  if (TECHNICAL_ERROR_PATTERNS.some((p) => p.test(raw))) return fallback;
  return raw;
}
