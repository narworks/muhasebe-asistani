import React, { useState, useRef, DragEvent, useEffect, ReactNode } from 'react';
import Card from '../../components/ui/Card';

// Make sheetjs library available globally from the script tag
declare const XLSX: any;

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

const ACCEPTED_FILE_TYPES = [
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'text/plain' // .txt
];

const StatementConverter: React.FC = () => {
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [previewContent, setPreviewContent] = useState<ReactNode | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [userPrompt, setUserPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversionResult, setConversionResult] = useState<string | null>(null);
    const [parsedResult, setParsedResult] = useState<string[][] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- File Preview Generation ---
    useEffect(() => {
        if (!uploadedFile) {
            setPreviewContent(null);
            return;
        }

        let objectUrl: string | null = null;

        const generatePreview = async () => {
            try {
                if (uploadedFile.type === 'application/pdf') {
                    objectUrl = URL.createObjectURL(uploadedFile);
                    setPreviewContent(<iframe src={objectUrl} className="w-full h-96 border-none" title="PDF Preview" />);
                } else if (uploadedFile.name.endsWith('.xlsx')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = e.target?.result;
                            const workbook = XLSX.read(data, { type: 'array' });
                            const sheetName = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[sheetName];
                            const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                            const previewData = json.slice(0, 15);

                            setPreviewContent(
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left text-slate-400">
                                        <thead className="text-xs text-slate-300 uppercase bg-slate-700/50">
                                            <tr>{previewData[0]?.map((cell, i) => <th key={i} className="px-4 py-2 font-semibold">{String(cell)}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {previewData.slice(1).map((row, i) => (
                                                <tr key={i} className="bg-slate-800 border-b border-slate-700/50">
                                                    {row.map((cell, j) => <td key={j} className="px-4 py-2 truncate max-w-xs">{String(cell)}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        } catch (e) {
                            setError('Excel dosyası okunurken bir hata oluştu.');
                            setPreviewContent(<div className="text-red-400">Bu Excel dosyası önizlenemiyor.</div>);
                        }
                    };
                    reader.onerror = () => {
                        setError('Excel dosyası okunurken bir hata oluştu.');
                    }
                    reader.readAsArrayBuffer(uploadedFile);
                } else if (uploadedFile.type === 'text/plain') {
                    const text = await uploadedFile.text();
                    setPreviewContent(<pre className="text-left text-sm text-slate-300 bg-slate-900 p-4 rounded-md overflow-auto h-96">{text}</pre>);
                }
            } catch (err) {
                 setError('Dosya önizlemesi oluşturulurken bir hata oluştu.');
            }
        };

        generatePreview();

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [uploadedFile]);

    // --- Result Parsing ---
    useEffect(() => {
        if (conversionResult) {
            try {
                // Simple CSV parser
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


    // --- File Handling ---
    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            const file = files[0];
            const fileType = file.type;
            const fileName = file.name.toLowerCase();

            const isAccepted = ACCEPTED_FILE_TYPES.includes(fileType) || 
                               fileName.endsWith('.xlsx') || 
                               fileName.endsWith('.txt') || 
                               fileName.endsWith('.pdf');

            if (isAccepted) {
                setUploadedFile(file);
                setConversionResult(null);
                setError(null);
            } else {
                setError('Desteklenmeyen dosya formatı. Lütfen PDF, XLSX veya TXT dosyası yükleyin.');
            }
        }
    };
    const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => handleFileChange(event.target.files);
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); handleFileChange(event.dataTransfer.files); };
    const handleBrowseClick = () => fileInputRef.current?.click();
    const handleRemoveFile = () => {
        setUploadedFile(null);
        setConversionResult(null);
    };

    // --- API Call & Conversion ---
    const handleConvert = async () => {
        if (!uploadedFile) {
            setError("Lütfen önce bir dosya yükleyin.");
            return;
        }
        if (userPrompt.trim().length === 0) {
            setError("Lütfen ne yapmak istediğinizi açıklayan bir komut girin.");
            return;
        }

        setIsLoading(true);
        setConversionResult(null);
        setError(null);
        
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('prompt', userPrompt);

        try {
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData,
            });

            const resultText = await response.text();

            if (!response.ok) {
                // Try to parse error from backend
                try {
                    const errorJson = JSON.parse(resultText);
                    throw new Error(errorJson.error || `HTTP error! status: ${response.status}`);
                } catch {
                     throw new Error(`HTTP error! status: ${response.status}`);
                }
            }
            
            setConversionResult(resultText);
        } catch (err: any) {
            setError(err.message || "Dönüştürme sırasında bir hata oluştu.");
        } finally {
            setIsLoading(false);
        }
    };

    // --- Download ---
    const handleDownload = () => {
        if (!parsedResult) return;
        
        const worksheet = XLSX.utils.aoa_to_sheet(parsedResult);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Donusturulen_Ekstre");

        const fileName = `donusturulen_ekstre_${Date.now()}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    return (
        <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Banka Ekstresi Dönüştürücü</h1>
            <p className="text-slate-400 text-lg mb-8">Dosyanızı yükleyin ve yapay zekaya ne yapması gerektiğini söyleyin.</p>

            <div className="space-y-8">
                {/* --- Step 1: File Upload --- */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">1. Kaynak Dosyayı Yükle</h2>
                    {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">{error}</div>}
                    <div 
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                        className={`border-2 border-dashed border-slate-600 rounded-lg p-10 text-center transition-colors duration-300 ${isDragging ? 'bg-slate-700 border-sky-500' : 'bg-slate-800/50'}`}
                    >
                        <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileInputChange} accept=".pdf,.xlsx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" />
                        {uploadedFile ? (
                            <div className="flex flex-col items-center justify-center">
                                <FileIcon />
                                <p className="mt-4 text-slate-300 font-semibold truncate max-w-full">{uploadedFile.name}</p>
                                <p className="text-xs text-slate-500 mt-1">{(uploadedFile.size / 1024).toFixed(2)} KB</p>
                                <button onClick={handleRemoveFile} className="mt-4 text-sm bg-red-500/20 text-red-400 font-semibold py-1 px-3 rounded-md hover:bg-red-500/40 transition-colors">Kaldır</button>
                            </div>
                        ) : (
                            <>
                                <UploadIcon />
                                <p className="mt-4 text-slate-400">Dosyanızı buraya sürükleyin veya <button onClick={handleBrowseClick} className="text-sky-400 font-semibold bg-transparent border-none p-0 cursor-pointer hover:underline">gözatın</button>.</p>
                                <p className="text-xs text-slate-500 mt-2">Desteklenen formatlar: PDF, XLSX, TXT</p>
                            </>
                        )}
                    </div>
                </Card>

                {/* --- File Preview --- */}
                {previewContent && (
                    <Card>
                        <h2 className="text-xl font-bold text-white mb-4">Dosya Önizlemesi</h2>
                        <div className="bg-slate-900/50 p-1 rounded-lg border border-slate-700 max-h-[450px] overflow-auto">
                            {previewContent}
                        </div>
                    </Card>
                )}

                {/* --- Step 2: Define AI Prompt --- */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">2. Yapılacak İşlemi Tanımla</h2>
                    <p className="text-slate-400 mb-4">Yapay zekanın dosyayla ne yapmasını istediğinizi basit cümlelerle açıklayın.</p>
                    <textarea 
                        placeholder='Örn: "Tarih, açıklama ve tutar sütunlarını al. Açıklamalardaki firma isimlerini temizle ve yeni bir Firma sütunu oluştur."' 
                        value={userPrompt} 
                        onChange={(e) => setUserPrompt(e.target.value)} 
                        className="w-full h-32 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm" 
                    />
                </Card>

                {/* --- Step 3: Convert --- */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">3. Dönüştür ve İndir</h2>
                    <button onClick={handleConvert} className="w-full md:w-auto flex items-center justify-center bg-sky-500 text-white font-bold py-3 px-8 rounded-lg hover:bg-sky-600 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed" disabled={!uploadedFile || isLoading}>
                        {isLoading ? (<><SpinnerIcon /> Dönüştürülüyor...</>) : ('Dönüştür')}
                    </button>
                </Card>

                {/* --- Result --- */}
                {parsedResult && (
                     <Card>
                        <h2 className="text-xl font-bold text-white mb-4">Dönüştürme Sonucu</h2>
                         <div className="bg-slate-900/50 p-1 rounded-lg border border-slate-700 max-h-[450px] overflow-auto">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left text-slate-400">
                                    <thead className="text-xs text-slate-300 uppercase bg-slate-700/50">
                                        <tr>
                                            {parsedResult[0]?.map((headerCell, i) => (
                                                <th key={i} className="px-4 py-2 font-semibold">{headerCell}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedResult.slice(1).map((row, i) => (
                                            <tr key={i} className="bg-slate-800 border-b border-slate-700/50">
                                                {row.map((cell, j) => (
                                                    <td key={j} className="px-4 py-2 truncate max-w-xs">{cell}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button onClick={handleDownload} className="bg-emerald-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-emerald-600 transition-colors">Sonucu İndir (.xlsx)</button>
                        </div>
                     </Card>
                )}
            </div>
        </div>
    );
};

export default StatementConverter;
