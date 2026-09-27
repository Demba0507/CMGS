import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { processMessage, saveMessage, getFallbackReply, submitChatOrder, requestHumanHandoff, type BotContext } from '@/lib/chatbot';
import { formatFCFA } from '@/lib/format';

interface ChatMessage {
  id: string;
  sender: 'CUSTOMER' | 'BOT';
  content: string;
  products?: Product[];
}

export default function Chatbot({ onClose, onAddToCart }: { onClose: () => void; onAddToCart: (p: Product, variant: null, qty: number) => void }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'init', sender: 'BOT', content: 'Bonjour 😊 Bienvenue chez RATELAFRICA ! Je peux vous aider à trouver un produit, vérifier un prix ou passer une commande. Que recherchez-vous ?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<BotContext>({
    conversationId: '',
    customerId: null,
    lastProducts: [],
    lastIntent: null,
    cart: [],
    checkoutDraft: {},
    fallbackStreak: 0,
  });

  useEffect(() => {
    (async () => {
      const { data: created } = await supabase.rpc('create_public_conversation', { p_channel: 'SITE' });
      const convId = created?.[0]?.conversation_id as string | undefined;
      if (created?.[0]?.customer_id) ctxRef.current.customerId = created[0].customer_id as string;
      ctxRef.current.conversationId = convId ?? '';

      // Save initial bot message
      if (convId) {
        await saveMessage(convId, 'BOT', 'Bonjour 😊 Bienvenue chez RATELAFRICA ! Je peux vous aider à trouver un produit, vérifier un prix ou passer une commande. Que recherchez-vous ?', 'GREETING');
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    const userMsg: ChatMessage = { id: Date.now() + 'u', sender: 'CUSTOMER', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Save user message
    if (ctxRef.current.conversationId) {
      await saveMessage(ctxRef.current.conversationId, 'CUSTOMER', text, 'USER_INPUT');
    }

    try {
      const result = await processMessage(text, ctxRef.current, messages.map((m) => ({ sender: m.sender, content: m.content })));
      ctxRef.current = { ...ctxRef.current, ...result.contextUpdates };

      let finalReply = result.reply;

      // Actions concrètes déclenchées par le moteur conversationnel : la commande n'est
      // créée qu'ici, après confirmation explicite du client (§36).
      if (result.action === 'CREATE_ORDER') {
        const outcome = await submitChatOrder(ctxRef.current.cart, ctxRef.current.checkoutDraft);
        if ('orderCode' in outcome) {
          finalReply = `Votre commande ${outcome.orderCode} est confirmée ! Merci pour votre confiance 🙏 Vous recevrez un appel de confirmation avant la livraison.`;
          ctxRef.current = { ...ctxRef.current, cart: [], checkoutDraft: {}, lastIntent: null };
        } else {
          finalReply = `Désolé, je n'ai pas pu finaliser la commande : ${outcome.error}`;
          ctxRef.current = { ...ctxRef.current, lastIntent: null };
        }
      } else if (result.action === 'REQUEST_HUMAN' && ctxRef.current.conversationId) {
        await requestHumanHandoff(ctxRef.current.conversationId);
      }

      if (ctxRef.current.conversationId) {
        await saveMessage(ctxRef.current.conversationId, 'BOT', finalReply, result.intent);
      }

      const botMsg: ChatMessage = {
        id: Date.now() + 'b',
        sender: 'BOT',
        content: finalReply,
        products: result.products,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const fallback = getFallbackReply();
      if (ctxRef.current.conversationId) {
        await saveMessage(ctxRef.current.conversationId, 'BOT', fallback, 'FALLBACK');
      }
      setMessages((prev) => [...prev, { id: Date.now() + 'e', sender: 'BOT', content: fallback }]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([{ id: 'init', sender: 'BOT', content: 'Bonjour 😊 Bienvenue chez RATELAFRICA ! Que recherchez-vous ?' }]);
    ctxRef.current = { conversationId: ctxRef.current.conversationId, customerId: ctxRef.current.customerId, lastProducts: [], lastIntent: null, cart: [], checkoutDraft: {}, fallbackStreak: 0 };
  };

  const suggestions = ['Vous avez des sandales ?', 'La première coûte combien ?', 'Je prends une paire', 'Quelque chose de moins cher ?'];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 w-full sm:w-96 h-[85vh] sm:h-[600px] sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sand-200 dark:border-sand-700 bg-gradient-to-r from-ocre-600 to-ocre-700 text-white sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><Bot className="w-6 h-6" /></div>
            <div>
              <div className="font-display font-bold">Assistant RATELAFRICA</div>
              <div className="text-xs text-ocre-100 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-300" /> En ligne</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors" title="Réinitialiser"><RotateCcw className="w-4 h-4" /></button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-sand-50 dark:bg-sand-900">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.sender === 'CUSTOMER' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'CUSTOMER' ? 'bg-indigo-100' : 'bg-ocre-100'}`}>
                {msg.sender === 'CUSTOMER' ? <User className="w-4 h-4 text-indigo-600" /> : <Bot className="w-4 h-4 text-ocre-600" />}
              </div>
              <div className={`max-w-[75%] ${msg.sender === 'CUSTOMER' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line ${msg.sender === 'CUSTOMER' ? 'bg-indigo-600 text-white rounded-tr-md' : 'bg-white dark:bg-sand-700 text-sand-800 dark:text-sand-100 rounded-tl-md shadow-sm border border-sand-200/60 dark:border-sand-600'}`}>
                  {msg.content}
                </div>
                {msg.products && msg.products.length > 0 && (
                  <div className="space-y-2 w-full">
                    {msg.products.map((p) => (
                      <div key={p.id} className="card p-2.5 flex items-center gap-2.5">
                        <div className="w-12 h-12 rounded-lg bg-sand-100 dark:bg-sand-700 overflow-hidden shrink-0">
                          {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[10px] text-sand-400 dark:text-sand-500">{p.code}</div>
                          <div className="font-medium text-sand-900 dark:text-sand-100 text-xs truncate">{p.name}</div>
                          <div className="text-ocre-700 font-bold text-xs">{formatFCFA(p.sale_price)}</div>
                        </div>
                        {p.stock > 0 && (
                          <button onClick={() => onAddToCart(p, null, 1)} className="text-xs px-2.5 py-1.5 rounded-lg bg-ocre-600 text-white hover:bg-ocre-700 transition-colors whitespace-nowrap">Ajouter</button>
                        )}
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
              <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-white dark:bg-sand-700 shadow-sm border border-sand-200/60 dark:border-sand-600">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {messages.length <= 2 && !loading && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="text-xs px-3 py-1.5 rounded-full bg-ocre-50 dark:bg-sand-700 text-ocre-700 dark:text-ocre-300 border border-ocre-200 dark:border-sand-600 hover:bg-ocre-100 dark:hover:bg-sand-600 transition-colors">{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-sand-200 dark:border-sand-700 bg-white dark:bg-sand-800">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={t('chatbot.placeholder')}
              className="flex-1 px-3.5 py-2.5 text-sm rounded-full border border-sand-300 dark:border-sand-600 bg-sand-50 dark:bg-sand-900 dark:text-sand-100 focus:outline-none focus:ring-2 focus:ring-ocre-400/40 focus:bg-white dark:focus:bg-sand-900"
              disabled={loading}
            />
            <button onClick={send} disabled={loading || !input.trim()} className="w-10 h-10 rounded-full bg-ocre-600 text-white flex items-center justify-center hover:bg-ocre-700 disabled:opacity-50 transition-colors shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
