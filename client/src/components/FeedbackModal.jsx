import React, { useState } from 'react';
import { X, Bug, MessageSquare, Sparkles, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

export default function FeedbackModal({ isOpen, onClose, user }) {
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!title.trim() || !description.trim()) {
      setErrorMsg('Please enter both a title and description.');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitFeedback({
        type,
        title: title.trim(),
        description: description.trim(),
        severity: type === 'bug' ? severity : 'low',
        userName: user?.name,
        userEmail: user?.email
      });
      setSuccessMsg('Thank you! Your report has been submitted to the web developer team.');
      setTitle('');
      setDescription('');
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 2500);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#133966] bg-[#040d1a] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#133966] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-[#00a896]/15 p-2 text-[#00C49F]">
              {type === 'bug' ? <Bug className="h-5 w-5" /> : type === 'feature' ? <Sparkles className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Help & Feedback</h3>
              <p className="text-xs text-slate-400">Report bugs or submit feedback to the developer team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#133966]/50 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {successMsg ? (
          <div className="my-8 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-12 w-12 text-[#00C49F] mb-3 animate-bounce" />
            <h4 className="text-base font-bold text-white">Report Received</h4>
            <p className="mt-1 text-xs text-slate-300 max-w-xs">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Type Switcher */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('bug')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                  type === 'bug'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                }`}
              >
                <Bug className="h-3.5 w-3.5" /> Bug Report
              </button>
              <button
                type="button"
                onClick={() => setType('feedback')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                  type === 'feedback'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Feedback
              </button>
              <button
                type="button"
                onClick={() => setType('feature')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                  type === 'feature'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-[#071b34] text-slate-400 border border-[#133966] hover:text-white'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> Suggestion
              </button>
            </div>

            {/* Severity (for bugs) */}
            {type === 'bug' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">Severity / Urgency</label>
                <div className="flex gap-2">
                  {['low', 'medium', 'high', 'critical'].map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSeverity(lvl)}
                      className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold uppercase transition-all ${
                        severity === lvl
                          ? lvl === 'critical' ? 'bg-rose-600 text-white' : lvl === 'high' ? 'bg-amber-600 text-white' : 'bg-[#00a896] text-[#040d1a]'
                          : 'bg-[#071b34] text-slate-400 border border-[#133966]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Issue / Feedback Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={type === 'bug' ? 'e.g., Timetable row misaligned on mobile screen' : 'e.g., Suggestion to add attendance percent filter'}
                className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-[#00a896] focus:outline-none"
                maxLength={180}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Detailed Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Explain the problem or idea in detail. If reporting a bug, mention what device/browser you are using and the steps to reproduce it."
                className="w-full rounded-xl border border-[#133966] bg-[#071b34] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-[#00a896] focus:outline-none"
                maxLength={4000}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#133966] px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00a896] to-[#00C49F] px-5 py-2 text-xs font-black text-[#040d1a] disabled:opacity-50 hover:opacity-90"
              >
                <Send className="h-3.5 w-3.5" />
                {submitting ? 'Submitting...' : 'Send to Dev Team'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
