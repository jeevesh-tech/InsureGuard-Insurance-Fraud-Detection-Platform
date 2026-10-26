import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Policy from './pages/Policy';
import Claims from './pages/Claims';
import NewClaim from './pages/NewClaim';
import ClaimDetail from './pages/ClaimDetail';
import Architecture from './pages/Architecture';
import Analytics from './pages/Analytics';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="policy" element={<Policy />} />
        <Route path="claims" element={<Claims />} />
        <Route path="claims/new" element={<NewClaim />} />
        <Route path="claims/:id" element={<ClaimDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="architecture" element={<Architecture />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
