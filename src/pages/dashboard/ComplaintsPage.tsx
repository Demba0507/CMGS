import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, X, AlertCircle, Send } from 'lucide-react';
import { listComplaints, listComplaintMessages, addComplaintMessage, updateComplaint } from '@/lib/complaints';
import { useToast } from '@/lib/toast';
import type { Complaint, ComplaintMessage } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_COLORS, CHANNEL_LABELS } from '@/lib/constants';

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<Complaint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setComplaints(await listComplaints());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = filterStatus ? complaints.filter((c) => c.status === filterStatus) : complaints;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="card p-5 flex items-start gap-3 bg-red-50 border-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900">{complaints.length} réclamations</h2>
          <p className="text-sm text-sand-500">Service client</p>
        </div>
        <select className="input max-w-[200px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(COMPLAINT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sand-400 text-sm">Aucune réclamation pour le moment.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="card p-4 cursor-pointer hover:bg-sand-50" onClick={() => setSelected(c)}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sand-900 text-sm">{c.subject}</span>
                <span className={`badge ${COMPLAINT_STATUS_COLORS[c.status]}`}>{COMPLAINT_STATUS_LABELS[c.status]}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-sand-400">
                <span className="badge bg-sand-100 text-sand-600">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                <span>{timeAgo(c.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <ComplaintDetail complaint={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void load(); }} />}
    </div>
  );
}

function ComplaintDetail({ complaint, onClose, onChanged }: { complaint: Complaint; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [messages, setMessages] = useState<ComplaintMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await listComplaintMessages(complaint.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [complaint.id]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await addComplaintMessage(complaint.id, reply.trim());
      setReply('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer.");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (changingStatus) return;
    setChangingStatus(true);
    try {
      await updateComplaint(complaint.id, status);
      toast.success('Réclamation mise à jour.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de mettre à jour.');
      setChangingStatus(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-ocre-600" /><h2 className="font-display text-lg font-bold text-sand-900">{complaint.subject}</h2></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3 flex-1">
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(COMPLAINT_STATUS_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => void changeStatus(k)} disabled={changingStatus} className={`text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-50 ${complaint.status === k ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>{v}</button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-sand-400">Chargement...</p>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'EMPLOYEE' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${m.sender === 'EMPLOYEE' ? 'bg-indigo-600 text-white' : 'bg-sand-100 text-sand-800'}`}>{m.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-sand-200 flex gap-2">
          <input className="input flex-1" placeholder="Répondre..." value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} />
          <button onClick={() => void send()} disabled={sending || !reply.trim()} className="btn-primary px-4"><Send className="w-4 h-4" /></button>
        </div>
        {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
