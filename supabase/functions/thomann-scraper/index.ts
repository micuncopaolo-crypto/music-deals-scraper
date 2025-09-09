// File: supabase/functions/thomann-scraper/index.ts

import { createClient } from '[https://esm.sh/@supabase/supabase-js@2](https://esm.sh/@supabase/supabase-js@2)'
import { DOMParser } from "[https://deno.land/x/deno_dom/deno-dom-wasm.ts](https://deno.land/x/deno_dom/deno-dom-wasm.ts)";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const response = await fetch('[https://www.thomann.de/it/hotdeals.html](https://www.thomann.de/it/hotdeals.html)');
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) throw new Error("Failed to parse HTML.");
    
    const dealsToInsert = [];
    const dealElements = doc.querySelectorAll('.deal-container');

    dealElements.forEach(deal => {
        const titleElement = deal.querySelector('.deal-title a');
        const priceElement = deal.querySelector('.deal-price .primary-value');
        const originalPriceElement = deal.querySelector('.deal-price .secondary-value');
        const imageElement = deal.querySelector('.deal-image img');
        
        const product_name = titleElement?.textContent.trim() ?? 'N/A';
        let deal_url = titleElement?.getAttribute('href') ?? '';
        if (deal_url && !deal_url.startsWith('http')) deal_url = `https://www.thomann.de${deal_url}`;
        
        const deal_price = parseFloat(priceElement?.textContent.replace('€', '').replace('.', '').replace(',', '.').trim());
        const original_price_text = originalPriceElement?.textContent.replace('€', '').replace('.', '').replace(',', '.').trim();
        const original_price = original_price_text ? parseFloat(original_price_text) : null;
        const product_image_url = imageElement?.getAttribute('src') ?? '';

        if (product_name && deal_price && deal_url) {
            dealsToInsert.push({
                product_name, deal_url, deal_price, original_price,
                product_image_url, store: 'Thomann',
                description: `Offerta speciale da Thomann per ${product_name}`
            });
        }
    });

    if (dealsToInsert.length > 0) {
      const { error } = await supabaseClient
        .from('deals')
        .upsert(dealsToInsert, { onConflict: 'deal_url' });
      if (error) throw error;
    }
    
    return new Response(JSON.stringify({ message: `Scraping completato. ${dealsToInsert.length} offerte processate.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
