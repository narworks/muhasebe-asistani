import React from 'react';
import { Users } from 'lucide-react';
import type { Client } from '../../../types';

interface ClientManagementProps {
    clients: Client[];
    clientForm: {
        firm_name: string;
        tax_number: string;
        gib_user_code: string;
        gib_password: string;
    };
    clientErrors: Record<string, string>;
    savingClient: boolean;
    editingClientId: number | null;
    importing: boolean;
    importResult: {
        saved: number;
        errors: Array<{ row: number; firm_name: string; error: string }>;
        parseErrors: Array<{ row: number; error: string }>;
        limitError?: string;
    } | null;
    importFileRef: React.RefObject<HTMLInputElement>;
    clientTestStatus: Record<number, { status: string; errorType?: string; errorMessage?: string }>;
    clientLimit: {
        totalAdded: number;
        maxClients: number;
        remaining: number;
    } | null;
    onClose: () => void;
    onSaveClient: (e: React.FormEvent) => void;
    onEditClient: (client: Client) => void;
    onCancelEdit: () => void;
    onFieldChange: (field: string, value: string) => void;
    onExcelImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDownloadTemplate: () => void;
    onToggleStatus: (client: Client) => void;
    onDeleteClient: (client: Client) => void;
    onTestLogin: (client: Client) => void;
    onClearImportResult: () => void;
    onScanNow?: (client: Client) => void;
}

const ClientManagement: React.FC<ClientManagementProps> = ({
    clients,
    clientForm,
    clientErrors,
    savingClient,
    editingClientId,
    importing,
    importResult,
    importFileRef,
    clientTestStatus,
    clientLimit,
    onSaveClient,
    onEditClient,
    onCancelEdit,
    onFieldChange,
    onExcelImport,
    onDownloadTemplate,
    onToggleStatus,
    onDeleteClient,
    onTestLogin,
    onClearImportResult,
    onScanNow,
}) => {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-800">M&uuml;kellef Y&ouml;netimi</h2>
                    <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        {clients.length} m&uuml;kellef
                    </span>
                </div>
                {clientLimit && (
                    <div className="flex items-center gap-2">
                        <span
                            className={`text-sm font-medium ${clientLimit.remaining <= 10 ? 'text-red-500' : 'text-gray-500'}`}
                        >
                            {clientLimit.remaining} / {clientLimit.maxClients} hak kald&#305;
                        </span>
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${clientLimit.remaining <= 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                style={{
                                    width: `${Math.min((clientLimit.totalAdded / clientLimit.maxClients) * 100, 100)}%`,
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Tarama i&ccedil;in m&uuml;kellef bilgilerini kaydedin.
            </p>

            {clients.length === 0 && (
                <div className="text-center py-8 mb-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-600">
                        Hen&uuml;z m&uuml;kellef eklenmedi
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Ba&#351;lamak i&ccedil;in a&#351;a&#287;&#305;daki formu kullan&#305;n veya
                        Excel&apos;den i&ccedil;e aktar&#305;n
                    </p>
                </div>
            )}

            <form
                onSubmit={onSaveClient}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                noValidate
            >
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                        Firma Ad&#305;
                    </label>
                    <input
                        type="text"
                        value={clientForm.firm_name}
                        onChange={(e) => onFieldChange('firm_name', e.target.value)}
                        className={`w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white ${
                            clientErrors.firm_name ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="Örnek Ltd. Şti."
                    />
                    {clientErrors.firm_name && (
                        <p className="mt-1 text-xs text-red-500">{clientErrors.firm_name}</p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                        Vergi No
                    </label>
                    <input
                        type="text"
                        value={clientForm.tax_number}
                        onChange={(e) => onFieldChange('tax_number', e.target.value)}
                        className={`w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white ${
                            clientErrors.tax_number ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="Opsiyonel"
                    />
                    {clientErrors.tax_number && (
                        <p className="mt-1 text-xs text-red-500">{clientErrors.tax_number}</p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                        G&#304;B Kullan&#305;c&#305; Kodu
                    </label>
                    <input
                        type="text"
                        value={clientForm.gib_user_code}
                        onChange={(e) => onFieldChange('gib_user_code', e.target.value)}
                        className={`w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white ${
                            clientErrors.gib_user_code ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    {clientErrors.gib_user_code && (
                        <p className="mt-1 text-xs text-red-500">{clientErrors.gib_user_code}</p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                        G&#304;B &#350;ifre
                    </label>
                    <input
                        type="password"
                        value={clientForm.gib_password}
                        onChange={(e) => onFieldChange('gib_password', e.target.value)}
                        className={`w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white ${
                            clientErrors.gib_password ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder={editingClientId ? '(değiştirmek için yazın)' : ''}
                    />
                    {clientErrors.gib_password && (
                        <p className="mt-1 text-xs text-red-500">{clientErrors.gib_password}</p>
                    )}
                </div>
                <div className="md:col-span-2 flex items-center justify-between">
                    {clientErrors._form && (
                        <p className="text-sm text-red-500">{clientErrors._form}</p>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                        <input
                            ref={importFileRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={onExcelImport}
                        />
                        <button
                            type="button"
                            onClick={onDownloadTemplate}
                            className="border border-gray-300 text-gray-600 text-sm px-3 py-2 rounded-md hover:bg-gray-50"
                            title="Örnek Excel şablonunu indirin"
                        >
                            &#8681; Sablon
                        </button>
                        <button
                            type="button"
                            disabled={importing}
                            onClick={() => importFileRef.current?.click()}
                            className="border border-emerald-600 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-md hover:bg-emerald-50 disabled:opacity-50"
                        >
                            {importing ? 'İçe aktarılıyor...' : "Excel'den İçe Aktar"}
                        </button>
                        <button
                            type="submit"
                            disabled={savingClient}
                            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {savingClient
                                ? 'Kaydediliyor...'
                                : editingClientId
                                  ? 'Mükellef Güncelle'
                                  : 'Mükellef Kaydet'}
                        </button>
                        {editingClientId && (
                            <button
                                type="button"
                                onClick={onCancelEdit}
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                Vazgeç
                            </button>
                        )}
                    </div>
                </div>
            </form>

            {/* Excel Import Sonucu */}
            {importResult && (
                <div
                    className={`mt-4 p-4 rounded-lg text-sm ${
                        importResult.limitError
                            ? 'bg-red-50 border border-red-200'
                            : importResult.saved > 0
                              ? 'bg-green-50 border border-green-200'
                              : 'bg-yellow-50 border border-yellow-200'
                    }`}
                >
                    {importResult.limitError ? (
                        <p className="text-red-700">{importResult.limitError}</p>
                    ) : (
                        <>
                            <p className="font-semibold text-gray-800">
                                {importResult.saved} mükellef eklendi
                                {importResult.errors.length > 0 &&
                                    `, ${importResult.errors.length} hatalı`}
                                {importResult.parseErrors.length > 0 &&
                                    `, ${importResult.parseErrors.length} satır atlandı`}
                            </p>
                            {importResult.errors.length > 0 && (
                                <ul className="mt-2 text-red-600 list-disc list-inside">
                                    {importResult.errors.map((e, i) => (
                                        <li key={i}>
                                            Satır {e.row}: {e.firm_name} — {e.error}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                    <button
                        onClick={onClearImportResult}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                        Kapat
                    </button>
                </div>
            )}

            <div className="mt-6 overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm text-left text-gray-700">
                    <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-4 py-2">Firma</th>
                            <th className="px-4 py-2">Vergi No</th>
                            <th className="px-4 py-2">G&#304;B Kullan&#305;c&#305;</th>
                            <th className="px-4 py-2">Son Tarama</th>
                            <th className="px-4 py-2">Durum</th>
                            <th className="px-4 py-2">&#304;&#351;lem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.length === 0 ? (
                            <tr>
                                <td className="px-4 py-3 text-gray-500" colSpan={6}>
                                    Henüz mükellef eklenmedi.
                                </td>
                            </tr>
                        ) : (
                            clients.map((client) => (
                                <tr key={client.id} className="border-t border-gray-200">
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {client.firm_name}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {client.tax_number || '-'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {client.gib_user_code}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                                        {client.last_full_scan_at
                                            ? new Date(client.last_full_scan_at).toLocaleDateString(
                                                  'tr-TR',
                                                  {
                                                      day: '2-digit',
                                                      month: '2-digit',
                                                      year: 'numeric',
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                  }
                                              )
                                            : '-'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        {client.status || 'active'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap space-x-2">
                                        <button
                                            type="button"
                                            onClick={() => onEditClient(client)}
                                            className="text-xs px-2 py-1 rounded border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                                        >
                                            D&uuml;zenle
                                        </button>
                                        {(() => {
                                            const test = clientTestStatus[client.id];
                                            const running = test?.status === 'running';
                                            let label = 'Test';
                                            let cls =
                                                'border-sky-500/30 text-sky-400 hover:bg-sky-500/10';
                                            let title = '';
                                            if (running) {
                                                label = 'Test...';
                                            } else if (test?.status === 'ok') {
                                                label = '\u2713 OK';
                                                cls =
                                                    'border-emerald-500/40 text-emerald-500 bg-emerald-500/10';
                                            } else if (test?.status === 'fail') {
                                                const errMap: Record<string, string> = {
                                                    wrong_credentials: '\u2717 \u015eifre',
                                                    captcha_failed: '\u2717 CAPTCHA',
                                                    account_locked: '\u2717 Kilitli',
                                                    network_timeout: '\u2717 A\u011f',
                                                    no_password: '\u2717 \u015eifre yok',
                                                    ip_blocked: '\u2717 IP',
                                                    unknown: '\u2717 Hata',
                                                };
                                                label =
                                                    errMap[test.errorType || 'unknown'] ||
                                                    '\u2717 Hata';
                                                cls =
                                                    'border-red-500/40 text-red-500 bg-red-500/10';
                                                title = test.errorMessage || '';
                                            }
                                            return (
                                                <button
                                                    type="button"
                                                    disabled={running}
                                                    title={title}
                                                    onClick={() => onTestLogin(client)}
                                                    className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${cls}`}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })()}
                                        {onScanNow && client.status === 'active' && (
                                            <button
                                                type="button"
                                                onClick={() => onScanNow(client)}
                                                title="Bu mükellefi hemen tara"
                                                className="text-xs px-2 py-1 rounded border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                                            >
                                                ⚡ Tara
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onToggleStatus(client)}
                                            className="text-xs px-2 py-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                                        >
                                            {client.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDeleteClient(client)}
                                            className="text-xs px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            Sil
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClientManagement;
