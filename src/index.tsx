import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import * as Sentry from '@sentry/electron/renderer';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Sentry renderer init — DSN obtained via IPC from main process
Sentry.init({});

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <HashRouter>
            <AuthProvider>
                <App />
            </AuthProvider>
        </HashRouter>
    </React.StrictMode>
);
