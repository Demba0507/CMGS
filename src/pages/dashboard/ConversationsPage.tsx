import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, X, Bot, User, UserCheck, Lock, Send, Headset, Trash2, ArchiveRestore } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Conversation, Message, Customer } from '@/lib/types';
import { formatDateTime, timeAgo } from '@/lib/format';
import { CHANNEL_LABELS } from '@/lib/constants';
import { assignConversation, sendEmployeeMessage, closeConversation } from '@/lib/chatHandoff';
import { deleteConversation, restoreConversation, purgeConversation } from '@/lib/maintenance';
import { useToast } from '@/lib/toast';
import ConfirmPasswordModal from '@/components/ConfirmPasswordModal';

const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Bot',
  AWAITING_HUMAN: 'Demande humain',
  HUMAN_HANDLING: 'Prise en charge',
  CLOSED: 'Clôturée',
};
const CONVERSATION_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-sand-100 text-sand-600',
  AWAITING_HUMAN: 'bg-red-100 text-red-700',
  HUMAN_HANDLING: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-green-100 text-green-700',
};

export default function ConversationsPage() {
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: cust }, { data: msg }] = await Promise.all([
      supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
      supabase.from('customers').select('*'),
      supabase.from('messages').select('*').order('created_at', { ascending: true }),
    ]);
    const list = (c as Conversation[]) ?? [];
    setConversations(list);
    setCustomers((cust as Customer[]) ?? []);
    const msgMap: Record<string, Message[]> = {};
    (msg as Message[])?.forEach((m) => {
      if (!msgMap[m.conversation_id]) msgMap[m.conversation_id] = [];
      msgMap[m.conversation_id].push(m);
    });
    setMessages(msgMap);
    setSelected((prev) => (prev ? list.find((c2) => c2.id === prev.id) ?? prev : prev));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const takeOver = async (c: Conversation) => {
    try {
      await assignConversation(c.id);
      void load();
      toast.success('Conversation prise en charge.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de prendre en charge.');
    }
  };

  const close = async (c: Conversation) => {
    try {
      await closeConversation(c.id);
      void load();
      toast.success('Conversation clôturée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de clôturer.');
    }
  };

  const send = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await sendEmployeeMessage(selected.id, reply.trim());
      setReply('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'envoyer.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const awaitingCount = conversations.filter((c) => c.status === 'AWAITING_HUMAN').length;
  const visibleConversations = conversations.filter((c) => (showTrash ? !!c.deleted_at : !c.deleted_at));

  const doDelete = async () => {
    if (!selected) return;
    setConfirmDelete(false);
    try {
      await deleteConversation(selected.id);
      setSelected(null);
      void load();
      toast.success('Conversation déplacée en corbeille.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  };

  const doRestore = async (c: Conversation) => {
    try {
      await restoreConversation(c.id);
      setSelected(null);
      void load();
      toast.success('Conversation restaurée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restauration impossible.');
    }
  };

  const doPurge = async () => {
    if (!selected) return;
    setConfirmPurge(false);
    try {
      await purgeConversation(selected.id);
      setSelected(null);
      void load();
      toast.success('Conversation supprimée définitivement.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression définitive impossible.');
    }
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900">{conversations.length} conversations</h2>
          <p className="text-sm text-sand-500">
            Consultez l'historique des conversations
            {awaitingCount > 0 && <span className="ml-2 text-red-600 font-medium">— {awaitingCount} en attente d'un conseiller</span>}
          </p>
        </div>
        <button onClick={() => { setShowTrash((v) => !v); setSelected(null); }} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${showTrash ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>
          <Trash2 className="w-3.5 h-3.5" /> {showTrash ? 'Retour aux conversations' : 'Corbeille'}
        </button>
      </div>

      {visibleConversations.length === 0 ? (
        <div className="card p-12 text-center"><MessageSquare className="w-12 h-12 text-sand-300 mx-auto mb-3" /><p className="text-sand-500">{showTrash ? 'La corbeille est vide.' : 'Aucune conversation enregistrée'}</p></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-2">
            {visibleConversations.map((c) => {
              const customer = customers.find((cu) => cu.id === c.customer_id);
              const convMsgs = messages[c.id] ?? [];
              const lastMsg = convMsgs[convMsgs.length - 1];
              return (
                <button key={c.id} onClick={() => setSelected(c)} className={`card p-4 w-full text-left hover:shadow-card-hover transition-all ${selected?.id === c.id ? 'ring-2 ring-ocre-400' : ''} ${c.status === 'AWAITING_HUMAN' ? 'border-red-300' : ''}`}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="font-medium text-sand-900 text-sm truncate">{customer?.name ?? 'Inconnu'}</span>
                    <span className={`badge shrink-0 text-[10px] ${CONVERSATION_STATUS_COLORS[c.status] ?? 'bg-sand-100 text-sand-600'}`}>{CONVERSATION_STATUS_LABELS[c.status] ?? c.status}</span>
                  </div>
                  <p className="text-xs text-sand-500 truncate">{lastMsg?.content ?? 'Aucun message'}</p>
                  <span className="text-[10px] text-sand-400">{timeAgo(c.updated_at)}</span>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            {selected ? (
              <div className="card flex flex-col h-[600px]">
                <div className="flex items-center justify-between p-4 border-b border-sand-200">
                  <div>
                    <h3 className="font-semibold text-sand-900">{customers.find((c) => c.id === selected.customer_id)?.name ?? 'Inconnu'}</h3>
                    <span className="text-xs text-sand-500">{CHANNEL_LABELS[selected.channel]} — {formatDateTime(selected.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!selected.deleted_at && selected.status !== 'CLOSED' && selected.status !== 'HUMAN_HANDLING' && (
                      <button onClick={() => void takeOver(selected)} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Prendre en charge</button>
                    )}
                    {!selected.deleted_at && selected.status !== 'CLOSED' && (
                      <button onClick={() => void close(selected)} className="text-xs px-2.5 py-1.5 rounded-lg bg-sand-100 text-sand-600 hover:bg-sand-200 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Clôturer</button>
                    )}
                    {selected.deleted_at ? (
                      <button onClick={() => void doRestore(selected)} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex items-center gap-1"><ArchiveRestore className="w-3.5 h-3.5" /> Restaurer</button>
                    ) : (
                      <button onClick={() => setConfirmDelete(true)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Supprimer</button>
                    )}
                    {selected.deleted_at && (
                      <button onClick={() => setConfirmPurge(true)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Supprimer définitivement</button>
                    )}
                    <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center lg:hidden"><X className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-sand-50">
                  {(messages[selected.id] ?? []).map((m) => (
                    <div key={m.id} className={`flex gap-2 ${m.sender === 'CUSTOMER' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.sender === 'CUSTOMER' ? 'bg-indigo-100' : m.sender === 'EMPLOYEE' ? 'bg-blue-100' : 'bg-ocre-100'}`}>
                        {m.sender === 'CUSTOMER' ? <User className="w-4 h-4 text-indigo-600" /> : m.sender === 'EMPLOYEE' ? <Headset className="w-4 h-4 text-blue-600" /> : <Bot className="w-4 h-4 text-ocre-600" />}
                      </div>
                      <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line ${m.sender === 'CUSTOMER' ? 'bg-indigo-600 text-white rounded-tr-md' : m.sender === 'EMPLOYEE' ? 'bg-blue-600 text-white rounded-tl-md' : 'bg-white text-sand-800 rounded-tl-md shadow-sm border border-sand-200/60'}`}>
                        {m.content}
                        {m.intent && <div className="text-[10px] mt-1 opacity-60">Intent: {m.intent}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                {selected.status !== 'CLOSED' && (
                  <div className="p-3 border-t border-sand-200 flex gap-2">
                    <input className="input flex-1" placeholder="Répondre en tant que conseiller..." value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} />
                    <button onClick={() => void send()} disabled={sending || !reply.trim()} className="btn-primary px-4"><Send className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            ) : (
              <div className="card p-12 text-center text-sand-400 h-[600px] flex items-center justify-center">
                <div><MessageSquare className="w-12 h-12 text-sand-300 mx-auto mb-3" /><p>Sélectionnez une conversation</p></div>
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDelete && (
        <ConfirmPasswordModal
          title="Supprimer la conversation"
          description="La conversation sera déplacée en corbeille (récupérable) et non supprimée définitivement. Une sauvegarde récente (moins d'1h) est requise."
          onCancel={() => setConfirmDelete(false)}
          onConfirmed={() => void doDelete()}
        />
      )}
      {confirmPurge && (
        <ConfirmPasswordModal
          title="Supprimer définitivement"
          description="La conversation sera effacée de façon permanente, avec tous ses messages, et ne pourra plus être restaurée. Une sauvegarde récente (moins d'1h) est requise."
          onCancel={() => setConfirmPurge(false)}
          onConfirmed={() => void doPurge()}
        />
      )}
    </div>
  );
}
