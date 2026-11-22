import { useState } from 'react';
import Modal from './ui/Modal';
import api from '../utils/api';
import { fmt } from '../utils/format';
import { useToast } from './ui/Toast';

export default function SubmitToHodModal({ isOpen, onClose, preview, month, year, onSubmitted, onDownloadInstead }) {
  const [hodName, setHodName] = useState('');
  const [hodEmail, setHodEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  if (!isOpen || !preview) return null;

  const isResubmit = preview.submission?.status === 'Rejected';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/claims/submit', {
        month,
        year,
        hodName,
        hodEmail,
        notes
      });
      toast(isResubmit ? 'Claim resubmitted to HOD for review' : 'Claim submitted to HOD for review');
      setHodName('');
      setHodEmail('');
      setNotes('');
      if (onSubmitted) onSubmitted(res.data);
      onClose();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to submit claim to HOD', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isResubmit ? 'Resubmit Claim to HOD' : 'Submit Generated Claim to HOD'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Claim Period</span>
            <span className="font-bold text-gray-800">{preview.month}, {preview.year}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Department</span>
            <span className="font-semibold text-gray-700">{preview.lecturer?.department}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Sessions / Hours</span>
            <span className="font-semibold text-gray-700">{preview.sessionCount} sessions · {preview.totalHours} hrs</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tuition + Transport</span>
            <span className="text-gray-700">TZS {fmt(preview.totalTuition)} + {fmt(preview.totalTransport)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-blue-200">
            <span className="font-bold text-gray-800">Gross Claim Amount</span>
            <span className="font-bold text-green-700 text-base">TZS {fmt(preview.gross)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">HOD Name (Optional)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Dr. Head of Department"
              value={hodName}
              onChange={e => setHodName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">HOD Email (Optional)</label>
            <input
              type="email"
              className="input"
              placeholder="hod@dit.ac.tz"
              value={hodEmail}
              onChange={e => setHodEmail(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Remarks / Note to HOD (Optional)</label>
          <textarea
            rows={3}
            className="input"
            placeholder="Any supporting note for the Head of Department..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100">
          {onDownloadInstead && (
            <button
              type="button"
              onClick={() => { onClose(); onDownloadInstead(); }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              ⬇ Download Excel (.xlsx) instead
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-accent disabled:opacity-60">
              {submitting ? 'Submitting…' : isResubmit ? 'Resubmit to HOD' : 'Submit to HOD'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
