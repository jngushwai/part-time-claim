import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { fmt, MONTHS, currentYear } from '../../utils/format';
import { useToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import PdfPreviewModal from '../../components/PdfPreviewModal';

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

export default function AdminClaims() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'All');
  const [teacherFilter, setTeacherFilter] = useState(searchParams.get('teacherId') || 'all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [submissions, setSubmissions] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [counts, setCounts] = useState({ All: 0, Pending: 0, Approved: 0, Rejected: 0 });
  const [loading, setLoading] = useState(true);

  const [pdfPreview, setPdfPreview] = useState(null);
  const [inspectData, setInspectData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const toast = useToast();

  const loadClaims = async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/claims', {
        params: {
          status: statusFilter,
          teacherId: teacherFilter,
          month: monthFilter,
          year: yearFilter,
          q: search || undefined
        }
      });
      setSubmissions(r.data.submissions || []);
      setCounts(r.data.counts || { All: 0, Pending: 0, Approved: 0, Rejected: 0 });
      setTeachers(r.data.teachers || []);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load submitted claims', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => loadClaims(), 150);
    return () => clearTimeout(t);
  }, [statusFilter, teacherFilter, monthFilter, yearFilter, search]);

  const fetchAttendanceBlob = async (sub, asDownload) => {
    const token = localStorage.getItem('dit_token');
    const dl = asDownload ? '&download=1' : '';
    const url = `${API_BASE}/claims/attendance/file?month=${sub.month}&year=${sub.year}&userId=${sub.userId}${dl}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Could not load attendance PDF');
    return await res.blob();
  };

  const openAttendancePdf = async (sub) => {
    try {
      const blob = await fetchAttendanceBlob(sub, false);
      setPdfPreview({
        url: URL.createObjectURL(blob),
        name: sub.attendancePdfName || `attendance_${sub.monthName}_${sub.year}.pdf`,
        subtitle: `${sub.lecturerName} · ${sub.monthName} ${sub.year}`
      });
    } catch {
      toast('Failed to open attendance PDF', 'error');
    }
  };

  const downloadAttendancePdf = async (sub) => {
    try {
      const blob = await fetchAttendanceBlob(sub, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', sub.attendancePdfName || `attendance_${sub.monthName}_${sub.year}.pdf`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Attendance PDF downloaded');
    } catch {
      toast('Failed to download attendance PDF', 'error');
    }
  };

  const downloadExcel = async (sub) => {
    try {
      const token = localStorage.getItem('dit_token');
      const url = `${API_BASE}/claims/excel?month=${sub.month}&year=${sub.year}&userId=${sub.userId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.setAttribute('download', `claim_${sub.lecturerName.replace(/\s+/g, '_')}_${sub.monthName}_${sub.year}.xlsx`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      toast('Claim form (.xlsx) downloaded');
    } catch {
      toast('Download failed', 'error');
    }
  };

  const inspectClaim = async (sub) => {
    setInspectLoading(true);
    setInspectData({ loading: true, sub });
    try {
      const r = await api.get('/claims/preview', {
        params: { month: sub.month, year: sub.year, userId: sub.userId }
      });
      setInspectData({ sub, preview: r.data });
    } catch {
      toast('Failed to load claim details', 'error');
      setInspectData(null);
    } finally {
      setInspectLoading(false);
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
      loadClaims();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to update status', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  const resetFilters = () => {
    setStatusFilter('All');
    setTeacherFilter('all');
    setMonthFilter('all');
    setYearFilter('all');
    setSearch('');
    setSearchParams({});
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const filteredTotalGross = submissions.reduce((sum, s) => sum + s.gross, 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">All Submitted Claims</h1>
          <p className="text-gray-500 text-sm">Review teacher claims, inspect teaching sessions and attendance PDFs, and approve or reject submissions</p>
        </div>
        <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          Showing <strong>{submissions.length}</strong> claim(s) · Total <strong className="text-primary">TZS {fmt(filteredTotalGross)}</strong>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {['All', 'Pending', 'Approved', 'Rejected'].map(st => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              statusFilter === st
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <span>{st}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              statusFilter === st ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'
            }`}>
              {counts[st] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Search by teacher name, email, department, or HOD…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input w-48" value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)}>
          <option value="all">All Teachers</option>
          {teachers.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select className="input w-36" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
          <option value="all">All Months</option>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="input w-28" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="all">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(statusFilter !== 'All' || teacherFilter !== 'all' || monthFilter !== 'all' || yearFilter !== 'all' || search) && (
          <button onClick={resetFilters} className="btn-secondary text-xs">
            Reset
          </button>
        )}
      </div>

      {/* Claims Table */}
      {loading ? (
        <div className="card flex items-center justify-center py-20 text-gray-400">Loading submitted claims…</div>
      ) : submissions.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-3">📑</div>
          <p className="text-gray-500">No submitted claims match the current filters</p>
          <p className="text-xs text-gray-400 mt-1">Try resetting filters or wait for teachers to submit their monthly claims</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['PERIOD', 'TEACHER / DEPT', 'SESSIONS / HRS', 'GROSS PAY', 'ATTENDANCE PDF', 'HOD', 'STATUS', 'ACTIONS'].map(h => (
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
                    <div className="font-semibold text-gray-800">{sub.lecturerName}</div>
                    <div className="text-xs text-gray-400 font-mono">{sub.user?.email}</div>
                    <div className="text-xs text-gray-500">{sub.department}</div>
                    {sub.notes && (
                      <div className="text-xs text-gray-500 mt-1 italic">Note: {sub.notes}</div>
                    )}
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <div>{sub.sessionCount} sessions</div>
                    <div className="text-xs text-gray-400">{sub.totalHours} hrs</div>
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <div className="font-bold text-primary">TZS {fmt(sub.gross)}</div>
                    <div className="text-[11px] text-gray-400">
                      Tuition {fmt(sub.totalTuition)} + Trans {fmt(sub.totalTransport)}
                    </div>
                  </td>
                  <td className="table-td">
                    {sub.attendancePdfName ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-gray-700 max-w-[150px] truncate" title={sub.attendancePdfName}>
                          📄 {sub.attendancePdfName}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openAttendancePdf(sub)}
                            className="px-2 py-0.5 text-xs font-medium rounded border border-blue-200 text-primary hover:bg-blue-50"
                          >
                            View PDF
                          </button>
                          <button
                            onClick={() => downloadAttendancePdf(sub)}
                            className="px-2 py-0.5 text-xs font-medium rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
                            title="Download Attendance PDF"
                          >
                            ⬇
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not attached</span>
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
                        onClick={() => inspectClaim(sub)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-blue-200 text-primary hover:bg-blue-50"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => downloadExcel(sub)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        ⬇ .xlsx
                      </button>
                      {sub.status !== 'Approved' && (
                        <button
                          onClick={() => openReviewModal(sub, 'Approved')}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700"
                        >
                          Approve
                        </button>
                      )}
                      {sub.status !== 'Rejected' && (
                        <button
                          onClick={() => openReviewModal(sub, 'Rejected')}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-500 text-white hover:bg-red-600"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Claim Breakdown Inspect Modal */}
      {inspectData && (
        <Modal
          title={`Claim Breakdown — ${inspectData.sub.lecturerName} (${inspectData.sub.monthName} ${inspectData.sub.year})`}
          onClose={() => setInspectData(null)}
          maxWidth="max-w-4xl"
        >
          {inspectLoading || inspectData.loading ? (
            <div className="py-12 text-center text-gray-400">Loading claim sessions…</div>
          ) : (
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-lg">
                <div><strong>Lecturer:</strong> {inspectData.preview.lecturer?.name || inspectData.sub.lecturerName}</div>
                <div><strong>Department:</strong> {inspectData.preview.lecturer?.department || inspectData.sub.department}</div>
                <div><strong>Bank:</strong> {inspectData.preview.lecturer?.bank || '—'} · {inspectData.preview.lecturer?.branch || '—'}</div>
                <div><strong>Account:</strong> {inspectData.preview.lecturer?.accountNo || 'Not set'}</div>
              </div>

              {inspectData.preview.modules.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">No underlying sessions found for this month.</div>
              ) : (
                inspectData.preview.modules.map(m => (
                  <div key={`${m.module.id}-${m.class?.id ?? ''}`} className="overflow-x-auto">
                    <div className="bg-gray-100 px-3 py-1.5 font-bold text-xs text-gray-700 rounded">
                      MODULE: {m.module.name} ({m.module.code}){m.class ? ` — ${m.class.code}` : ''}
                    </div>
                    <table className="w-full text-xs mt-1">
                      <thead>
                        <tr className="bg-gray-50">
                          {['DATE', 'CLASS', 'TIME', 'HRS', 'RATE', 'TUITION', 'TRANSPORT'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-semibold text-gray-500 border">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.sessions.map(s => (
                          <tr key={s.id} className="border-b">
                            <td className="px-2 py-1.5 border font-mono">{s.date}</td>
                            <td className="px-2 py-1.5 border">{s.class?.code}</td>
                            <td className="px-2 py-1.5 border">{s.startTime}–{s.endTime}</td>
                            <td className="px-2 py-1.5 border font-bold">{s.hours}</td>
                            <td className="px-2 py-1.5 border">{fmt(s.hourlyRate)}</td>
                            <td className="px-2 py-1.5 border">{fmt(s.tuition)}</td>
                            <td className="px-2 py-1.5 border">{s.transport ? fmt(s.transport) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}

              <div className="border-t-2 border-gray-800 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-600">Total Tuition</span>
                  <span className="font-bold text-primary">TZS {fmt(inspectData.preview.totalTuition)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-600">Total Transport</span>
                  <span className="font-bold text-accent">TZS {fmt(inspectData.preview.totalTransport)}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="font-bold text-gray-800">Gross Pay</span>
                  <span className="font-bold text-green-600">TZS {fmt(inspectData.preview.gross)}</span>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Approve / Reject Review Modal */}
      {reviewTarget && (
        <Modal
          title={`${reviewTarget.decision} Claim — ${reviewTarget.submission.monthName} ${reviewTarget.submission.year}`}
          onClose={() => setReviewTarget(null)}
        >
          <form onSubmit={confirmReview} className="space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1">
              <div><span className="font-semibold">Teacher:</span> {reviewTarget.submission.lecturerName}</div>
              <div><span className="font-semibold">Department:</span> {reviewTarget.submission.department}</div>
              <div><span className="font-semibold">Gross Pay:</span> TZS {fmt(reviewTarget.submission.gross)}</div>
              <div>
                <span className="font-semibold">Attendance PDF:</span>{' '}
                {reviewTarget.submission.attendancePdfName || 'Not attached'}
              </div>
            </div>
            <div>
              <label className="label">Admin / HOD Remarks (Optional)</label>
              <textarea
                rows={3}
                className="input"
                placeholder={
                  reviewTarget.decision === 'Approved'
                    ? 'e.g. Verified against signed attendance sheet and approved for payment.'
                    : 'e.g. Please attach signed attendance PDF and resubmit.'
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

      <PdfPreviewModal pdf={pdfPreview} onClose={() => setPdfPreview(null)} />
    </div>
  );
}
