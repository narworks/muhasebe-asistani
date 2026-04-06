-- Mükellef ekleme limiti için subscriptions tablosuna yeni alanlar
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS max_clients INTEGER DEFAULT 200;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS total_clients_added INTEGER DEFAULT 0;

-- Son sıfırlama tarihi (yıllık reset takibi)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS clients_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Atomik sayaç artırma fonksiyonu (race condition önleme)
CREATE OR REPLACE FUNCTION public.increment_client_count(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.subscriptions
    SET total_clients_added = COALESCE(total_clients_added, 0) + 1
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ödeme/yenileme sonrası sayacı sıfırla (payment callback'ten çağrılır)
CREATE OR REPLACE FUNCTION public.reset_client_count(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.subscriptions
    SET total_clients_added = 0,
        clients_reset_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
