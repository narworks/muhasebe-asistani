import { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import DashboardHome from './pages/dashboard/DashboardHome';
import Account from './pages/dashboard/Account';
import Statistics from './pages/dashboard/Statistics';
import Subscription from './pages/dashboard/Subscription';
import StatementConverter from './pages/tools/StatementConverter';
import ETebligat from './pages/tools/ETebligat';
import DaemonPopup from './pages/DaemonPopup';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from 'sonner';

function App() {
    const navigate = useNavigate();

    // Listen for navigate-to events from main process (notification click, etc.)
    useEffect(() => {
        if (!window.electronAPI?.onNavigateTo) return;
        const unsubscribe = window.electronAPI.onNavigateTo((path) => {
            if (path && typeof path === 'string') navigate(path);
        });
        return unsubscribe;
    }, [navigate]);

    return (
        <ErrorBoundary>
            <Toaster position="top-right" richColors closeButton duration={4000} />
            <Routes>
                {/* Daemon Popup (no auth, no layout, standalone) */}
                <Route path="/daemon-popup" element={<DaemonPopup />} />

                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                    <Route element={<MainLayout />}>
                        <Route path="/" element={<DashboardHome />} />
                        <Route path="/account" element={<Account />} />
                        <Route path="/statistics" element={<Statistics />} />
                        <Route path="/subscription" element={<Subscription />} />
                        <Route path="/tools/statement-converter" element={<StatementConverter />} />
                        <Route path="/tools/e-tebligat" element={<ETebligat />} />
                    </Route>
                </Route>
            </Routes>
        </ErrorBoundary>
    );
}

export default App;
