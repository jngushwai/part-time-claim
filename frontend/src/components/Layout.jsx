import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const teacherNav = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/timetable', label: 'Timetable', icon: '🗓️' },
  { to: '/modules', label: 'Modules', icon: '📚' },
  { to: '/classes', label: 'Classes', icon: '🏫' },
  { to: '/sessions', label: 'Sessions & PDF', icon: '📅' },
  { to: '/claims', label: 'Generate & Submit', icon: '📋' },
  { to: '/profile', label: 'My Profile & Rates', icon: '👤' },
];

const adminNav = [
  { to: '/admin', label: 'Admin Overview', icon: '🛡️' },
  { to: '/admin/teachers', label: 'All Teachers', icon: '👩‍🏫' },
  { to: '/admin/claims', label: 'Submitted Claims', icon: '📑' },
  { to: '/profile', label: 'Account Settings', icon: '⚙️' },
];

export default function Layout({ children }) {
  const { user, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const nav = isSuperAdmin ? adminNav : teacherNav;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside className={`w-64 flex flex-col shadow-xl flex-shrink-0 ${isSuperAdmin ? 'bg-slate-900' : 'bg-primary'}`}>
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="text-white font-bold text-lg leading-tight">Part-Time Consultation</div>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isSuperAdmin ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-white/15 text-blue-100'
            }`}>
              {isSuperAdmin ? 'Super Admin Portal' : 'Teacher Portal'}
            </span>
          </div>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/' || n.to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white font-semibold border-r-4 border-white'
                    : isSuperAdmin
                      ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                      : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-white/10">
          <div className={`text-xs mb-1 ${isSuperAdmin ? 'text-amber-300 font-semibold' : 'text-blue-200'}`}>
            {isSuperAdmin ? 'Super Administrator' : 'Teacher / Lecturer'}
          </div>
          <div className="text-white text-sm font-medium truncate">{user?.name}</div>
          <div className={`text-xs truncate ${isSuperAdmin ? 'text-slate-400' : 'text-blue-200/80'}`}>
            {user?.email}
          </div>
          <button onClick={handleLogout} className={`mt-3 text-xs transition-colors ${
            isSuperAdmin ? 'text-slate-300 hover:text-white' : 'text-blue-300 hover:text-white'
          }`}>
            Sign Out →
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
