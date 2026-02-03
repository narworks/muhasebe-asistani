// Supabase Edge Function: create-subscription
// Iyzico ile tekrarlayan ödeme (subscription) başlatır

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const IYZICO_API_KEY = Deno.env.get('IYZICO_API_KEY')!
const IYZICO_SECRET_KEY = Deno.env.get('IYZICO_SECRET_KEY')!
const IYZICO_BASE_URL = Deno.env.get('IYZICO_BASE_URL') || 'https://api.iyzipay.com' // Production: https://api.iyzipay.com, Sandbox: https://sandbox-api.iyzipay.com

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SubscriptionRequest {
  pricing_plan_reference_code: string // Iyzico'da tanımlı plan kodu
  customer_email: string
  customer_name: string
  customer_surname: string
  customer_identity_number: string
  customer_phone: string
  customer_address: string
  customer_city: string
  customer_country: string
  customer_zip_code: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth kontrolü
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Supabase client oluştur
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Kullanıcıyı doğrula
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Request body'yi parse et
    const body: SubscriptionRequest = await req.json()

    // Iyzico subscription başlatma isteği hazırla
    const iyzipayRequest = {
      locale: 'tr',
      conversationId: user.id,
      pricingPlanReferenceCode: body.pricing_plan_reference_code,
      subscriptionInitialStatus: 'ACTIVE', // Hemen aktif olsun
      customer: {
        email: body.customer_email,
        name: body.customer_name,
        surname: body.customer_surname,
        identityNumber: body.customer_identity_number,
        gsmNumber: body.customer_phone,
        billingAddress: {
          contactName: `${body.customer_name} ${body.customer_surname}`,
          city: body.customer_city,
          country: body.customer_country,
          address: body.customer_address,
          zipCode: body.customer_zip_code,
        },
        shippingAddress: {
          contactName: `${body.customer_name} ${body.customer_surname}`,
          city: body.customer_city,
          country: body.customer_country,
          address: body.customer_address,
          zipCode: body.customer_zip_code,
        },
      },
    }

    // Iyzico API çağrısı
    const iyzipayResponse = await fetch(`${IYZICO_BASE_URL}/v2/subscription/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `IYZWS ${IYZICO_API_KEY}:${IYZICO_SECRET_KEY}`,
      },
      body: JSON.stringify(iyzipayRequest),
    })

    const iyzipayData = await iyzipayResponse.json()

    if (iyzipayData.status !== 'success') {
      throw new Error(iyzipayData.errorMessage || 'Iyzico subscription creation failed')
    }

    // Supabase subscriptions tablosunu güncelle
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({
        status: 'active',
        iyzico_subscription_reference_code: iyzipayData.data.referenceCode,
        iyzico_customer_reference_code: iyzipayData.data.customerReferenceCode,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 gün sonra
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Failed to update subscription in database:', updateError)
      throw new Error('Database update failed')
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription_reference_code: iyzipayData.data.referenceCode,
        checkout_form_content: iyzipayData.checkoutFormContent, // 3D Secure için
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in create-subscription:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
