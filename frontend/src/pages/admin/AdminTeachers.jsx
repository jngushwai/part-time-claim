import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { fmt, MONTHS } from '../../utils/format';
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
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      {s}
    </span>
  );
}

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);

  const navigate = useNavigate();
  const toast = useToast();

  const loadTeachers = async (q = search, dept = department) => {
    setLoading(true);
    try {
      const r = await api.get('/admin/teachers', {
        params: {
          q: q || undefined,
          department: dept !== 'all' ? dept : undefined
        }
      });
      setTeachers(r.data.teachers || []);
      setDepartments(r.data.departments || []);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load teachers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => loadTeachers(search, department), 200);
    return () => clearTimeout(t);
  }, [search, department]);

  const openTeacherDetail = async (id) => {
    setDetailLoading(true);
    setDetail({ loading: true });
    try {
      const r = await api.get(`/admin/teachers/${id}`);
      setDetail(r.data);
    } catch (err) {
      toast(err.response?.data?.error || 'Could not load teacher details', 'error');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openAttendancePdf = async (sub) => {
    try {
      const token = localStorage.getItem('dit_token');
      const url = `${API_BASE}/claims/attendance/file?month=${sub.month}&year=${sub.year}&userId=${sub.userId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Could not load attendance PDF');
      const blob = await res.blob();
      setPdfPreview({
        url: URL.createObjectURL(blob),
        name: sub.attendancePdfName || `attendance_${MONTHS[sub.month - 1]}_${sub.year}.pdf`,
        subtitle: `${sub.lecturerName} · ${sub.monthName} ${sub.year}`
      });
    } catch {
      toast('Could not open attendance PDF', 'error');
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
      toast('Claim Excel downloaded');
    } catch {
      toast('Download failed', 'error');
    }
  };

  const quickStatusChange = async (sub, status) => {
    try {
      await api.patch(`/claims/submissions/${sub.id}/status`, { status });
      toast(`Claim marked as ${status}`);
      if (detail?.teacher?.id) openTeacherDetail(detail.teacher.id);
      loadTeachers(search, department);
    } catch (err) {
      toast(err.response?.data?.error || 'Could not update claim status', 'error');
    }
  };

  const totalPendingAcross = teachers.reduce((sum, t) => sum + t.pendingClaims, 0);
  const totalGrossAcross = teachers.reduce((sum, t) => sum + t.totalClaimedGross, 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">All Teachers</h1>
          <p className="text-gray-500 text-sm">Directory of all registered part-time lecturers, teaching activity, and submitted claims</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <span><strong className="text-gray-800">{teachers.length}</strong> teachers</span>
          <span className="text-gray-300">|</span>
          <span><strong className="text-amber-600">{totalPendingAcross}</strong> pending claims</span>
          <span className="text-gray-300">|</span>
          <span><strong className="text-primary">TZS {fmt(totalGrossAcross)}</strong> total claimed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 min-w-[220px]"
          placeholder="Search teacher by name, email, or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input w-56"
          value={department}
          onChange={e => setDepartment(e.target.value)}
        >
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(search || department !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDepartment('all'); }}
            className="btn-secondary text-xs"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Teachers Table */}
      {loading ? (
        <div className="card flex items-center justify-center py-20 text-gray-400">Loading teachers…</div>
      ) : teachers.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-3">👩‍🏫</div>
          <p className="text-gray-500">No teachers found</p>
          <p className="text-xs text-gray-400 mt-1">
            {search || department !== 'all'
              ? 'Try clearing your search or department filter'
              : 'Registered teachers will appear here automatically once they create an account'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['TEACHER', 'DEPARTMENT', 'MODULES / CLASSES', 'LOGGED ACTIVITY', 'SUBMITTED CLAIMS', 'TOTAL CLAIMED', 'ACTIONS'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 align-middle">
                  <td className="table-td">
                    <div className="font-semibold text-gray-800">{t.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{t.email}</div>
                    <div className="text-[11px] text-gray-400">Joined {new Date(t.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="table-td">
                    <div className="text-xs font-medium text-gray-700">{t.department}</div>
                    <div className="text-xs text-gray-400">AY {t.academicYear}</div>
                  </td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-600">
                    <div>{t.moduleCount} modules</div>
                    <div className="text-gray-400">{t.classCount} classes</div>
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <div className="font-medium text-gray-800">{t.sessionCount} sessions</div>
                    <div className="text-xs text-gray-400">{t.totalHours} hrs · {t.attendancePdfCount} PDFs</div>
                  </td>
                  <td className="table-td whitespace-nowrap">
                    {t.totalSubmissions === 0 ? (
                      <span className="text-xs text-gray-400">No claims yet</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {t.pendingClaims > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">
                            {t.pendingClaims} Pending
                          </span>
                        )}
                        {t.approvedClaims > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-800">
                            {t.approvedClaims} Approved
                          </span>
                        )}
                        {t.rejectedClaims > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800">
                            {t.rejectedClaims} Rejected
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <div className="font-bold text-primary">TZS {fmt(t.totalClaimedGross)}</div>
                    {t.approvedGross > 0 && (
                      <div className="text-xs text-green-600">TZS {fmt(t.approvedGross)} approved</div>
                    )}
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openTeacherDetail(t.id)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-blue-200 text-primary hover:bg-blue-50"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => navigate(`/admin/claims?teacherId=${t.id}`)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary-light"
                      >
                        Claims ({t.totalSubmissions})
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Teacher Detail Modal */}
      {detail && (
        <Modal
          title={detail.loading ? 'Loading teacher profile…' : `${detail.teacher.name} — Teacher Profile`}
          onClose={() => setDetail(null)}
          maxWidth="max-w-3xl"
        >
          {detailLoading || detail.loading ? (
            <div className="py-12 text-center text-gray-400">Loading details…</div>
          ) : (
            <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
              {/* Profile & Bank Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 text-sm">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase text-gray-400">Personal & Department</div>
                  <div><span className="font-semibold">Name:</span> {detail.teacher.name}</div>
                  <div><span className="font-semibold">Email:</span> <span className="font-mono text-xs">{detail.teacher.email}</span></div>
                  <div><span className="font-semibold">Department:</span> {detail.teacher.lecturer?.department || '—'}</div>
                  <div><span className="font-semibold">Academic Year:</span> {detail.teacher.lecturer?.academicYear || '—'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase text-gray-400">Bank & Rates</div>
                  <div><span className="font-semibold">Bank:</span> {detail.teacher.lecturer?.bank || '—'} ({detail.teacher.lecturer?.branch || '—'})</div>
                  <div><span className="font-semibold">Account:</span> {detail.teacher.lecturer?.accountNo || 'Not set'}</div>
                  <div>
                    <span className="font-semibold">Rates:</span>{' '}
                    Degree TZS {fmt(detail.teacher.lecturer?.degreeRate || 0)} · OD TZS {fmt(detail.teacher.lecturer?.odRate || 0)}
                  </div>
                  <div><span className="font-semibold">Transport:</span> TZS {fmt(detail.teacher.lecturer?.transportRate || 0)}</div>
                </div>
              </div>

              {/* Summary Strip */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-400">Logged Sessions</div>
                  <div className="text-lg font-bold text-gray-800">{detail.summary.sessionCount} ({detail.summary.totalHours}h)</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-400">Submitted Claims</div>
                  <div className="text-lg font-bold text-primary">{detail.summary.submissionCount}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-xs text-gray-400">Modules / Classes</div>
                  <div className="text-lg font-bold text-gray-800">{detail.modules.length} / {detail.classes.length}</div>
                </div>
              </div>

              {/* Submitted Claims */}
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-gray-700">Submitted Claims ({detail.submissions.length})</h3>
                {detail.submissions.length === 0 ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-center">
                    No claims submitted by this teacher yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          {['PERIOD', 'HRS', 'GROSS PAY', 'ATTENDANCE', 'STATUS', 'ACTIONS'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 border-b">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.submissions.map(sub => (
                          <tr key={sub.id} className="border-b last:border-b-0">
                            <td className="px-3 py-2 font-semibold">{sub.monthName} {sub.year}</td>
                            <td className="px-3 py-2">{sub.totalHours}h</td>
                            <td className="px-3 py-2 font-bold text-primary">TZS {fmt(sub.gross)}</td>
                            <td className="px-3 py-2">
                              {sub.attendancePdfName ? (
                                <button
                                  onClick={() => openAttendancePdf(sub)}
                                  className="text-primary underline hover:text-primary-light"
                                >
                                  📄 View PDF
                                </button>
                              ) : (
                                <span className="text-gray-400">None</span>
                              )}
                            </td>
                            <td className="px-3 py-2"><StatusBadge status={sub.status} /></td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <button
                                  onClick={() => downloadExcel(sub)}
                                  className="px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100"
                                >
                                  .xlsx
                                </button>
                                {sub.status !== 'Approved' && (
                                  <button
                                    onClick={() => quickStatusChange(sub, 'Approved')}
                                    className="px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700"
                                  >
                                    Approve
                                  </button>
                                )}
                                {sub.status !== 'Rejected' && (
                                  <button
                                    onClick={() => quickStatusChange(sub, 'Rejected')}
                                    className="px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600"
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
              </div>

              {/* Modules */}
              {detail.modules.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-gray-700">Assigned Modules ({detail.modules.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.modules.map(m => (
                      <span key={m.id} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-primary border border-blue-100">
                        <strong>{m.code}</strong> · {m.name} ({m.programme})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      <PdfPreviewModal pdf={pdfPreview} onClose={() => setPdfPreview(null)} />
    </div>
  );
}
