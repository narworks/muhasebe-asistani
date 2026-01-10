import React, { useState } from 'react';
import Input from './ui/Input';
import Button from './ui/Button';

interface ApiKeyModalProps {
  onClose: () => void;
  onSave: (apiKey: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSave }) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (apiKey.trim().length < 10) { // Basic validation
      setError('Lütfen geçerli bir API anahtarı girin.');
      return;
    }
    setError('');
    onSave(apiKey);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        <div className="p-6 md:p-8 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">Gemini API Anahtarı Kurulumu</h2>
          <p className="text-slate-400 mt-2">Bu aracı kullanmak için aşağıdaki adımları izleyerek kendi API anahtarınızı alabilirsiniz.</p>
        </div>
        
        <div className="p-6 md:p-8 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-sky-400 mb-2">Adım 1: Google AI Studio'ya Gidin</h3>
            <p className="text-slate-300 mb-3">API anahtarı oluşturmak için Google AI Studio sayfasını yeni bir sekmede açın.</p>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Google AI Studio'yu Aç
            </a>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-sky-400 mb-2">Adım 2: API Anahtarınızı Kopyalayın</h3>
            <p className="text-slate-300">
              Açılan sayfada "Create API key in new project" (Yeni projede API anahtarı oluştur) butonuna tıklayın. Oluşturulan anahtarı panonuza kopyalayın.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-sky-400 mb-2">Adım 3: Anahtarı Buraya Yapıştırın</h3>
            <p className="text-slate-300 mb-4">
              Kopyaladığınız API anahtarını aşağıdaki alana yapıştırın. Bu anahtar sadece sizin bilgisayarınızda güvenli şekilde saklanacaktır.
            </p>
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            <Input 
              id="api-key-input"
              label="Gemini API Anahtarınız"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API anahtarınızı buraya yapıştırın..."
            />
          </div>
        </div>

        <div className="p-6 bg-slate-900/50 flex justify-end items-center space-x-4 rounded-b-xl">
           <Button variant="secondary" onClick={onClose} className="w-auto">
             İptal
           </Button>
           <Button variant="primary" onClick={handleSave} className="w-auto">
             Kaydet ve Başla
           </Button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
