/**
 * Masque un numéro de téléphone pour les employés qui n'ont pas la permission requise.
 * Conserve les 2 premiers et 2 derniers chiffres visibles, masque le reste.
 * Exemple : "70 12 34 56" -> "70 •• •• 56" pour un employé non autorisé,
 * numéro complet inchangé pour un employé autorisé.
 */
export function maskPhone(phone: string | null | undefined, canViewFull: boolean): string {
  if (!phone) return '—';
  if (canViewFull) return phone;

  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '••••';

  const start = digits.slice(0, 2);
  const end = digits.slice(-2);
  const middleGroups = Math.max(0, Math.ceil((digits.length - 4) / 2));
  const middle = Array.from({ length: middleGroups }, () => '••').join(' ');

  return [start, middle, end].filter(Boolean).join(' ');
}
