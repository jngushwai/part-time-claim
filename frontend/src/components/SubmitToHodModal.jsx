import { useState, useRef } from 'react';
import Modal from './ui/Modal';
import api from '../utils/api';
import { fmt } from '../utils/format';
import { useToast } from './ui/Toast';

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SubmitToHodModal({ isOpen, onClose, preview, month, year, onSubmitted, onDownloadInstead }) {
  const [hodName, setHodName] = useState('');
  const [hodEmail, setHodEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef();
  const toast = useToast();

  if (!isOpen || !preview) return null;

  const isResubmit = preview.submission?.status === 'Rejected';
  const existingAttendance = preview.attendance || null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast('Please select a PDF file (.pdf)', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Attendance PDF must be 10 MB or smaller', 'error');
      e.target.value = '';
      return;
    }
    setPdfFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('month', String(month));
      formData.append('year', String(year));
      formData.append('hodName', hodName);
      formData.append('hodEmail', hodEmail);
      formData.append('notes', notes);
      if (pdfFile) {
        formData.append('file', pdfFile);
      }
      const res = await api.post('/claims/submit', formData);
      toast(isResubmit ? 'Claim resubmitted to HOD for review' : 'Claim submitted to HOD for review');
      setHodName('');
      setHodEmail('');
      setNotes('');
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

        {/* Attendance Sheet PDF Attachment */}
        <div>
          <label className="label">Signed Attendance Sheet (PDF)</label>
          <div className="border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50 space-y-2">
            {pdfFile ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-red-500 text-lg">📄</span>
                  <div className="truncate">
                    <div className="font-medium text-gray-800 truncate">{pdfFile.name}</div>
                    <div className="text-xs text-gray-400">{formatFileSize(pdfFile.size)} · Ready to attach</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-red-500 hover:underline whitespace-nowrap"
                >
                  Remove
                </button>
              </div>
            ) : existingAttendance ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-green-600 text-lg">📄</span>
                  <div className="truncate">
                    <div className="font-medium text-gray-800 truncate">{existingAttendance.originalName}</div>
                    <div className="text-xs text-green-700">
                      ✓ Already uploaded ({formatFileSize(existingAttendance.fileSize)}) — will be attached
                    </div>
                  </div>
                </div>
                <label className="text-xs font-semibold text-primary hover:underline cursor-pointer whitespace-nowrap">
                  Replace PDF
                  <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            ) : (
              <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-lg">📎</span>
                  <div>
                    <div className="font-medium text-gray-700">Upload Attendance PDF</div>
                    <div className="text-xs text-gray-400">PDF only · Max 10 MB</div>
                  </div>
                </div>
                <span className="btn-secondary text-xs">Choose PDF</span>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
              </label>
            )}
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
            rows={2}
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
