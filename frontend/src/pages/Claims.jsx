import { useState, useEffect } from 'react';
import api from '../utils/api';
import { fmt, MONTHS, currentMonth, currentYear } from '../utils/format';
import { useToast } from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import SubmitClaimModal from '../components/SubmitClaimModal';
import SubmitToHodModal from '../components/SubmitToHodModal';
import { db, collection, getDocs, query, orderBy } from '../utils/firebase';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showHodModal, setShowHodModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null); // { submission, decision }
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
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
  const canSubmitToHod = hasMonthlySessions && (!currentSubmission || currentSubmission.status === 'Rejected');

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Generate & Submit Claims</h1>
          <p className="text-gray-500 text-sm">Preview generated Consultancy Claim Forms, submit directly to your HOD, or download as Excel</p>
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
        !hasMonthlySessions ? (
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
                Submit this claim directly to your Head of Department for approval or download the Excel copy.
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
        )
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
                  Track approval status, download Excel copies, or manage pending submissions
                </p>
              </div>
              <span className="text-xs text-gray-500 font-medium">{submissions.length} claim(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['PERIOD', 'LECTURER / DEPT', 'SESSIONS / HRS', 'GROSS PAY', 'HOD', 'STATUS', 'SUBMITTED', 'ACTIONS'].map(h => (
                      <th key={h} className="table-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(sub => (
                    <tr key={sub.id} className="hover:bg-gray-50 align-top">
                      <td className="table-td font-semibold whitespace-nowrap">
                        {sub.monthName}, {sub.year}
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
                      <td className="table-td text-xs text-gray-600">
                        <div>{sub.hodName || 'Department HOD'}</div>
                        {sub.hodEmail && <div className="text-gray-400">{sub.hodEmail}</div>}
                      </td>
                      <td className="table-td">
                        <StatusBadge status={sub.status} />
                        {sub.hodRemarks && (
                          <div className="text-xs text-gray-500 mt-1 max-w-[180px]">{sub.hodRemarks}</div>
                        )}
                      </td>
                      <td className="table-td text-xs text-gray-400 whitespace-nowrap">
                        {new Date(sub.submittedAt).toLocaleDateString()}
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
            </div>
            <div>
              <label className="label">HOD Remarks (Optional)</label>
              <textarea
                rows={3}
                className="input"
                placeholder={
                  reviewTarget.decision === 'Approved'
                    ? 'e.g. Verified against timetable and approved for payment.'
                    : 'e.g. Please verify hours for CS102 and resubmit.'
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

      <SubmitClaimModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSuccess={() => loadFirestoreClaims()}
      />
    </div>
  );
}
