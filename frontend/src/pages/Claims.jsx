import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { fmt, MONTHS, currentMonth, currentYear } from '../utils/format';
import { useToast } from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import SubmitClaimModal from '../components/SubmitClaimModal';
import SubmitToHodModal from '../components/SubmitToHodModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import { db, collection, getDocs, query, orderBy } from '../utils/firebase';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function StatusBadge({ status }) {
  const s = status || 'Pending';
  const cls =
    s === 'Approved' ? 'bg-green-100 text-green-800' :
    s === 'Rejected' ? 'bg-red-100 text-red-800' :
    'bg-amber-100 text-amber-800';
  return (
    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold ${cls}`}>
      {s}
    </span>
  );
}

export default function Claims() {
  const [tab, setTab] = useState('monthly'); // 'monthly' | 'submissions' | 'summary' | 'firestore'
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [isReviewer, setIsReviewer] = useState(false);
  const [firestoreClaims, setFirestoreClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null); // { url, name, subtitle }
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showHodModal, setShowHodModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null); // { submission, decision }
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const attendanceInputRef = useRef();
  const toast = useToast();

  const loadPreview = async () => {
    setLoading(true);
    try {
      const r = await api.get('/claims/preview', { params: { month, year } });
      setPreview(r.data);
    } catch { toast('Error loading preview', 'error'); }
    finally { setLoading(false); }
  };

  const loadSummary = async () => {
    setLoading(true);
    try {
      const r = await api.get('/claims/summary-preview', { params: { year } });
      setSummary(r.data);
    } catch { toast('Error loading summary', 'error'); }
    finally { setLoading(false); }
  };

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const r = await api.get('/claims/submissions');
      setSubmissions(r.data.submissions || []);
      setIsReviewer(Boolean(r.data.isReviewer));
    } catch { toast('Error loading submitted claims', 'error'); }
    finally { setLoading(false); }
  };

  const loadFirestoreClaims = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'claims'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFirestoreClaims(list);
    } catch (err) {
      console.error('Error loading Firestore claims:', err);
      toast('Error loading Firestore claims', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'monthly') loadPreview();
    else if (tab === 'submissions') loadSubmissions();
    else if (tab === 'summary') loadSummary();
    else if (tab === 'firestore') loadFirestoreClaims();
  }, [month, year, tab]);

  const download = async (type, opts = {}) => {
    try {
      const targetMonth = opts.month || month;
      const targetYear = opts.year || year;
      const userParam = opts.userId ? `&userId=${opts.userId}` : '';
      const url = type === 'claim'
        ? `${API_BASE}/claims/excel?month=${targetMonth}&year=${targetYear}${userParam}`
        : `${API_BASE}/claims/summary-excel?year=${targetYear}`;
      const token = localStorage.getItem('dit_token');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.setAttribute(
        'download',
        type === 'claim'
          ? `claim_${MONTHS[targetMonth - 1]}_${targetYear}.xlsx`
          : `summary_${targetYear}.xlsx`
      );
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      toast(`${type === 'claim' ? 'Claim form' : 'Summary'} downloaded`);
    } catch { toast('Download failed', 'error'); }
  };

  const uploadAttendancePdf = async (file, targetMonth = month, targetYear = year) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast('Only PDF files (.pdf) are allowed', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Attendance PDF must be 10 MB or smaller', 'error');
      return;
    }
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append('month', String(targetMonth));
      fd.append('year', String(targetYear));
      fd.append('file', file);
      await api.post('/claims/attendance', fd);
      toast('Attendance PDF uploaded');
      if (tab === 'monthly') loadPreview();
      else if (tab === 'submissions') loadSubmissions();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to upload attendance PDF', 'error');
    } finally {
      setUploadingPdf(false);
      if (attendanceInputRef.current) attendanceInputRef.current.value = '';
    }
  };

  const fetchAttendanceBlob = async ({ targetMonth, targetYear, userId, asDownload }) => {
    const userParam = userId ? `&userId=${userId}` : '';
    const dlParam = asDownload ? '&download=1' : '';
    const url = `${API_BASE}/claims/attendance/file?month=${targetMonth}&year=${targetYear}${userParam}${dlParam}`;
    const token = localStorage.getItem('dit_token');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Could not load attendance PDF');
    return await res.blob();
  };

  const openAttendancePreview = async ({ targetMonth = month, targetYear = year, userId, name, subtitle }) => {
    try {
      const blob = await fetchAttendanceBlob({ targetMonth, targetYear, userId, asDownload: false });
      const url = URL.createObjectURL(blob);
      setPdfPreview({
        url,
        name: name || `attendance_${MONTHS[targetMonth - 1]}_${targetYear}.pdf`,
        subtitle: subtitle || `${MONTHS[targetMonth - 1]} ${targetYear}`
      });
    } catch {
      toast('Failed to open attendance PDF', 'error');
    }
  };

  const downloadAttendancePdf = async ({ targetMonth = month, targetYear = year, userId, name }) => {
    try {
      const blob = await fetchAttendanceBlob({ targetMonth, targetYear, userId, asDownload: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', name || `attendance_${MONTHS[targetMonth - 1]}_${targetYear}.pdf`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Attendance PDF downloaded');
    } catch {
      toast('Failed to download attendance PDF', 'error');
    }
  };

  const removeAttendancePdf = async (targetMonth = month, targetYear = year) => {
    try {
      await api.delete('/claims/attendance', { params: { month: targetMonth, year: targetYear } });
      toast('Attendance PDF removed');
      if (tab === 'monthly') loadPreview();
      else if (tab === 'submissions') loadSubmissions();
    } catch (err) {
      toast(err.response?.data?.error || 'Could not remove attendance PDF', 'error');
    }
  };

  const withdrawSubmission = async (id) => {
    try {
      await api.delete(`/claims/submissions/${id}`);
      toast('Submission withdrawn');
      if (tab === 'monthly') loadPreview();
      else loadSubmissions();
    } catch (err) {
      toast(err.response?.data?.error || 'Could not withdraw submission', 'error');
    }
  };

  const openReviewModal = (submission, decision) => {
    setReviewTarget({ submission, decision });
    setReviewRemarks(submission.hodRemarks || '');
  };

  const confirmReview = async (e) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewSaving(true);
    try {
      await api.patch(`/claims/submissions/${reviewTarget.submission.id}/status`, {
        status: reviewTarget.decision,
        hodRemarks: reviewRemarks
      });
      toast(`Claim marked as ${reviewTarget.decision}`);
      setReviewTarget(null);
      setReviewRemarks('');
      loadSubmissions();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to update status', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const hasMonthlySessions = preview && preview.modules.length > 0;
  const currentSubmission = preview?.submission || null;
  const currentAttendance = preview?.attendance || null;
  const canEditAttendance = currentSubmission?.status !== 'Approved';
  const canSubmitToHod = hasMonthlySessions && (!currentSubmission || currentSubmission.status === 'Rejected');

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate & Submit Claims</h1>
          <p className="text-gray-500 text-sm">Upload attendance PDF, preview Consultancy Claim Forms, submit to HOD, or download Excel</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {tab === 'monthly' && (
            <select className="input w-36" value={month} onChange={e => setMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}
          {(tab === 'monthly' || tab === 'summary') && (
            <select className="input w-24" value={year} onChange={e => setYear(+e.target.value)}>
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          )}
          {tab === 'monthly' && hasMonthlySessions && (
            <>
              <button
                onClick={() => setShowHodModal(true)}
                disabled={!canSubmitToHod}
                className="btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  canSubmitToHod
                    ? 'Submit this generated claim to your Head of Department'
                    : `Already submitted (${currentSubmission?.status})`
                }
              >
                {currentSubmission?.status === 'Rejected'
                  ? '↻ Resubmit to HOD'
                  : currentSubmission
                    ? `✓ Submitted (${currentSubmission.status})`
                    : '📤 Submit to HOD'}
              </button>
              <button onClick={() => download('claim')} className="btn-primary">
                ⬇ Download Claim (.xlsx)
              </button>
            </>
          )}
          {tab === 'summary' && (
            <button onClick={() => download('summary')} className="btn-accent">⬇ Annual Summary (.xlsx)</button>
          )}
          {tab === 'firestore' && (
            <button onClick={() => setShowSubmitModal(true)} className="btn-accent">
              ➕ Submit Claim (Firestore)
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { id: 'monthly', label: 'Monthly Claim' },
          { id: 'submissions', label: 'Submitted to HOD' },
          { id: 'summary', label: 'Annual Summary' },
          { id: 'firestore', label: 'Firestore Claims' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-20 text-gray-400">Loading…</div>
      ) : tab === 'monthly' ? (
        <div className="space-y-4">
          {/* Monthly Attendance PDF Card */}
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border border-gray-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                currentAttendance ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-primary'
              }`}>
                📄
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-800">
                  Signed Attendance Sheet (PDF) — {MONTHS[month - 1]} {year}
                </div>
                {currentAttendance ? (
                  <div className="text-xs text-gray-500 truncate">
                    <span className="font-medium text-green-700">✓ {currentAttendance.originalName}</span>
                    {' · '}
                    {formatFileSize(currentAttendance.fileSize)}
                    {' · Uploaded '}
                    {new Date(currentAttendance.uploadedAt).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">
                    Upload your signed class attendance sheet (.pdf, max 10 MB) to attach with your claim for HOD review.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {currentAttendance && (
                <>
                  <button
                    type="button"
                    onClick={() => openAttendancePreview({
                      name: currentAttendance.originalName,
                      subtitle: `${MONTHS[month - 1]} ${year} Attendance Sheet`
                    })}
                    className="btn-secondary text-xs"
                  >
                    👁 View PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadAttendancePdf({ name: currentAttendance.originalName })}
                    className="btn-secondary text-xs"
                  >
                    ⬇ Download PDF
                  </button>
                </>
              )}
              {canEditAttendance && (
                <>
                  <label className={`btn-primary text-xs cursor-pointer ${uploadingPdf ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploadingPdf ? 'Uploading…' : currentAttendance ? '↻ Replace PDF' : '⬆ Upload Attendance PDF'}
                    <input
                      ref={attendanceInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      disabled={uploadingPdf}
                      onChange={e => uploadAttendancePdf(e.target.files?.[0])}
                    />
                  </label>
                  {currentAttendance && (
                    <button
                      type="button"
                      onClick={() => removeAttendancePdf()}
                      className="px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {!hasMonthlySessions ? (
            <div className="card text-center py-16">
              <div className="text-5xl mb-3">📋</div>
              <p className="text-gray-500">No sessions found for {MONTHS[month - 1]} {year}</p>
              <p className="text-xs text-gray-400 mt-1">Add sessions first, then generate, submit to HOD, or download your claim here</p>
            </div>
          ) : (
            <div className="card space-y-4">
              {/* HOD Submission Status Banner */}
              {currentSubmission && (
                <div className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-3 ${
                  currentSubmission.status === 'Approved'
                    ? 'bg-green-50 border-green-200'
                    : currentSubmission.status === 'Rejected'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2 font-semibold text-gray-800">
                      <span>HOD Submission Status:</span>
                      <StatusBadge status={currentSubmission.status} />
                    </div>
                    <div className="text-xs text-gray-600">
                      Submitted on {new Date(currentSubmission.submittedAt).toLocaleString()}
                      {currentSubmission.hodName ? ` · To: ${currentSubmission.hodName}` : ''}
                      {currentSubmission.hodEmail ? ` (${currentSubmission.hodEmail})` : ''}
                    </div>
                    {currentSubmission.hodRemarks && (
                      <div className="text-xs text-gray-700 font-medium">
                        HOD Remarks: {currentSubmission.hodRemarks}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {currentSubmission.status === 'Pending' && (
                      <button
                        onClick={() => withdrawSubmission(currentSubmission.id)}
                        className="btn-secondary text-xs"
                      >
                        Withdraw
                      </button>
                    )}
                    {currentSubmission.status === 'Rejected' && (
                      <button
                        onClick={() => setShowHodModal(true)}
                        className="btn-accent text-xs"
                      >
                        ↻ Resubmit to HOD
                      </button>
                    )}
                    <button
                      onClick={() => setTab('submissions')}
                      className="btn-secondary text-xs"
                    >
                      View All Submissions
                    </button>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="text-center border-b pb-4">
                <div className="font-bold text-gray-800 text-lg">DAR ES SALAAM INSTITUTE OF TECHNOLOGY</div>
                <div className="text-gray-600">{preview.lecturer.department} DEPARTMENT</div>
                <div className="font-bold text-gray-800">CONSULTANCY CLAIM FORM</div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div><span className="font-bold">LECTURER/TUTOR NAME:</span> {preview.lecturer.name}</div>
                <div><span className="font-bold">BANK:</span> {preview.lecturer.bank} – {preview.lecturer.branch}</div>
                <div><span className="font-bold">ADDRESS:</span> {preview.lecturer.address}</div>
                <div><span className="font-bold">ACCOUNT:</span> {preview.lecturer.accountNo} ({preview.lecturer.accountName})</div>
                <div><span className="font-bold">DEPARTMENT:</span> {preview.lecturer.department}</div>
                <div><span className="font-bold">ACADEMIC YEAR:</span> {preview.lecturer.academicYear}</div>
              </div>

              <div className="font-bold text-gray-700">MONTH: {preview.month}, {preview.year}</div>

              {/* Sessions by Module */}
              {preview.modules.map(m => (
                <div key={`${m.module.id}-${m.class?.id ?? ''}`} className="overflow-x-auto">
                  <div className="bg-gray-100 px-3 py-2 font-bold text-sm text-gray-700 rounded">
                    MODULE: {m.module.name} ({m.module.code}){m.class ? ` — ${m.class.code}` : ''}
                  </div>
                  <table className="w-full text-sm mt-1">
                    <thead>
                      <tr className="bg-gray-50">
                        {['DATE', 'CLASS', 'FROM', 'TO', 'HRS', 'RATE (TSHS)', 'TUITION (TSHS)', 'TRANSPORT (TSHS)'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 border">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.sessions.map(s => (
                        <tr key={s.id} className="border-b">
                          <td className="px-3 py-2 border text-xs font-mono">{s.date}</td>
                          <td className="px-3 py-2 border text-xs">{s.class?.code}</td>
                          <td className="px-3 py-2 border text-xs">{s.startTime}</td>
                          <td className="px-3 py-2 border text-xs">{s.endTime}</td>
                          <td className="px-3 py-2 border text-xs font-bold">{s.hours}</td>
                          <td className="px-3 py-2 border text-xs">{fmt(s.hourlyRate)}</td>
                          <td className="px-3 py-2 border text-xs">{fmt(s.tuition)}</td>
                          <td className="px-3 py-2 border text-xs">{s.transport ? fmt(s.transport) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50">
                        <td colSpan={6} className="px-3 py-2 text-right font-bold text-sm border">TOTAL</td>
                        <td className="px-3 py-2 font-bold text-primary border">{fmt(m.totalTuition)}</td>
                        <td className="px-3 py-2 font-bold text-accent border">{fmt(m.totalTransport)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}

              {/* Grand Totals */}
              <div className="border-t-2 border-gray-800 pt-4 space-y-1">
                {[
                  ['Total Tuition Payment', preview.totalTuition, 'text-primary'],
                  ['Total Transport Payment', preview.totalTransport, 'text-accent'],
                  [`Gross pay as per ${preview.month}, ${preview.year}`, preview.gross, 'text-green-600 text-xl'],
                ].map(([label, val, cls]) => (
                  <div key={label} className="flex justify-between items-center px-2">
                    <span className="font-bold text-gray-700">{label}</span>
                    <span className={`font-bold ${cls}`}>TZS {fmt(val)}</span>
                  </div>
                ))}
              </div>

              {/* Next Step Action Bar: Submit to HOD or Download */}
              <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50 -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">Ready to proceed?</span>{' '}
                  Submit this claim{currentAttendance ? ' (with attendance PDF attached)' : ''} to your Head of Department or download the Excel copy.
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => download('claim')} className="btn-secondary">
                    ⬇ Download Claim (.xlsx)
                  </button>
                  <button
                    onClick={() => setShowHodModal(true)}
                    disabled={!canSubmitToHod}
                    className="btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {currentSubmission?.status === 'Rejected'
                      ? '↻ Resubmit to HOD'
                      : currentSubmission
                        ? `✓ Submitted (${currentSubmission.status})`
                        : '📤 Submit to HOD'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : tab === 'submissions' ? (
        submissions.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-3">📤</div>
            <p className="text-gray-500">No claims submitted to HOD yet</p>
            <p className="text-xs text-gray-400 mt-1">Generate a monthly claim on the Monthly Claim tab and click "Submit to HOD"</p>
            <button onClick={() => setTab('monthly')} className="btn-primary mt-4">
              Go to Monthly Claim
            </button>
          </div>
        ) : (
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {isReviewer ? 'All Submitted Claims (HOD / Admin Review)' : 'My Submitted Claims to HOD'}
                </h2>
                <p className="text-xs text-gray-500">
                  Track approval status, view uploaded attendance PDFs, download Excel copies, or manage pending submissions
                </p>
              </div>
              <span className="text-xs text-gray-500 font-medium">{submissions.length} claim(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['PERIOD', 'LECTURER / DEPT', 'SESSIONS / HRS', 'GROSS PAY', 'ATTENDANCE PDF', 'HOD', 'STATUS', 'ACTIONS'].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(sub => (
                    <tr key={sub.id} className="hover:bg-gray-50 align-top">
                      <td className="table-td font-semibold whitespace-nowrap">
                        <div>{sub.monthName}, {sub.year}</div>
                        <div className="text-xs font-normal text-gray-400">
                          {new Date(sub.submittedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="table-td">
                        <div className="font-medium text-gray-800">{sub.lecturerName}</div>
                        <div className="text-xs text-gray-400">{sub.department}</div>
                        {sub.notes && (
                          <div className="text-xs text-gray-500 mt-1 italic">Note: {sub.notes}</div>
                        )}
                      </td>
                      <td className="table-td whitespace-nowrap">
                        <div>{sub.sessionCount} sessions</div>
                        <div className="text-xs text-gray-400">{sub.totalHours} hrs</div>
                      </td>
                      <td className="table-td font-bold text-primary whitespace-nowrap">
                        TZS {fmt(sub.gross)}
                      </td>
                      <td className="table-td">
                        {sub.attendancePdfName ? (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-gray-700 max-w-[160px] truncate" title={sub.attendancePdfName}>
                              📄 {sub.attendancePdfName}
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => openAttendancePreview({
                                  targetMonth: sub.month,
                                  targetYear: sub.year,
                                  userId: sub.userId,
                                  name: sub.attendancePdfName,
                                  subtitle: `${sub.lecturerName} · ${sub.monthName} ${sub.year}`
                                })}
                                className="px-2 py-0.5 text-xs font-medium rounded border border-blue-200 text-primary hover:bg-blue-50"
                              >
                                View PDF
                              </button>
                              <button
                                onClick={() => downloadAttendancePdf({
                                  targetMonth: sub.month,
                                  targetYear: sub.year,
                                  userId: sub.userId,
                                  name: sub.attendancePdfName
                                })}
                                className="px-2 py-0.5 text-xs font-medium rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
                                title="Download Attendance PDF"
                              >
                                ⬇
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-xs text-gray-400">Not attached</span>
                            {sub.status !== 'Approved' && (
                              <div>
                                <label className="inline-block px-2 py-0.5 text-xs font-medium rounded border border-blue-200 text-primary hover:bg-blue-50 cursor-pointer">
                                  + Upload PDF
                                  <input
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    className="hidden"
                                    onChange={e => uploadAttendancePdf(e.target.files?.[0], sub.month, sub.year)}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="table-td text-xs text-gray-600">
                        <div>{sub.hodName || 'Department HOD'}</div>
                        {sub.hodEmail && <div className="text-gray-400">{sub.hodEmail}</div>}
                      </td>
                      <td className="table-td">
                        <StatusBadge status={sub.status} />
                        {sub.hodRemarks && (
                          <div className="text-xs text-gray-500 mt-1 max-w-[160px]">{sub.hodRemarks}</div>
                        )}
                      </td>
                      <td className="table-td">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => download('claim', { month: sub.month, year: sub.year, userId: sub.userId })}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            title="Download Excel Claim Form"
                          >
                            ⬇ .xlsx
                          </button>
                          {isReviewer && sub.status !== 'Approved' && (
                            <button
                              onClick={() => openReviewModal(sub, 'Approved')}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700"
                            >
                              Approve
                            </button>
                          )}
                          {isReviewer && sub.status !== 'Rejected' && (
                            <button
                              onClick={() => openReviewModal(sub, 'Rejected')}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-500 text-white hover:bg-red-600"
                            >
                              Reject
                            </button>
                          )}
                          {sub.status === 'Pending' && (
                            <button
                              onClick={() => withdrawSubmission(sub.id)}
                              className="px-2.5 py-1 text-xs font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : tab === 'summary' ? (
        !summary || summary.rows.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-3">📊</div>
            <p className="text-gray-500">No sessions found for {year}</p>
            <p className="text-xs text-gray-400 mt-1">Add sessions across the year to see your annual summary</p>
          </div>
        ) : (
          <div className="card space-y-4">
            {/* Header */}
            <div className="text-center border-b pb-4">
              <div className="font-bold text-gray-800 text-lg">DAR ES SALAAM INSTITUTE OF TECHNOLOGY</div>
              <div className="text-gray-600">{summary.lecturer.department} DEPARTMENT</div>
              <div className="font-bold text-gray-800">SUMMARY OF CONSULTANCY CLAIM FORM</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="font-bold">LECTURER/TUTOR NAME:</span> {summary.lecturer.name}</div>
              <div><span className="font-bold">ACADEMIC YEAR:</span> {summary.lecturer.academicYear}</div>
            </div>

            <table className="w-full text-sm mt-1">
              <thead>
                <tr className="bg-gray-50">
                  {['MODULE', 'MONTH', 'SESSIONS', 'TUITION PAYMENT', 'TRANSPORT', 'TOTAL'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.rows.map(r => (
                  <tr key={r.month} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 border text-xs">{r.modules}</td>
                    <td className="px-3 py-2 border text-xs font-medium">{r.month}, {summary.year}</td>
                    <td className="px-3 py-2 border text-xs text-center">{r.sessionCount}</td>
                    <td className="px-3 py-2 border text-xs">{fmt(r.tuition)}</td>
                    <td className="px-3 py-2 border text-xs">{fmt(r.transport)}</td>
                    <td className="px-3 py-2 border text-xs font-bold text-primary">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50">
                  <td colSpan={3} className="px-3 py-2 text-right font-bold text-sm border">TOTAL AMOUNT</td>
                  <td className="px-3 py-2 font-bold text-primary border">{fmt(summary.grandTuition)}</td>
                  <td className="px-3 py-2 font-bold text-accent border">{fmt(summary.grandTransport)}</td>
                  <td className="px-3 py-2 font-bold text-green-600 border">{fmt(summary.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="border-t-2 border-gray-800 pt-4 flex justify-between items-center px-2">
              <span className="font-bold text-gray-700">Gross pay for {year}</span>
              <span className="font-bold text-green-600 text-xl">TZS {fmt(summary.grandTotal)}</span>
            </div>
          </div>
        )
      ) : (
        firestoreClaims.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-3">☁️</div>
            <p className="text-gray-500">No claims submitted to Firestore yet</p>
            <p className="text-xs text-gray-400 mt-1">Click "Submit Claim (Firestore)" above to add one</p>
          </div>
        ) : (
          <div className="card space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Submitted Firestore Claims</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {['DATE', 'DEPARTMENT', 'HOURS', 'STATUS', 'SUBMITTED AT'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {firestoreClaims.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="table-td font-mono">{c.date}</td>
                    <td className="table-td font-medium">{c.department}</td>
                    <td className="table-td font-bold">{c.hours} hrs</td>
                    <td className="table-td">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="table-td text-gray-400 text-xs">
                      {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : 'Just now'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Submit Generated Claim to HOD Modal */}
      <SubmitToHodModal
        isOpen={showHodModal}
        onClose={() => setShowHodModal(false)}
        preview={preview}
        month={month}
        year={year}
        onSubmitted={() => {
          loadPreview();
        }}
        onDownloadInstead={() => download('claim')}
      />

      {/* HOD Review (Approve / Reject) Modal */}
      {reviewTarget && (
        <Modal
          title={`${reviewTarget.decision} Claim — ${reviewTarget.submission.monthName} ${reviewTarget.submission.year}`}
          onClose={() => setReviewTarget(null)}
        >
          <form onSubmit={confirmReview} className="space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1">
              <div><span className="font-semibold">Lecturer:</span> {reviewTarget.submission.lecturerName}</div>
              <div><span className="font-semibold">Department:</span> {reviewTarget.submission.department}</div>
              <div><span className="font-semibold">Gross Pay:</span> TZS {fmt(reviewTarget.submission.gross)}</div>
              <div>
                <span className="font-semibold">Attendance PDF:</span>{' '}
                {reviewTarget.submission.attendancePdfName || 'Not attached'}
              </div>
            </div>
            <div>
              <label className="label">HOD Remarks (Optional)</label>
              <textarea
                rows={3}
                className="input"
                placeholder={
                  reviewTarget.decision === 'Approved'
                    ? 'e.g. Verified against attendance sheet and approved for payment.'
                    : 'e.g. Please attach signed attendance sheet and resubmit.'
                }
                value={reviewRemarks}
                onChange={e => setReviewRemarks(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setReviewTarget(null)} className="btn-secondary">Cancel</button>
              <button
                type="submit"
                disabled={reviewSaving}
                className={reviewTarget.decision === 'Approved' ? 'btn-accent' : 'btn-danger'}
              >
                {reviewSaving ? 'Saving…' : `Confirm ${reviewTarget.decision}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* In-App Attendance PDF Preview Modal */}
      <PdfPreviewModal pdf={pdfPreview} onClose={() => setPdfPreview(null)} />

      <SubmitClaimModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSuccess={() => loadFirestoreClaims()}
      />
    </div>
  );
}
