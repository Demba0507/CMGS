// Supabase Edge Function — secours conversationnel via l'API DeepSeek.
//
// À DÉPLOYER PAR DEMBA :
//   supabase functions deploy chat-ai
//   supabase secrets set DEEPSEEK_API_KEY=sk-xxxxxxxx
//
// Pourquoi une Edge Function et pas un appel direct depuis le navigateur ?
// La clé API DeepSeek ne doit JAMAIS apparaître dans le code envoyé au navigateur
// (contrairement à VITE_SUPABASE_ANON_KEY, une clé DeepSeek donne un accès facturé
// et sans limite d'usage à quiconque la récupère). Cette fonction tourne côté serveur
// Supabase, lit la clé depuis un secret, et ne renvoie au client que la réponse texte.
//
// Par défaut, Supabase exige déjà une clé de projet valide (anon ou utilisateur connecté)
// pour appeler cette fonction — un tiers qui ne connaît pas votre clé anon ne peut pas
// l'utiliser à vos frais. Aucune vérification supplémentaire n'est donc nécessaire ici.
//
// PÉRIMÈTRE VOLONTAIREMENT LIMITÉ (décision prise avec Demba) :
// DeepSeek n'intervient qu'en secours, quand le moteur à mots-clés (src/lib/chatbot.ts)
// ne comprend pas la demande. Il ne doit jamais annoncer de prix, de stock ou de
// politique précise — ces sujets restent gérés par le code déterministe qui lit
// directement la base de données, pour ne jamais promettre une information fausse
// à un client. Le system prompt ci-dessous applique cette limite.

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `Tu es l'assistant conversationnel de CMGS Commerce, une boutique en ligne basée à Bamako, Mali.

Règles strictes à respecter absolument :
- Tu réponds toujours en français, sur un ton chaleureux et professionnel, en quelques phrases courtes.
- Tu n'annonces JAMAIS de prix, de quantité en stock, de délai de livraison précis ou de politique de retour précise, même si le client insiste : tu ne les connais pas avec certitude. Dans ce cas, dis que tu vas vérifier cette information précise et invite le client à reformuler sa question sur ce produit, ou propose de le mettre en relation avec un conseiller.
- Tu n'inventes jamais d'information sur un produit, une promotion ou une politique de l'entreprise qui ne t'a pas été donnée explicitement.
- Si le client veut passer commande, oriente-le vers le catalogue de la boutique plutôt que de traiter la commande toi-même.
- Si tu sens de la frustration ou une question à laquelle tu ne peux pas répondre avec certitude, propose clairement de le mettre en relation avec un conseiller humain CMGS.`;

interface ChatRequest {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  if (!DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ error: 'DeepSeek non configuré côté serveur.' }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Vérifie que l'appel vient bien d'un client Supabase valide (anon ou connecté) : Supabase
  // exige déjà une clé de projet valide au niveau de la passerelle avant d'atteindre ce code.

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Requête invalide.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const message = (body.message ?? '').trim().slice(0, 1000); // limite raisonnable, évite l'abus
  if (!message) {
    return new Response(JSON.stringify({ error: 'Message vide.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-6) : []; // 6 derniers messages suffisent pour le contexte

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.map((m) => ({ role: m.role, content: m.content.slice(0, 1000) })),
          { role: 'user', content: message },
        ],
        max_tokens: 300,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erreur DeepSeek:', response.status, errText);
      return new Response(JSON.stringify({ error: 'Réponse IA indisponible.' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const reply: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!reply) {
      return new Response(JSON.stringify({ error: 'Réponse IA vide.' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Échec appel DeepSeek:', err);
    return new Response(JSON.stringify({ error: 'Réponse IA indisponible.' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
