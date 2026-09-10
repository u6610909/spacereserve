import { Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import { AppShell } from './components/layout/AppShell';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { MyReservationsPage } from './pages/MyReservationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RoomDetailPage } from './pages/RoomDetailPage';
import { RoomManagementPage } from './pages/RoomManagementPage';
import { RoomsBrowsePage } from './pages/RoomsBrowsePage';
import { SignInPage } from './pages/SignInPage';

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/rooms" replace />} />
          <Route path="/rooms" element={<RoomsBrowsePage />} />
          <Route path="/rooms/:id" element={<RoomDetailPage />} />
          <Route path="/reservations" element={<MyReservationsPage />} />

          <Route element={<RequireRole allowed={['STAFF', 'ADMIN']} />}>
            <Route path="/manage/rooms" element={<RoomManagementPage />} />
          </Route>

          <Route element={<RequireRole allowed={['ADMIN']} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
