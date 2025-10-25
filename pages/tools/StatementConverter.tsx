import React, { useState, useRef, DragEvent, useEffect, ReactNode } from 'react';
import Card from '../../components/ui/Card';

// Make sheetjs library available globally from the script tag
declare const XLSX: any;
declare const window: any; // For window.aistudio

// --- ICONS ---
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);
const FileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-sky-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
const SpinnerIcon = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);
const KeyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H5v-2H3v-2H1v-4a6 6 0 016-6h4a6 6 0 016 6z" />
    </svg>
);
const TrashIcon = () => (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
// FIX: Add DownloadIcon for the download button.
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);


const ACCEPTED_FILE_TYPES = [ 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain' ];
const PREDEFINED_TEMPLATES = [
    { title: "Basit Tarih, Açıklama, Tutar", prompt: "Dosyadaki tarih, işlem açıklaması ve tutar sütunlarını bularak CSV formatına dönüştür." },
    { title: "Borç/Alacak Ayrı Sütun", prompt: "Tarih, Açıklama, Borç ve Alacak sütunları oluştur. Gelen para alacak, giden para borç sütununa yazılsın." },
    { title: "KDV Ayıklama (%20)", prompt: "Tarih, Açıklama, Tutar, KDV (%20) ve KDV Hariç Tutar sütunları oluştur. Tutar içindeki %20 KDV'yi hesaplayıp ayır." },
];
const USER_TEMPLATES_KEY = 'userStatementTemplates';
const STATS_KEY = 'toolUsageStats';

interface UserTemplate { id: number; title: string; prompt: string; }

const StatementConverter: React.FC = () => {
    // --- State ---
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [previewContent, setPreviewContent] = useState<ReactNode | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [userPrompt, setUserPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversionResult, setConversionResult] = useState<string | null>(null);
    const [parsedResult, setParsedResult] = useState<string[][] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Effects ---
    useEffect(() => {
        // Check for API Key on component mount
        const checkApiKey = async () => {
            if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
                const keyStatus = await window.aistudio.hasSelectedApiKey();
                setHasApiKey(keyStatus);
            }
        };
        checkApiKey();

        // Load user templates from localStorage
        const savedTemplates = localStorage.getItem(USER_TEMPLATES_KEY);
        if (savedTemplates) {
            setUserTemplates(JSON.parse(savedTemplates));
        }
    }, []);

    useEffect(() => {
        // FIX: Implement file preview generation logic.
        if (!uploadedFile) { 
            setPreviewContent(null); 
            return; 
        }
        
        const reader = new FileReader();

        const generatePreview = (file: File) => {
            if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                reader.onload = (e) => {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    const previewTable = (
                        <div className="overflow-x-auto max-h-60 bg-slate-900/50 rounded-lg">
                            <table className="w-full text-xs text-left text-slate-400">
                                <tbody>
                                    {json.slice(0, 10).map((row, rIndex) => (
                                        <tr key={rIndex} className="border-b border-slate-700">
                                            {row.map((cell, cIndex) => (
                                                <td key={cIndex} className="px-4 py-2 whitespace-nowrap">{String(cell)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                    setPreviewContent(previewTable);
                };
                reader.readAsArrayBuffer(file);
            } else if (file.type === 'application/pdf' || file.type === 'text/plain') {
                reader.onload = (e) => {
                    const textContent = e.target?.result as string;
                    const previewText = (
                        <pre className="text-left text-xs bg-slate-900/50 p-4 rounded-lg overflow-auto max-h-60 text-slate-400 whitespace-pre-wrap">
                            {textContent.substring(0, 2000)}
                            {textContent.length > 2000 ? "\n..." : ""}
                        </pre>
                    );
                    setPreviewContent(previewText);
                };
                reader.readAsText(file);
            } else {
                 setPreviewContent(
                    <p className="text-slate-400">Bu dosya türü için önizleme desteklenmiyor.</p>
                 )
            }
        };

        generatePreview(uploadedFile);
    }, [uploadedFile]);

     useEffect(() => {
        if (conversionResult) {
            try {
                const rows = conversionResult.trim().split('\n');
                const data = rows.map(row => row.split(','));
                setParsedResult(data);
            } catch {
                setError("Sonuç verisi ayrıştırılamadı.");
                setParsedResult(null);
            }
        } else {
            setParsedResult(null);
        }
    }, [conversionResult]);

    // --- Handlers ---
    const handleApiKeySelect = async () => {
        if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
            await window.aistudio.openSelectKey();
            // Assume success and update state to unblock UI immediately
            setHasApiKey(true);
        }
    };

    // FIX: Implement file change handler to validate and set the uploaded file.
    const handleFileChange = (files: FileList | null) => {
        if (!files || files.length === 0) {
            return;
        }
        const file = files[0];
        
        if (!ACCEPTED_FILE_TYPES.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.xlsx')) {
             setError(`Desteklenmeyen dosya türü. Lütfen PDF, Excel (.xlsx) veya metin (.txt) dosyası yükleyin.`);
             return;
        }

        setError(null);
        setConversionResult(null);
        setParsedResult(null);
        setUploadedFile(file);
    };
    const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => handleFileChange(event.target.files);
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); handleFileChange(event.dataTransfer.files); };
    const handleBrowseClick = () => fileInputRef.current?.click();
    const handleRemoveFile = () => { setUploadedFile(null); setConversionResult(null); setParsedResult(null); setError(null); };

    const handleConvert = async () => {
        if (!hasApiKey) { setError("Lütfen devam etmek için Gemini API anahtarınızı seçin."); return; }
        if (!uploadedFile) { setError("Lütfen önce bir dosya yükleyin."); return; }
        if (userPrompt.trim().length === 0) { setError("Lütfen ne yapmak istediğinizi açıklayan bir komut girin."); return; }

        setIsLoading(true);
        setConversionResult(null);
        setParsedResult(null);
        setError(null);
        
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('prompt', userPrompt);

        try {
            const response = await fetch('/api/convert', { method: 'POST', body: formData });
            const resultText = await response.text();

            if (!response.ok) {
                 if (response.status === 404 && resultText.includes("Requested entity was not found")) {
                    setHasApiKey(false); // Reset API key status on this specific error
                    throw new Error("API Anahtarı geçersiz veya bulunamadı. Lütfen tekrar seçin.");
                }
                try {
                    const errorJson = JSON.parse(resultText);
                    throw new Error(errorJson.error || `HTTP error! status: ${response.status}`);
                } catch { throw new Error(`HTTP error! status: ${response.status}`); }
            }
            
            setConversionResult(resultText);
            // Increment stats on success
            const stats = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
            stats.statementConverter = (stats.statementConverter || 0) + 1;
            localStorage.setItem(STATS_KEY, JSON.stringify(stats));

        } catch (err: any) {
            setError(err.message || "Dönüştürme sırasında bir hata oluştu.");
        } finally {
            setIsLoading(false);
        }
    };
    
    // FIX: Implement download handler to save the result as a CSV file.
    const handleDownload = () => {
        if (!conversionResult) return;
        const blob = new Blob([conversionResult], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) { 
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            const originalFileName = uploadedFile?.name.split('.').slice(0, -1).join('.') || 'donusum';
            link.setAttribute("download", `${originalFileName}_donusturuldu.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleSaveTemplate = () => {
        const title = prompt("Bu şablon için kısa bir başlık girin:", "Yeni Şablonum");
        if (title && userPrompt.trim()) {
            const newTemplate: UserTemplate = { id: Date.now(), title, prompt: userPrompt.trim() };
            const updatedTemplates = [...userTemplates, newTemplate];
            setUserTemplates(updatedTemplates);
            localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(updatedTemplates));
        }
    };
    
    const handleDeleteTemplate = (id: number) => {
        const updatedTemplates = userTemplates.filter(t => t.id !== id);
        setUserTemplates(updatedTemplates);
        localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(updatedTemplates));
    };

    // --- Render ---
    return (
        <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Banka Ekstresi Dönüştürücü</h1>
            <p className="text-slate-400 text-lg mb-8">Dosyanızı yükleyin ve yapay zekaya ne yapması gerektiğini söyleyin.</p>

            <div className="space-y-8">
                
                {!hasApiKey && (
                     <Card className="border-l-4 border-amber-500">
                        <h2 className="text-xl font-bold text-amber-400 mb-2">API Anahtarı Gerekli</h2>
                        <p className="text-slate-300 mb-4">
                            Bu aracı kullanmak için Gemini API anahtarınızı seçmeniz gerekmektedir. Seçim işlemi güvenli bir pencerede gerçekleşir ve anahtarınız bizimle paylaşılmaz.
                            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline ml-2">Faturalandırma hakkında daha fazla bilgi alın.</a>
                        </p>
                        <button onClick={handleApiKeySelect} className="flex items-center justify-center bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-600 transition-colors">
                            <KeyIcon /> Gemini API Anahtarını Seç
                        </button>
                    </Card>
                )}

                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">1. Kaynak Dosyayı Yükle</h2>
                    {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">{error}</div>}
                    <div 
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                        className={`border-2 border-dashed border-slate-600 rounded-lg p-10 text-center transition-colors duration-300 ${isDragging ? 'bg-slate-700 border-sky-500' : 'bg-slate-800/50'}`}
                    >
                         {/* FIX: Implement the file upload UI. */}
                         {uploadedFile ? (
                            <div className="text-center">
                                <FileIcon />
                                <p className="mt-2 font-semibold text-white">{uploadedFile.name}</p>
                                <p className="text-xs text-slate-400">
                                    {(uploadedFile.size / 1024).toFixed(2)} KB
                                </p>
                                <button onClick={handleRemoveFile} className="mt-4 text-sm text-red-400 hover:text-red-300 font-semibold">
                                    Dosyayı Kaldır
                                </button>
                            </div>
                        ) : (
                            <div>
                                <UploadIcon />
                                <p className="mt-2 font-semibold text-slate-300">
                                    Dosyanızı buraya sürükleyin veya <button type="button" onClick={handleBrowseClick} className="font-semibold text-sky-400 hover:text-sky-300">gözatın</button>
                                </p>
                                <p className="text-xs text-slate-500 mt-1">Desteklenen formatlar: PDF, XLSX, TXT</p>
                                <input type="file" ref={fileInputRef} onChange={handleFileInputChange} className="hidden" accept={ACCEPTED_FILE_TYPES.join(',')} />
                            </div>
                        )}
                    </div>
                </Card>

                {previewContent && (
                    <Card>
                        <h2 className="text-xl font-bold text-white mb-4">Dosya Önizlemesi</h2>
                        {/* FIX: Display the generated preview content. */}
                        {previewContent}
                    </Card>
                )}

                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">2. Yapılacak İşlemi Tanımla</h2>
                    <p className="text-slate-400 mb-4">Yapay zekanın dosyayla ne yapmasını istediğinizi basit cümlelerle açıklayın veya bir şablon seçin.</p>
                    
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-slate-300 mb-2">Hazır Şablonlar</h3>
                        <div className="flex flex-wrap gap-2">
                            {PREDEFINED_TEMPLATES.map(template => (
                                <button key={template.title} onClick={() => setUserPrompt(template.prompt)} className="bg-slate-700 hover:bg-sky-500 text-xs text-slate-200 font-semibold py-1 px-3 rounded-full transition-colors">
                                    {template.title}
                                </button>
                            ))}
                        </div>
                    </div>
                     {userTemplates.length > 0 && (
                        <div className="mb-4 pt-3 border-t border-slate-700">
                             <h3 className="text-sm font-semibold text-slate-300 mb-2">Kaydettiğim Şablonlar</h3>
                             <div className="flex flex-wrap gap-2">
                                {userTemplates.map(template => (
                                    <div key={template.id} className="flex items-center bg-slate-700 rounded-full">
                                        <button onClick={() => setUserPrompt(template.prompt)} className="hover:bg-sky-500 text-xs text-slate-200 font-semibold py-1 px-3 rounded-l-full transition-colors">
                                            {template.title}
                                        </button>
                                        <button onClick={() => handleDeleteTemplate(template.id)} className="px-2 text-slate-400 hover:text-red-400 hover:bg-slate-600 rounded-r-full transition-colors">
                                            <TrashIcon/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <textarea 
                        placeholder='Örn: "Tarih, açıklama ve tutar sütunlarını al..."' 
                        value={userPrompt} 
                        onChange={(e) => setUserPrompt(e.target.value)} 
                        className="w-full h-32 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm" 
                    />
                    <div className="mt-2 flex justify-end">
                         <button onClick={handleSaveTemplate} disabled={!userPrompt.trim()} className="text-xs bg-emerald-500/20 text-emerald-300 font-semibold py-1 px-3 rounded-md hover:bg-emerald-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            Şablon Olarak Kaydet
                        </button>
                    </div>
                </Card>

                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">3. Dönüştür ve İndir</h2>
                    <button onClick={handleConvert} className="w-full md:w-auto flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-8 rounded-lg hover:bg-sky-600 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed" disabled={!uploadedFile || isLoading || !hasApiKey}>
                        {isLoading ? (<><SpinnerIcon /> Dönüştürülüyor...</>) : ('Dönüştür')}
                    </button>
                </Card>

                {/* FIX: Implement result display to fix missing children prop error. */}
                {parsedResult && parsedResult.length > 0 && (
                     <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Dönüşüm Sonucu</h2>
                            <button onClick={handleDownload} className="flex items-center bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-600 transition-colors text-sm">
                                <DownloadIcon />
                                CSV Olarak İndir
                            </button>
                        </div>
                        <div className="overflow-x-auto bg-slate-900/50 rounded-lg max-h-96">
                            <table className="min-w-full text-sm text-left text-slate-300">
                                <thead className="bg-slate-700 text-xs text-slate-300 uppercase sticky top-0">
                                    <tr>
                                        {parsedResult[0].map((header, index) => (
                                            <th key={index} scope="col" className="px-6 py-3 whitespace-nowrap">
                                                {header.trim()}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedResult.slice(1).map((row, rowIndex) => (
                                        <tr key={rowIndex} className="bg-slate-800 border-b border-slate-700 hover:bg-slate-700/50">
                                            {row.map((cell, cellIndex) => (
                                                <td key={cellIndex} className="px-6 py-4 whitespace-nowrap">
                                                    {cell.trim()}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                     </Card>
                )}
            </div>
        </div>
    );
};

export default StatementConverter;
