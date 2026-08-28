/**
 * Fonctions pures du webhook WhatsApp Cloud API — aucune dépendance à Deno ni au réseau,
 * afin de pouvoir les tester avec n'importe quel runtime JS (Node compris).
 * Le fichier index.ts (Deno) importe ce module et n'y ajoute que les accès réseau/Supabase.
 */

/** Vérifie la poignée de main de vérification exigée par Meta lors de la configuration du webhook. */
export function verifyWebhookHandshake(
  params: URLSearchParams,
  expectedVerifyToken: string
): { ok: true; challenge: string } | { ok: false; status: number } {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode !== 'subscribe' || !challenge) return { ok: false, status: 400 };
  if (!expectedVerifyToken || token !== expectedVerifyToken) return { ok: false, status: 403 };
  return { ok: true, challenge };
}

/** Calcule la signature HMAC-SHA256 attendue par Meta pour un corps de requête donné. */
export async function computeSignature(appSecret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const bytes = new Uint8Array(signatureBuffer);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `sha256=${hex}`;
}

/** Comparaison en temps constant pour éviter les attaques par timing sur la signature. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(appSecret: string, rawBody: string, receivedHeader: string | null): Promise<boolean> {
  if (!receivedHeader) return false;
  const expected = await computeSignature(appSecret, rawBody);
  return timingSafeEqual(expected, receivedHeader);
}

export interface InboundWhatsAppMessage {
  from: string;
  text: string;
  displayName: string | null;
  waMessageId: string;
}

/** Extrait le premier message texte entrant d'un payload WhatsApp Cloud API.
 *  Retourne null pour les événements sans message (accusés de lecture, statuts de livraison, etc.). */
export function parseInboundMessage(payload: unknown): InboundWhatsAppMessage | null {
  try {
    const body = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
            messages?: Array<{ from?: string; id?: string; type?: string; text?: { body?: string } }>;
          };
        }>;
      }>;
    };

    const value = body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== 'text' || !message.text?.body || !message.from) return null;

    const contact = value?.contacts?.find((c) => c.wa_id === message.from);

    return {
      from: message.from,
      text: message.text.body,
      displayName: contact?.profile?.name ?? null,
      waMessageId: message.id ?? '',
    };
  } catch {
    return null;
  }
}
