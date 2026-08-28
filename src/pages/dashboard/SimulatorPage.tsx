import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Product, Customer } from '@/lib/types';
import { processMessage, saveMessage, getFallbackReply, submitChatOrder, requestHumanHandoff, type BotContext } from '@/lib/chatbot';
import { formatFCFA } from '@/lib/format';

interface SimMessage {
  id: string;
  sender: 'CUSTOMER' | 'BOT';
  content: string;
  intent?: string;
  products?: Product[];
}

export default function SimulatorPage() {
  const [messages, setMessages] = useState<SimMessage[]>([
    { id: 'init', sender: 'BOT', content: 'Bonjour 😊 Bienvenue chez CMGS ! Je peux vous aider à trouver un produit, vérifier un prix ou passer une commande. Que recherchez-vous ?', intent: 'GREETING' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<BotContext>({ conversationId: '', customerId: null, lastProducts: [], lastIntent: null, cart: [], checkoutDraft: {}, fallbackStreak: 0 });

  useEffect(() => {
    (async () => {
      const { data: existing } = await supabase.from('conversations').select('*').eq('channel', 'SIMULATOR').order('created_at', { ascending: false }).maybeSingle();
      let convId = existing?.id;
      if (!convId) {
        const { data: simCust } = await supabase.from('customers').insert({ name: 'Simulateur Admin', channel: 'SIMULATOR', status: 'PROSPECT' }).select().maybeSingle();
        if (simCust) {
          const { data: newConv } = await supabase.from('conversations').insert({ customer_id: (simCust as Customer).id, channel: 'SIMULATOR', status: 'ACTIVE' }).select().maybeSingle();
          convId = newConv?.id;
          ctxRef.current.customerId = (simCust as Customer).id;
        }
      }
      ctxRef.current.conversationId = convId ?? '';
      if (convId) await saveMessage(convId, 'BOT', 'Bonjour 😊 Bienvenue chez CMGS ! Je peux vous aider à trouver un produit, vérifier un prix ou passer une commande. Que recherchez-vous ?', 'GREETING');
    })();
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { id: Date.now() + 'u', sender: 'CUSTOMER', content: msg }]);
    setLoading(true);
    if (ctxRef.current.conversationId) await saveMessage(ctxRef.current.conversationId, 'CUSTOMER', msg, 'USER_INPUT');
    try {
      const result = await processMessage(msg, ctxRef.current);
      ctxRef.current = { ...ctxRef.current, ...result.contextUpdates };
      let finalReply = result.reply;
      if (result.action === 'CREATE_ORDER') {
        const outcome = await submitChatOrder(ctxRef.current.cart, ctxRef.current.checkoutDraft);
        if ('orderCode' in outcome) {
          finalReply = `Votre commande ${outcome.orderCode} est confirmée ! Merci pour votre confiance 🙏`;
          ctxRef.current = { ...ctxRef.current, cart: [], checkoutDraft: {}, lastIntent: null };
        } else {
          finalReply = `Désolé, je n'ai pas pu finaliser la commande : ${outcome.error}`;
          ctxRef.current = { ...ctxRef.current, lastIntent: null };
        }
      } else if (result.action === 'REQUEST_HUMAN' && ctxRef.current.conversationId) {
        await requestHumanHandoff(ctxRef.current.conversationId);
      }
      if (ctxRef.current.conversationId) await saveMessage(ctxRef.current.conversationId, 'BOT', finalReply, result.intent);
      setMessages((prev) => [...prev, { id: Date.now() + 'b', sender: 'BOT', content: finalReply, intent: result.intent, products: result.products }]);
    } catch {
      const fb = getFallbackReply();
      if (ctxRef.current.conversationId) await saveMessage(ctxRef.current.conversationId, 'BOT', fb, 'FALLBACK');
      setMessages((prev) => [...prev, { id: Date.now() + 'e', sender: 'BOT', content: fb, intent: 'FALLBACK' }]);
    } finally { setLoading(false); }
  };

  const reset = () => {
    setMessages([{ id: 'init', sender: 'BOT', content: 'Bonjour 😊 Bienvenue chez CMGS ! Que recherchez-vous ?', intent: 'GREETING' }]);
    ctxRef.current = { conversationId: ctxRef.current.conversationId, customerId: ctxRef.current.customerId, lastProducts: [], lastIntent: null, cart: [], checkoutDraft: {}, fallbackStreak: 0 };
  };

  const tests = [
    { label: 'Recherche produit', msg: 'Vous avez des sandales ?' },
    { label: 'Prix', msg: 'La première coûte combien ?' },
    { label: 'Stock', msg: 'Il vous reste combien ?' },
    { label: 'Commander', msg: 'Je prends une paire' },
    { label: 'Stock insuffisant', msg: 'Je prends 100' },
    { label: 'Moins cher', msg: 'Quelque chose de moins cher ?' },
    { label: 'Produit inexistant', msg: 'Vous avez des fusées spatiales ?' },
  ];

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-4"><h2 className="font-display text-xl font-bold text-sand-900">Simulateur IA</h2><p className="text-sm text-sand-500">Testez le chatbot avec le vrai moteur CMGS — mêmes règles, même base de données</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="card flex flex-col h-[600px]">
            <div className="flex items-center justify-between p-4 border-b border-sand-200 bg-gradient-to-r from-ocre-600 to-ocre-700 text-white rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><Bot className="w-6 h-6" /></div>
                <div><div className="font-display font-bold">Moteur CMGS</div><div className="text-xs text-ocre-100">Simulateur — Canal SIMULATOR</div></div>
              </div>
              <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm transition-colors"><RotateCcw className="w-4 h-4" /> Réinitialiser</button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-sand-50">
              {messages.map((m) => (
                <div key={m.id} className={`flex gap-2 ${m.sender === 'CUSTOMER' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.sender === 'CUSTOMER' ? 'bg-indigo-100' : 'bg-ocre-100'}`}>
                    {m.sender === 'CUSTOMER' ? <User className="w-4 h-4 text-indigo-600" /> : <Bot className="w-4 h-4 text-ocre-600" />}
                  </div>
                  <div className={`max-w-[75%] flex flex-col gap-2`}>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line ${m.sender === 'CUSTOMER' ? 'bg-indigo-600 text-white rounded-tr-md' : 'bg-white text-sand-800 rounded-tl-md shadow-sm border border-sand-200/60'}`}>{m.content}</div>
                    {m.intent && <span className="text-[10px] text-sand-400 px-1">Intent: {m.intent}</span>}
                    {m.products && m.products.length > 0 && (
                      <div className="space-y-1.5">
                        {m.products.map((p) => (
                          <div key={p.id} className="card p-2 flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-lg bg-sand-100 overflow-hidden shrink-0">{p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}</div>
                            <div className="flex-1 min-w-0"><div className="font-mono text-[10px] text-sand-400">{p.code}</div><div className="font-medium text-sand-900 text-xs truncate">{p.name}</div><div className="text-ocre-700 font-bold text-xs">{formatFCFA(p.sale_price)}</div></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-ocre-100 flex items-center justify-center"><Bot className="w-4 h-4 text-ocre-600" /></div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-white shadow-sm border border-sand-200/60">
                    <div className="flex gap-1"><span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: '300ms' }} /></div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-sand-200">
              <div className="flex items-center gap-2">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Saisir un message..." className="flex-1 px-3.5 py-2.5 text-sm rounded-full border border-sand-300 bg-sand-50 focus:outline-none focus:ring-2 focus:ring-ocre-400/40 focus:bg-white" disabled={loading} />
                <button onClick={() => send()} disabled={loading || !input.trim()} className="w-10 h-10 rounded-full bg-ocre-600 text-white flex items-center justify-center hover:bg-ocre-700 disabled:opacity-50"><Send className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="font-semibold text-sand-900 text-sm mb-3">Scénarios de test</h3>
            <div className="space-y-1.5">
              {tests.map((t) => (
                <button key={t.label} onClick={() => send(t.msg)} disabled={loading} className="w-full text-left px-3 py-2 rounded-lg bg-sand-50 hover:bg-ocre-50 hover:text-ocre-700 text-sm text-sand-700 transition-colors disabled:opacity-50">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-sand-400 truncate">"{t.msg}"</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold text-sand-900 text-sm mb-2">Règles du moteur</h3>
            <ul className="text-xs text-sand-600 space-y-1.5">
              <li>• L'IA ne invente jamais les prix ou stock</li>
              <li>• Source de vérité = base de données</li>
              <li>• Fallback déterministe si erreur</li>
              <li>• Prévention de la survente</li>
              <li>• Contexte conversationnel conservé</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
