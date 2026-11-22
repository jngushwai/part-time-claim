import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Claims from './pages/Claims';
import Modules from './pages/Modules';
import Classes from './pages/Classes';
import Profile from './pages/Profile';
import Timetable from './pages/Timetable';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTeachers from './pages/admin/AdminTeachers';
import AdminClaims from './pages/admin/AdminClaims';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function TeacherGuard({ children }) {
  const { user, isSuperAdmin, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isSuperAdmin) return <Navigate to="/admin" replace />;
  return <Layout>{children}</Layout>;
}

function AdminGuard({ children }) {
  const { user, isSuperAdmin, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, isSuperAdmin } = useAuth();
  const homePath = isSuperAdmin ? '/admin' : '/';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homePath} replace /> : <Login />} />

      {/* Super Admin Portal Routes */}
      <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
      <Route path="/admin/teachers" element={<AdminGuard><AdminTeachers /></AdminGuard>} />
      <Route path="/admin/claims" element={<AdminGuard><AdminClaims /></AdminGuard>} />

      {/* Teacher / Normal User Routes */}
      <Route path="/" element={<TeacherGuard><Dashboard /></TeacherGuard>} />
      <Route path="/sessions" element={<TeacherGuard><Sessions /></TeacherGuard>} />
      <Route path="/timetable" element={<TeacherGuard><Timetable /></TeacherGuard>} />
      <Route path="/claims" element={<TeacherGuard><Claims /></TeacherGuard>} />
      <Route path="/modules" element={<TeacherGuard><Modules /></TeacherGuard>} />
      <Route path="/classes" element={<TeacherGuard><Classes /></TeacherGuard>} />

      {/* Shared Account Settings / Profile */}
      <Route path="/profile" element={<Guard><Profile /></Guard>} />

      <Route path="*" element={<Navigate to={user ? homePath : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
