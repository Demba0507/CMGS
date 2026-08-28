// Supabase Edge Function — webhook WhatsApp Cloud API (Meta).
//
// À DÉPLOYER PAR DEMBA quand un vrai compte WhatsApp Business API est disponible :
//   supabase functions deploy whatsapp-webhook
//   supabase secrets set WHATSAPP_APP_SECRET=xxx WHATSAPP_ACCESS_TOKEN=xxx WHATSAPP_PHONE_NUMBER_ID=xxx
// Le jeton de vérification (hub.verify_token) est lu depuis la table `settings`
// (clé "channels.whatsapp_webhook_verify_token", configurable depuis Paramètres → Chatbot).
//
// Architecture (§33/§40 du cahier des charges) :
//   Meta → ce webhook → résolution conversation/client (RPC existante, même logique que le site)
//        → stockage du message (mêmes tables que les autres canaux)
//        → accusé de réception envoyé au client
//        → la conversation apparaît dans le dashboard (Conversations) pour prise en charge humaine
//          ou reprise par un futur moteur IA branché sur ce canal.
// LIMITE ASSUMÉE : la réponse automatique du moteur conversationnel (src/lib/chatbot.ts) n'est pas
// encore portée sur ce canal — elle dépend aujourd'hui du client Supabase navigateur. La porter ici
// sans risquer de régresser le moteur très testé du site est laissé comme prochaine étape documentée.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhookHandshake, verifySignature, parseInboundMessage } from './_pure.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getVerifyToken(): Promise<string> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'channels.whatsapp_webhook_verify_token').maybeSingle();
  return typeof data?.value === 'string' ? data.value : '';
}

async function isChannelEnabled(): Promise<boolean> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'channels.whatsapp_enabled').maybeSingle();
  return data?.value === true;
}

async function sendWhatsAppReply(to: string, text: string): Promise<void> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) return; // Pas configuré : on ne bloque pas la réception pour autant.
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  }).catch((err) => console.error('Échec envoi réponse WhatsApp:', err));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- Poignée de main de vérification (configuration initiale du webhook côté Meta) ---
  if (req.method === 'GET') {
    const verifyToken = await getVerifyToken();
    const result = verifyWebhookHandshake(url.searchParams, verifyToken);
    if (!result.ok) return new Response('Forbidden', { status: result.status });
    return new Response(result.challenge, { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!(await isChannelEnabled())) {
    return new Response('WhatsApp channel disabled', { status: 200 }); // 200 pour ne pas faire réessayer Meta indéfiniment.
  }

  const rawBody = await req.text();

  if (APP_SECRET) {
    const signatureHeader = req.headers.get('x-hub-signature-256');
    const valid = await verifySignature(APP_SECRET, rawBody, signatureHeader);
    if (!valid) return new Response('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const inbound = parseInboundMessage(payload);
  if (!inbound) {
    return new Response('OK', { status: 200 }); // Événement non-textuel (statut de lecture, etc.) : rien à faire.
  }

  const { data: conv, error: convError } = await supabase.rpc('get_or_create_channel_conversation', {
    p_channel: 'WHATSAPP',
    p_external_ref: inbound.from,
    p_display_name: inbound.displayName,
  });
  if (convError || !conv?.[0]) {
    console.error('Résolution conversation impossible:', convError);
    return new Response('Internal Error', { status: 500 });
  }

  await supabase.rpc('append_public_message', {
    p_conversation_id: conv[0].conversation_id,
    p_sender: 'CUSTOMER',
    p_content: inbound.text,
    p_intent: 'WHATSAPP_INBOUND',
    p_product_id: null,
  });

  await sendWhatsAppReply(
    inbound.from,
    "Merci pour votre message ! Un conseiller CMGS va vous répondre très prochainement. Vous pouvez aussi commander directement sur notre site."
  );

  return new Response('OK', { status: 200 });
});
