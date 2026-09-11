-- Corrects the trial-terms copy on Pricing and Get Started: the card on
-- file is never auto-charged if a trial isn't converted -- access is
-- simply paused. Without this line the pages implied (via "all charges are
-- final") that something gets charged automatically, which isn't what
-- happens: nothing bills itself; the workspace just loses access until the
-- owner actively upgrades.
update public.site_page_sections
set config = jsonb_build_object('html', $html$<section class="vx-section tight" style="padding-bottom:0;">
<div class="vx-wrap" style="max-width:850px;">
<div class="vx-terms">
<h4>Trial &amp; Billing Terms</h4>
<p>A valid credit card is required to activate your 14-day free trial. Trial workspaces do not include free email, SMS, or storage credits -- those start once your workspace converts to a paid plan.</p>
<p>If you haven't upgraded to a paid plan by 11:59 PM CST on day 14, your workspace access is paused starting 12:00 AM CST on day 15 until you do -- your card is never charged automatically.</p>
<p>Billed annually, each plan costs 10 months' price for a full 12 months of service, calculated from your workspace's signup date.</p>
<p>All charges are final. Verexa does not offer refunds, credits, or balance transfers for any plan, add-on, or trial.</p>
</div>
</div>
</section>$html$)
where id = '74f1eecc-7aa2-4b05-99b1-f38e42a4ff36';

update public.site_page_sections
set config = jsonb_build_object('html', $html$<section class="vx-section tight" style="padding-bottom:56px;">
<div class="vx-wrap" style="max-width:850px;">
<div class="vx-terms">
<h4>Trial Terms</h4>
<p>A valid credit card is required to activate your 14-day free trial. Trial workspaces do not include free email, SMS, or storage credits -- those start once your workspace converts to a paid plan.</p>
<p>If you haven't upgraded to a paid plan by 11:59 PM CST on day 14, your workspace access is paused starting 12:00 AM CST on day 15 until you do -- your card is never charged automatically.</p>
<p>All charges are final. Verexa does not offer refunds, credits, or balance transfers for any plan, add-on, or trial.</p>
<p>Want the full pricing breakdown first? <a href="/site/verexa-hq-crm/www/pricing" style="color:#0b7fe0;font-weight:700;">See all plans &rarr;</a></p>
</div>
</div>
</section>$html$)
where id = 'a376d0a3-a901-470f-a334-d707d2632ba9';
