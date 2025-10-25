
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import DashboardHome from './pages/dashboard/DashboardHome';
import Account from './pages/dashboard/Account';
import Statistics from './pages/dashboard/Statistics';
import StatementConverter from './pages/tools/StatementConverter';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<DashboardHome />} />
          <Route path="/account" element={<Account />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/tools/statement-converter" element={<StatementConverter />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;