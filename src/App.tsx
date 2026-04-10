import { Routes, Route } from 'react-router-dom';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import DashboardHome from './pages/dashboard/DashboardHome';
import Account from './pages/dashboard/Account';
import Statistics from './pages/dashboard/Statistics';
import Subscription from './pages/dashboard/Subscription';
import StatementConverter from './pages/tools/StatementConverter';
import ETebligat from './pages/tools/ETebligat';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from 'sonner';

function App() {
    return (
        <ErrorBoundary>
            <Toaster position="top-right" richColors closeButton duration={4000} />
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
