// Supabase Edge Function: iyzico-webhook
// Iyzico'dan gelen webhook event'lerini işler (ödeme başarısı, iptal, hatalar)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const IYZICO_SECRET_KEY = Deno.env.get('IYZICO_SECRET_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IyzicoWebhookPayload {
  iyziEventType: string // 'SUBSCRIPTION_ORDER_SUCCESS', 'SUBSCRIPTION_ORDER_FAIL', 'SUBSCRIPTION_CANCELLED'
  status: string
  paymentId?: string
  subscriptionReferenceCode: string
  subscriptionStatus?: string
  pricingPlanReferenceCode?: string
  customerReferenceCode?: string
  createdDate?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Webhook payload'ı parse et
    const payload: IyzicoWebhookPayload = await req.json()

    console.log('Iyzico webhook received:', payload)

    // Webhook doğrulama (opsiyonel - Iyzico signature kontrolü)
    // const signature = req.headers.get('x-iyzico-signature')
    // if (!verifyWebhookSignature(signature, payload)) {
    //   throw new Error('Invalid webhook signature')
    // }

    // Supabase Admin client (service role kullanarak RLS bypass)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Event tipine göre işlem yap
    switch (payload.iyziEventType) {
      case 'SUBSCRIPTION_ORDER_SUCCESS': {
        // Ödeme başarılı - subscription'ı güncelle
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'active',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 gün sonra
            updated_at: new Date().toISOString(),
          })
          .eq('iyzico_subscription_reference_code', payload.subscriptionReferenceCode)

        if (error) {
          console.error('Failed to update subscription after payment success:', error)
          throw error
        }

        console.log(`Subscription ${payload.subscriptionReferenceCode} renewed successfully`)
        break
      }

      case 'SUBSCRIPTION_ORDER_FAIL': {
        // Ödeme başarısız - subscription'ı pasif yap (grace period)
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'inactive',
            updated_at: new Date().toISOString(),
          })
          .eq('iyzico_subscription_reference_code', payload.subscriptionReferenceCode)

        if (error) {
          console.error('Failed to update subscription after payment fail:', error)
          throw error
        }

        console.log(`Subscription ${payload.subscriptionReferenceCode} payment failed`)
        break
      }

      case 'SUBSCRIPTION_CANCELLED': {
        // Abonelik iptal edildi
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('iyzico_subscription_reference_code', payload.subscriptionReferenceCode)

        if (error) {
          console.error('Failed to update subscription after cancellation:', error)
          throw error
        }

        console.log(`Subscription ${payload.subscriptionReferenceCode} cancelled`)
        break
      }

      case 'SUBSCRIPTION_EXPIRED': {
        // Abonelik süresi doldu
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('iyzico_subscription_reference_code', payload.subscriptionReferenceCode)

        if (error) {
          console.error('Failed to update subscription after expiration:', error)
          throw error
        }

        console.log(`Subscription ${payload.subscriptionReferenceCode} expired`)
        break
      }

      default:
        console.warn(`Unknown webhook event type: ${payload.iyziEventType}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error processing Iyzico webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
