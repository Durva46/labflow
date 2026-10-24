import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PeriodProvider } from './context/PeriodContext';
import { ToastProvider } from './components/ui/Toast';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportsPage } from './pages/ImportsPage';
import { MediaPage } from './pages/MediaPage';
import { AutoclavePage } from './pages/AutoclavePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <AuthProvider>
      <PeriodProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                  <Route path="/imports" element={<ImportsPage />} />
                </Route>
                <Route path="/media" element={<MediaPage />} />
                <Route path="/autoclave" element={<AutoclavePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                </Route>
                <Route path="/stages/3" element={<ComingSoonPage stage={3} />} />
                <Route path="/stages/4" element={<ComingSoonPage stage={4} />} />
                <Route path="/stages/5" element={<ComingSoonPage stage={5} />} />
                <Route path="/stages/6" element={<ComingSoonPage stage={6} />} />
                <Route path="/stages/7" element={<ComingSoonPage stage={7} />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </PeriodProvider>
    </AuthProvider>
  );
}
