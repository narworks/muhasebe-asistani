import React from 'react';
import type { Tebligat } from '../../../../types';

interface Props {
    tebligat: Tebligat;
    onClose: () => void;
    fetchingDocumentId: number | null;
    onFetchDocument: (id: number) => void;
    onOpenDocument: (path: string) => void;
    onShareDocument: (path: string) => void;
}

const TebligatDetailModal: React.FC<Props> = ({
    tebligat,
    onClose,
    fetchingDocumentId,
    onFetchDocument,
    onOpenDocument,
    onShareDocument,
}) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Tebligat Detayı</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        X
                    </button>
                </div>
                <div className="space-y-3 text-sm text-gray-700">
                    <div>
                        <p className="text-xs text-gray-500">Mükellef</p>
                        <p className="font-semibold">{tebligat.firm_name || '-'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Belge No</p>
                        <p>{tebligat.document_no || tebligat.tebligat_date || '-'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Gönderen</p>
                        <p>{tebligat.sender || '-'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Konu</p>
                        <p>{tebligat.subject || '-'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-gray-500">Alt Birim</p>
                            <p>{tebligat.sub_unit || '-'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Belge Türü</p>
                            <p>{tebligat.document_type || '-'}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-gray-500">Gönderme Tarihi</p>
                            <p>{tebligat.send_date || '-'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Tebliğ Tarihi</p>
                            <p>{tebligat.notification_date || tebligat.tebligat_date || '-'}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-gray-500">Okuma Tarihi</p>
                            <p>{tebligat.read_date || '-'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Durum</p>
                            <p>{tebligat.status || '-'}</p>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Tarama Tarihi</p>
                        <p className="text-xs text-gray-400">{tebligat.created_at || '-'}</p>
                    </div>
                    {/* Döküman İşlemleri */}
                    <div className="pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">Döküman</p>
                        {tebligat.document_path ? (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => onOpenDocument(tebligat.document_path!)}
                                    className="flex items-center gap-2 px-3 py-2 bg-sky-50 text-sky-700 rounded-lg hover:bg-sky-100 transition-colors"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                        />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                        />
                                    </svg>
                                    Dökümanı Aç
                                </button>
                                <button
                                    onClick={() => onShareDocument(tebligat.document_path!)}
                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                        />
                                    </svg>
                                    Klasörde Göster
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => onFetchDocument(tebligat.id)}
                                disabled={fetchingDocumentId === tebligat.id}
                                className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {fetchingDocumentId === tebligat.id ? (
                                    <>
                                        <svg
                                            className="animate-spin h-4 w-4"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                            />
                                        </svg>
                                        GIB&apos;den getiriliyor...
                                    </>
                                ) : (
                                    <>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-4 w-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                            />
                                        </svg>
                                        Dökümanı Getir
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TebligatDetailModal;
