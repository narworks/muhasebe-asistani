import { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
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
import UpdateBanner from './components/UpdateBanner';
import TrialCountdownModal from './components/upgrade/TrialCountdownModal';
import WinbackModal from './components/upgrade/WinbackModal';
import { Toaster } from 'sonner';

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    // Listen for navigate-to events from main process (notification click, etc.)
    useEffect(() => {
        if (!window.electronAPI?.onNavigateTo) return;
        const unsubscribe = window.electronAPI.onNavigateTo((path) => {
            if (path && typeof path === 'string') navigate(path);
        });
        return unsubscribe;
    }, [navigate]);

    // v1.9.14: UpdateBanner MainLayout'tan çıkarıldı, App root'a taşındı.
    // Neden: MainLayout sadece login sonrası mount olur. autoUpdater ilk check'i
    // 5 sn sonra tetiklerken kullanıcı hâlâ Login/Register'da olabilir; MainLayout'ta
    // olmayan UpdateBanner event'i kaçırıyordu → 5 v1.9.11 kullanıcısı update alamadı.
    // Standalone daemon-popup penceresinde göstermeyi engelle (küçük popup, layout bozar).
    const isDaemonPopup = location.pathname === '/daemon-popup';

    return (
        <ErrorBoundary>
            <Toaster position="top-right" richColors closeButton duration={4000} />
            {!isDaemonPopup && (
                <>
                    <UpdateBanner />
                    <TrialCountdownModal />
                    <WinbackModal />
                </>
            )}
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
