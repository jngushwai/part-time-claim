import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../utils/api';
import { fmt, MONTHS } from '../../utils/format';
import { useToast } from '../../components/ui/Toast';
import PdfPreviewModal from '../../components/PdfPreviewModal';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function StatusBadge({ status }) {
  const s = status || 'Pending';
  const cls =
    s === 'Approved' ? 'bg-green-100 text-green-800' :
    s === 'Rejected' ? 'bg-red-100 text-red-800' :
    'bg-amber-100 text-amber-800';
  return (
    <span className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-semibold ${cls}`}>
      {s}
    </span>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card">
      <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${accent || 'text-gray-500'}`}>{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfPreview, setPdfPreview] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  const loadOverview = async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/overview');
      setData(r.data);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to load admin overview', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, []);

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

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400 text-lg">Loading admin overview…</div>
      </div>
    );
  }

  const { stats, monthlyChart, recentSubmissions } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Super Admin Overview</h1>
          <p className="text-gray-500 text-sm">Monitor registered teachers, submitted monthly claims, and approval progress</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/admin/teachers')} className="btn-secondary">
            👩‍🏫 View All Teachers
          </button>
          <button onClick={() => navigate('/admin/claims')} className="btn-primary">
            📑 Review Claims ({stats.pendingCount} Pending)
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Registered Teachers"
          value={stats.totalTeachers}
          sub={`${stats.totalSessions} sessions · ${stats.totalHours}h logged`}
          accent="text-primary"
        />
        <StatCard
          label="Pending Review"
          value={stats.pendingCount}
          sub={`TZS ${fmt(stats.pendingAmount)} awaiting approval`}
          accent="text-amber-600"
        />
        <StatCard
          label="Approved Claims"
          value={stats.approvedCount}
          sub={`TZS ${fmt(stats.approvedAmount)} approved`}
          accent="text-green-600"
        />
        <StatCard
          label="Total Submitted Value"
          value={`TZS ${fmt(stats.totalClaimedAmount)}`}
          sub={`${stats.totalSubmissions} total claims (${stats.rejectedCount} rejected)`}
          accent="text-slate-600"
        />
      </div>

      {/* Chart + Quick Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-700">Submitted Claims by Month (TZS)</h2>
            <span className="text-xs text-gray-400">Approved vs Pending</span>
          </div>
          {monthlyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={monthlyChart}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v / 1000) + 'k'} />
                <Tooltip formatter={v => `TZS ${fmt(v)}`} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="approved" fill="#16A34A" name="Approved" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" fill="#F59E0B" name="Pending" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-56 text-gray-300 text-sm">
              No submitted claims yet
            </div>
          )}
        </div>

        <div className="card flex flex-col justify-between space-y-4">
          <div>
            <h2 className="font-bold text-gray-700 mb-3">Quick Management</h2>
            <div className="space-y-2.5">
              <button
                onClick={() => navigate('/admin/teachers')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 bg-blue-50/70 hover:bg-blue-50 transition-colors text-left"
              >
                <div>
                  <div className="font-semibold text-sm text-primary">All Teachers Directory</div>
                  <div className="text-xs text-gray-500">Inspect profiles, rates, and claim history</div>
                </div>
                <span className="text-lg font-bold text-primary">{stats.totalTeachers} →</span>
              </button>

              <button
                onClick={() => navigate('/admin/claims?status=Pending')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-50 transition-colors text-left"
              >
                <div>
                  <div className="font-semibold text-sm text-amber-800">Pending Approvals</div>
                  <div className="text-xs text-amber-700/80">Verify attendance PDFs and approve claims</div>
                </div>
                <span className="text-lg font-bold text-amber-700">{stats.pendingCount} →</span>
              </button>

              <button
                onClick={() => navigate('/admin/claims')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div>
                  <div className="font-semibold text-sm text-gray-800">All Submitted Claims</div>
                  <div className="text-xs text-gray-500">Filter by teacher, status, or month</div>
                </div>
                <span className="text-lg font-bold text-gray-700">{stats.totalSubmissions} →</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Submitted Claims */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">Recent Submitted Claims</h2>
            <p className="text-xs text-gray-500">Latest monthly claims submitted by teachers across all departments</p>
          </div>
          <button onClick={() => navigate('/admin/claims')} className="text-xs font-semibold text-primary hover:underline">
            View All Claims →
          </button>
        </div>

        {recentSubmissions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">📑</div>
            <p className="text-sm">No teachers have submitted claims yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['TEACHER', 'PERIOD', 'HOURS', 'GROSS PAY', 'ATTENDANCE PDF', 'STATUS', 'ACTIONS'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map(sub => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="table-td">
                      <div className="font-semibold text-gray-800">{sub.lecturerName}</div>
                      <div className="text-xs text-gray-400">{sub.user?.email || sub.department}</div>
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <div className="font-medium">{sub.monthName}, {sub.year}</div>
                      <div className="text-xs text-gray-400">{new Date(sub.submittedAt).toLocaleDateString()}</div>
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <div>{sub.totalHours}h</div>
                      <div className="text-xs text-gray-400">{sub.sessionCount} sessions</div>
                    </td>
                    <td className="table-td font-bold text-primary whitespace-nowrap">
                      TZS {fmt(sub.gross)}
                    </td>
                    <td className="table-td">
                      {sub.attendancePdfName ? (
                        <button
                          onClick={() => openAttendancePdf(sub)}
                          className="px-2 py-1 text-xs font-medium rounded border border-blue-200 text-primary hover:bg-blue-50"
                        >
                          📄 View PDF
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Not attached</span>
                      )}
                    </td>
                    <td className="table-td">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => downloadExcel(sub)}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-gray-200 text-gray-700 hover:bg-gray-100"
                        >
                          ⬇ .xlsx
                        </button>
                        <button
                          onClick={() => navigate(`/admin/claims?teacherId=${sub.userId}`)}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-primary text-white hover:bg-primary-light"
                        >
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PdfPreviewModal pdf={pdfPreview} onClose={() => setPdfPreview(null)} />
    </div>
  );
}
