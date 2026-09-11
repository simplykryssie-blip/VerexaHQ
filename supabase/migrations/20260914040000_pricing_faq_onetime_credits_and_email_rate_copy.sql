-- Two live-site fixes to Pricing:
-- 1. The "Usage Rates" fine print still showed the old, wrong email
--    overage number ($0.02/email = $20/1,000) -- corrects it to the real
--    $2.00 per 1,000 emails now that the underlying rate is fixed (see
--    20260914030000_fix_email_overage_rate_precision.sql).
-- 2. Adds an FAQ entry clarifying the signup free email/SMS/storage
--    amounts are granted once, not renewed each billing period -- nothing
--    on the page said this either way, and a customer could reasonably
--    assume they refresh monthly like typical SaaS quotas.
update public.site_page_sections
set config = jsonb_build_object('html', $html$<section class="vx-section tight alt vx-bleed">
<div class="vx-wrap">
<div class="vx-center" style="max-width:600px;">
<span class="vx-kicker">Usage Rates</span>
<h2 class="vx-h2">The Same Rates, On Every Plan.</h2>
</div>
<div class="vx-fine">
<div><strong>$2.00</strong><span>per 1,000 emails, over your included amount</span></div>
<div><strong>$0.04</strong><span>per SMS segment, over your included amount</span></div>
<div><strong>$0.15</strong><span>per GB of storage, over your included amount</span></div>
<div><strong>14 Days</strong><span>free trial on every plan</span></div>
</div>
</div>
</section>$html$)
where id = '4469586f-053f-4033-ad49-82da5f8b3f99';

update public.site_page_sections
set config = jsonb_build_object('html', $html$<section class="vx-section">
<div class="vx-wrap">
<div class="vx-center" style="max-width:600px;">
<span class="vx-kicker">FAQ</span>
<h2 class="vx-h2">Pricing Questions, Answered.</h2>
</div>
<div class="vx-faq">
<details><summary>What do I get during the free trial?</summary><p>Full access to the plan you sign up for, for 14 days. A valid card is required to activate the trial, but trial workspaces don't include free communication or storage credits -- those begin once you convert to a paid plan.</p></details>
<details><summary>Do my free email and SMS amounts renew every month?</summary><p>No. The free email and SMS amount listed for your plan is granted once, the first time your workspace converts to a paid plan -- it doesn't refresh each billing period. Once it's used, additional sending is billed at the usage rates above. It's also non-refundable and doesn't transfer if you switch plans.</p></details>
<details><summary>Can I switch plans later?</summary><p>Yes. Move between Solo, Team, and Firm as your practice grows -- you're never locked into the plan you started on.</p></details>
<details><summary>What happens if I go over my included seats, storage, or communications?</summary><p>Extra seats, storage, email, and SMS are billed at the usage rates above. You won't be blocked from working -- overages are simply added to your account.</p></details>
<details><summary>Do you offer refunds?</summary><p>No. All charges are final, and unused time or credits don't transfer between plans or billing periods.</p></details>
<details><summary>Is Verexa tax preparation software?</summary><p>No. Verexa is the business operating system around the tax return. Your tax preparation software handles the actual return and filing; Verexa manages clients, documents, organizers, workflows, communications, and office operations.</p></details>
</div>
</div>
</section>$html$)
where id = '1e598fc6-2137-430c-ab5c-ac55db918280';
