-- Redesign pass on Verexa's own marketing site:
-- 1. Removes the near-invisible gray-white border on every card/box
--    (.vx-card, .vx-price, .vx-fine, .vx-faq, .vx-terms, .vx-product,
--    .vx-structure, .vx-row, .vx-stat, .vx-panel) in favor of a real shadow
--    for elevation -- the borders were reading as a boxy, template-y
--    outline around every section rather than a confident, premium page.
--    Structural dividers (nav bottom border, footer top border, FAQ item
--    separators, internal panel dividers) are left alone -- those carry
--    real meaning, they aren't the accidental boxing being fixed here.
-- 2. Moves each page's <style> block out of its first custom_html section
--    and into site_pages.custom_css -- the same fix already applied to
--    tenant sites (see the builder-preview migration): a style tag embedded
--    in one custom_html section's own html is invisible to every *other*
--    custom_html section on the same page once each is sandboxed into its
--    own iframe in the staff builder preview. Page-level custom_css is
--    injected into every section's iframe, so this can't recur.
-- 3. Replaces both Home's and Pricing's hand-typed price grids with the
--    new pricing_table section, which reads live from
--    platform_subscription_plans via get_public_platform_plans instead of
--    a typed-in number -- this is the direct fix for prices going stale.
--    Home's copy was still showing the *retired* Independent PTIN/ERO/
--    Service Bureau tiers at $59/$119/$249 and a stale FAQ line about
--    $0.06/SMS and $25/seat, entirely out of sync with the real Solo/Team/
--    Firm pricing on the dedicated Pricing page -- this was almost
--    certainly the "wrong prices" being seen live.
-- 4. Removes the granular per-unit usage-rate breakdown from the Pricing
--    page (a detailed rate card reads as fine print, not a sell) in favor
--    of a single asterisked footnote, already built into the new
--    pricing_table section.

-- about ---------------------------------------------------------------
update public.site_pages set custom_css = $vxr1$@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.vx{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0c1f3f}
.vx *{box-sizing:border-box}
.vx a{text-decoration:none}
.vx-wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.vx-bleed{margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);width:100vw}
.vx-navstrip{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 24px}
.vx-navstrip .vx-wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.vx-navlinks{display:flex;gap:28px;flex-wrap:wrap;align-items:center}
.vx-navlinks a{color:#334155;font-size:15px;font-weight:700}
.vx-navlinks a:hover{color:#0b7fe0}
.vx-navlinks a.current{color:#0b7fe0}
.vx-kicker{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.15em;color:#0b7fe0}
.vx-eyebrow{display:inline-flex;align-items:center;gap:8px;border:1px solid #e8f3fe;background:#e8f3fe;color:#0a5aa8;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.vx-eyebrow i{width:7px;height:7px;border-radius:50%;background:#0b7fe0}
.vx-h1{font-size:clamp(38px,5.2vw,60px);line-height:1.05;letter-spacing:-.03em;margin:18px 0 0;font-weight:800;color:#0c1f3f;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-h2{font-size:clamp(30px,3.6vw,44px);line-height:1.1;letter-spacing:-.03em;margin:10px 0 0;font-weight:800;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#0c1f3f}
.vx-blue{color:#0b7fe0}
.vx-lead{font-size:18px;line-height:1.75;color:#4b5f7a;max-width:640px;margin:20px 0 0}
.vx-sub{font-size:17px;line-height:1.8;color:#4b5f7a;max-width:700px;margin:16px 0 0}
.vx-section{padding:88px 0}
.vx-section.tight{padding:56px 0}
.vx-section.alt{background:#e8f3fe}
.vx-section.dark{background:linear-gradient(180deg,#07152f,#0c1f3f);color:#fff}
.vx-section.dark .vx-kicker{color:#a4d22b}
.vx-section.dark .vx-h1,.vx-section.dark .vx-h2{color:#fff}
.vx-section.dark .vx-lead,.vx-section.dark .vx-sub{color:#cbd5e1}
.vx-center{text-align:center;margin-left:auto;margin-right:auto}
.vx-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.vx-actions.center{justify-content:center}
.vx-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:12px;padding:15px 24px;font-size:15px;font-weight:800;border:none;cursor:pointer}
.vx-primary{background:linear-gradient(120deg,#0b7fe0,#a4d22b);color:#071018;box-shadow:0 14px 35px rgba(11,127,224,.25)}
.vx-secondary{background:#fff;color:#0c1f3f;border:1px solid #dbe3ee}
.vx-white{background:#fff;color:#0c1f3f}
.vx-ghost-dark{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3)}
.vx-checks{display:flex;flex-wrap:wrap;gap:16px 26px;margin-top:24px;color:#4b5f7a;font-size:15px;font-weight:700}
.vx-checks span:before{content:'✓';color:#a4d22b;margin-right:8px}
.vx-checks.dark{color:#e2e8f0}
.vx-card{background:#fff;border-radius:22px;padding:28px;box-shadow:0 14px 40px rgba(15,40,80,.09)}
.vx-icon{width:44px;height:44px;border-radius:13px;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900}
.vx-card h3{font-size:18px;margin:18px 0 8px;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-card p{font-size:15px;line-height:1.7;color:#4b5f7a;margin:0}
.vx-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:44px}
.vx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.vx-list{margin-top:26px;display:grid;gap:20px}
.vx-list>div{display:flex;gap:14px}
.vx-list i{width:30px;height:30px;border-radius:50%;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;flex:none;font-size:14px}
.vx-list h4{font-size:17px;margin:0;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-list p{font-size:15px;line-height:1.7;color:#4b5f7a;margin:5px 0 0}
.vx-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}
.vx-step{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);border-radius:22px;padding:26px}
.vx-step b{color:#a4d22b;font-size:12px;letter-spacing:.08em}
.vx-step h3{font-size:18px;margin:12px 0 8px;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#fff}
.vx-step p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0}
.vx-step.light{background:#fff;box-shadow:0 10px 30px rgba(15,40,80,.07)}
.vx-step.light b{color:#0b7fe0}
.vx-step.light h3{color:#0c1f3f}
.vx-step.light p{color:#4b5f7a}
.vx-stat-strip{background:transparent;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);margin-top:56px}
.vx-stat-strip .vx-four{display:grid;grid-template-columns:repeat(4,1fr)}
.vx-stat-strip .vx-four>div{padding:28px 20px;border-right:1px solid rgba(255,255,255,.12);text-align:center}
.vx-stat-strip .vx-four>div:last-child{border-right:0}
.vx-stat-strip strong{display:block;font-size:26px;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#fff}
.vx-stat-strip span{display:block;margin-top:6px;font-size:12px;color:#cbd5e1;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.vx-cta-box{background:#0c1f3f;border-radius:32px;padding:64px 30px;text-align:center;color:#fff;overflow:hidden;position:relative}
.vx-cta-box:before{content:'';position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(11,127,224,.18);filter:blur(50px);left:50%;top:-170px;transform:translateX(-50%)}
.vx-cta-box>*{position:relative}
.vx-cta-box h2{font-size:clamp(32px,4vw,48px);letter-spacing:-.03em;line-height:1.08;margin:12px auto 0;max-width:760px;font-family:'Piazzolla',ui-serif,Georgia,serif;font-weight:800}
.vx-cta-box p{max-width:600px;margin:16px auto 0;color:#cbd5e1;line-height:1.7;font-size:16px}
.vx-faq{max-width:850px;margin:44px auto 0;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(15,40,80,.08)}
.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 22px}
.vx-faq details:last-child{border-bottom:0}
.vx-faq summary{cursor:pointer;list-style:none;padding:22px 0;font-size:16px;font-weight:800;display:flex;justify-content:space-between;gap:20px;color:#0c1f3f}
.vx-faq summary::-webkit-details-marker{display:none}
.vx-faq summary:after{content:'+';color:#94a3b8;font-size:20px}
.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}
.vx-faq p{font-size:15px;line-height:1.8;color:#4b5f7a;margin:0 0 22px}
.vx-terms{background:#f8fafc;border-left:4px solid #0b7fe0;border-radius:16px;padding:26px 28px;margin-top:36px}
.vx-terms h4{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0c1f3f;margin:0 0 12px}
.vx-terms p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 8px}
.vx-terms p:last-child{margin-bottom:0}
.vx-toggle{display:inline-flex;align-items:center;gap:0;background:#e8f3fe;border-radius:999px;padding:5px;margin-top:28px}
.vx-toggle button{border:none;background:transparent;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:800;color:#4b5f7a;cursor:pointer}
.vx-toggle button.active{background:#0c1f3f;color:#fff}
.vx-toggle .save{margin-left:8px;font-size:11px;font-weight:800;color:#0a8a3f;background:#e3f9ec;padding:4px 8px;border-radius:999px}
.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.vx-price{border-radius:26px;padding:30px;background:#fff;display:flex;flex-direction:column;box-shadow:0 14px 40px rgba(15,40,80,.08)}
.vx-price.featured{background:#0c1f3f;color:#fff;box-shadow:0 25px 70px rgba(12,31,63,.28)}
.vx-price small{font-size:12px;font-weight:900;color:#0b7fe0;letter-spacing:.06em}
.vx-price.featured small{color:#a4d22b}
.vx-price .vx-cost{font-size:44px;font-weight:900;letter-spacing:-.03em;margin-top:14px;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-price .vx-cost span{font-size:14px;font-weight:600;color:#94a3b8;letter-spacing:0;font-family:'Plus Jakarta Sans',sans-serif}
.vx-price.featured .vx-cost span{color:#94a3b8}
.vx-price .vx-cost-note{font-size:13px;color:#94a3b8;margin-top:6px}
.vx-price.featured .vx-cost-note{color:#cbd5e1}
.vx-price>p.desc{font-size:14px;line-height:1.7;color:#64748b;min-height:40px;margin-top:14px}
.vx-price.featured>p.desc{color:#cbd5e1}
.vx-price ul{list-style:none;padding:0;margin:20px 0;display:grid;gap:12px;flex:1}
.vx-price li{font-size:14px;line-height:1.5}
.vx-price li:before{content:'✓';color:#a4d22b;font-weight:900;margin-right:9px}
.vx-fine{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}
.vx-fine div{border-radius:16px;padding:16px;background:#f8fafc}
.vx-fine strong{font-size:15px;display:block}
.vx-fine span{display:block;font-size:12px;color:#64748b;margin-top:4px}
.vx-footer{border-top:1px solid #e2e8f0;background:#fff;padding:36px 0}
.vx-footer-inner{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap}
.vx-footer p{font-size:12px;color:#64748b;line-height:1.6;max-width:540px}
.vx-footer-links{display:flex;gap:22px;flex-wrap:wrap;font-size:12px;font-weight:800;color:#64748b}
.vx-footer-links a{color:#64748b}
.vx-footer-links a:hover{color:#0c1f3f}
@media(max-width:900px){
.vx-grid2,.vx-grid3,.vx-prices{grid-template-columns:1fr}
.vx-steps{grid-template-columns:1fr 1fr}
.vx-stat-strip .vx-four{grid-template-columns:1fr 1fr}
.vx-fine{grid-template-columns:1fr 1fr}
}
@media(max-width:620px){
.vx-wrap{padding:0 18px}
.vx-section{padding:60px 0}
.vx-steps{grid-template-columns:1fr}
.vx-stat-strip .vx-four{grid-template-columns:1fr 1fr}
.vx-fine{grid-template-columns:1fr}
.vx-actions .vx-btn{width:100%}
.vx-navlinks{gap:18px}
}$vxr1$ where id = 'c09b545b-8445-413f-81bc-1292abd93e40';

update public.site_page_sections set config = jsonb_build_object('html', $vxr2$<div class="vx">
<div class="vx-navstrip vx-bleed"><div class="vx-wrap"><div class="vx-navlinks"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing">Pricing</a><a href="/site/verexa-hq-crm/www/about" class="current">About</a></div><a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-primary" style="padding:11px 20px;font-size:13px;">Start Free Trial</a></div></div>

<section class="vx-section dark vx-bleed" style="padding-bottom:0;">
<div class="vx-wrap vx-center" style="max-width:760px;">
<span class="vx-eyebrow"><i></i> About Verexa</span>
<h1 class="vx-h1">Built By People Who Were Tired Of Doing This The Hard Way.</h1>
<p class="vx-lead vx-center" style="margin-left:auto;margin-right:auto;">Verexa exists because running a tax or accounting practice shouldn't mean bouncing between five disconnected tools just to track a client, chase a missing document, or send a follow-up. We built the system we wished we'd had -- one workspace for the entire business around the return.</p>
</div>
<div class="vx-stat-strip vx-bleed"><div class="vx-wrap vx-four">
<div><strong>9</strong><span>Core Modules</span></div>
<div><strong>3</strong><span>Workspace Sizes</span></div>
<div><strong>14 Days</strong><span>Free To Try</span></div>
<div><strong>$0</strong><span>Setup Fees</span></div>
</div></div>
</section>
</div>$vxr2$) where id = '6c4b119b-50ad-4856-a9e1-0df9b9bc3ccf';

-- get-started ----------------------------------------------------------
update public.site_pages set custom_css = $vxr3$@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.vx{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0c1f3f}
.vx *{box-sizing:border-box}
.vx a{text-decoration:none}
.vx-wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.vx-bleed{margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);width:100vw}
.vx-navstrip{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 24px}
.vx-navstrip .vx-wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.vx-navlinks{display:flex;gap:28px;flex-wrap:wrap;align-items:center}
.vx-navlinks a{color:#334155;font-size:15px;font-weight:700}
.vx-navlinks a:hover{color:#0b7fe0}
.vx-navlinks a.current{color:#0b7fe0}
.vx-kicker{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.15em;color:#0b7fe0}
.vx-eyebrow{display:inline-flex;align-items:center;gap:8px;border:1px solid #e8f3fe;background:#e8f3fe;color:#0a5aa8;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.vx-eyebrow i{width:7px;height:7px;border-radius:50%;background:#0b7fe0}
.vx-h1{font-size:clamp(38px,5.2vw,60px);line-height:1.05;letter-spacing:-.03em;margin:18px 0 0;font-weight:800;color:#0c1f3f;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-h2{font-size:clamp(30px,3.6vw,44px);line-height:1.1;letter-spacing:-.03em;margin:10px 0 0;font-weight:800;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#0c1f3f}
.vx-blue{color:#0b7fe0}
.vx-lead{font-size:18px;line-height:1.75;color:#4b5f7a;max-width:640px;margin:20px 0 0}
.vx-sub{font-size:17px;line-height:1.8;color:#4b5f7a;max-width:700px;margin:16px 0 0}
.vx-section{padding:88px 0}
.vx-section.tight{padding:56px 0}
.vx-section.alt{background:#e8f3fe}
.vx-section.dark{background:linear-gradient(180deg,#07152f,#0c1f3f);color:#fff}
.vx-section.dark .vx-kicker{color:#a4d22b}
.vx-section.dark .vx-h1,.vx-section.dark .vx-h2{color:#fff}
.vx-section.dark .vx-lead,.vx-section.dark .vx-sub{color:#cbd5e1}
.vx-center{text-align:center;margin-left:auto;margin-right:auto}
.vx-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.vx-actions.center{justify-content:center}
.vx-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:12px;padding:15px 24px;font-size:15px;font-weight:800;border:none;cursor:pointer}
.vx-primary{background:linear-gradient(120deg,#0b7fe0,#a4d22b);color:#071018;box-shadow:0 14px 35px rgba(11,127,224,.25)}
.vx-secondary{background:#fff;color:#0c1f3f;border:1px solid #dbe3ee}
.vx-white{background:#fff;color:#0c1f3f}
.vx-ghost-dark{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3)}
.vx-checks{display:flex;flex-wrap:wrap;gap:16px 26px;margin-top:24px;color:#4b5f7a;font-size:15px;font-weight:700}
.vx-checks span:before{content:'✓';color:#a4d22b;margin-right:8px}
.vx-checks.dark{color:#e2e8f0}
.vx-card{background:#fff;border-radius:22px;padding:28px;box-shadow:0 14px 40px rgba(15,40,80,.09)}
.vx-icon{width:44px;height:44px;border-radius:13px;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900}
.vx-card h3{font-size:18px;margin:18px 0 8px;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-card p{font-size:15px;line-height:1.7;color:#4b5f7a;margin:0}
.vx-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:44px}
.vx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.vx-list{margin-top:26px;display:grid;gap:20px}
.vx-list>div{display:flex;gap:14px}
.vx-list i{width:30px;height:30px;border-radius:50%;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;flex:none;font-size:14px}
.vx-list h4{font-size:17px;margin:0;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-list p{font-size:15px;line-height:1.7;color:#4b5f7a;margin:5px 0 0}
.vx-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}
.vx-step{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);border-radius:22px;padding:26px}
.vx-step b{color:#a4d22b;font-size:12px;letter-spacing:.08em}
.vx-step h3{font-size:18px;margin:12px 0 8px;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#fff}
.vx-step p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0}
.vx-step.light{background:#fff;box-shadow:0 10px 30px rgba(15,40,80,.07)}
.vx-step.light b{color:#0b7fe0}
.vx-step.light h3{color:#0c1f3f}
.vx-step.light p{color:#4b5f7a}
.vx-stat-strip{background:transparent;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);margin-top:56px}
.vx-stat-strip .vx-four{display:grid;grid-template-columns:repeat(4,1fr)}
.vx-stat-strip .vx-four>div{padding:28px 20px;border-right:1px solid rgba(255,255,255,.12);text-align:center}
.vx-stat-strip .vx-four>div:last-child{border-right:0}
.vx-stat-strip strong{display:block;font-size:26px;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#fff}
.vx-stat-strip span{display:block;margin-top:6px;font-size:12px;color:#cbd5e1;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.vx-cta-box{background:#0c1f3f;border-radius:32px;padding:64px 30px;text-align:center;color:#fff;overflow:hidden;position:relative}
.vx-cta-box:before{content:'';position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(11,127,224,.18);filter:blur(50px);left:50%;top:-170px;transform:translateX(-50%)}
.vx-cta-box>*{position:relative}
.vx-cta-box h2{font-size:clamp(32px,4vw,48px);letter-spacing:-.03em;line-height:1.08;margin:12px auto 0;max-width:760px;font-family:'Piazzolla',ui-serif,Georgia,serif;font-weight:800}
.vx-cta-box p{max-width:600px;margin:16px auto 0;color:#cbd5e1;line-height:1.7;font-size:16px}
.vx-faq{max-width:850px;margin:44px auto 0;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(15,40,80,.08)}
.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 22px}
.vx-faq details:last-child{border-bottom:0}
.vx-faq summary{cursor:pointer;list-style:none;padding:22px 0;font-size:16px;font-weight:800;display:flex;justify-content:space-between;gap:20px;color:#0c1f3f}
.vx-faq summary::-webkit-details-marker{display:none}
.vx-faq summary:after{content:'+';color:#94a3b8;font-size:20px}
.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}
.vx-faq p{font-size:15px;line-height:1.8;color:#4b5f7a;margin:0 0 22px}
.vx-terms{background:#f8fafc;border-left:4px solid #0b7fe0;border-radius:16px;padding:26px 28px;margin-top:36px}
.vx-terms h4{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0c1f3f;margin:0 0 12px}
.vx-terms p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 8px}
.vx-terms p:last-child{margin-bottom:0}
.vx-toggle{display:inline-flex;align-items:center;gap:0;background:#e8f3fe;border-radius:999px;padding:5px;margin-top:28px}
.vx-toggle button{border:none;background:transparent;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:800;color:#4b5f7a;cursor:pointer}
.vx-toggle button.active{background:#0c1f3f;color:#fff}
.vx-toggle .save{margin-left:8px;font-size:11px;font-weight:800;color:#0a8a3f;background:#e3f9ec;padding:4px 8px;border-radius:999px}
.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.vx-price{border-radius:26px;padding:30px;background:#fff;display:flex;flex-direction:column;box-shadow:0 14px 40px rgba(15,40,80,.08)}
.vx-price.featured{background:#0c1f3f;color:#fff;box-shadow:0 25px 70px rgba(12,31,63,.28)}
.vx-price small{font-size:12px;font-weight:900;color:#0b7fe0;letter-spacing:.06em}
.vx-price.featured small{color:#a4d22b}
.vx-price .vx-cost{font-size:44px;font-weight:900;letter-spacing:-.03em;margin-top:14px;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-price .vx-cost span{font-size:14px;font-weight:600;color:#94a3b8;letter-spacing:0;font-family:'Plus Jakarta Sans',sans-serif}
.vx-price.featured .vx-cost span{color:#94a3b8}
.vx-price .vx-cost-note{font-size:13px;color:#94a3b8;margin-top:6px}
.vx-price.featured .vx-cost-note{color:#cbd5e1}
.vx-price>p.desc{font-size:14px;line-height:1.7;color:#64748b;min-height:40px;margin-top:14px}
.vx-price.featured>p.desc{color:#cbd5e1}
.vx-price ul{list-style:none;padding:0;margin:20px 0;display:grid;gap:12px;flex:1}
.vx-price li{font-size:14px;line-height:1.5}
.vx-price li:before{content:'✓';color:#a4d22b;font-weight:900;margin-right:9px}
.vx-fine{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}
.vx-fine div{border-radius:16px;padding:16px;background:#f8fafc}
.vx-fine strong{font-size:15px;display:block}
.vx-fine span{display:block;font-size:12px;color:#64748b;margin-top:4px}
.vx-footer{border-top:1px solid #e2e8f0;background:#fff;padding:36px 0}
.vx-footer-inner{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap}
.vx-footer p{font-size:12px;color:#64748b;line-height:1.6;max-width:540px}
.vx-footer-links{display:flex;gap:22px;flex-wrap:wrap;font-size:12px;font-weight:800;color:#64748b}
.vx-footer-links a{color:#64748b}
.vx-footer-links a:hover{color:#0c1f3f}
@media(max-width:900px){
.vx-grid2,.vx-grid3,.vx-prices{grid-template-columns:1fr}
.vx-steps{grid-template-columns:1fr 1fr}
.vx-stat-strip .vx-four{grid-template-columns:1fr 1fr}
.vx-fine{grid-template-columns:1fr 1fr}
}
@media(max-width:620px){
.vx-wrap{padding:0 18px}
.vx-section{padding:60px 0}
.vx-steps{grid-template-columns:1fr}
.vx-stat-strip .vx-four{grid-template-columns:1fr 1fr}
.vx-fine{grid-template-columns:1fr}
.vx-actions .vx-btn{width:100%}
.vx-navlinks{gap:18px}
}$vxr3$ where id = 'd4f5c664-2584-4fe8-82e0-42e44db52de2';

update public.site_page_sections set config = jsonb_build_object('html', $vxr4$<div class="vx">
<div class="vx-navstrip vx-bleed"><div class="vx-wrap"><div class="vx-navlinks"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing">Pricing</a><a href="/site/verexa-hq-crm/www/about">About</a></div><a href="/site/verexa-hq-crm/www/pricing" class="vx-navlinks" style="font-size:13px;font-weight:800;color:#0b7fe0;">See Pricing &rarr;</a></div></div>

<section class="vx-section tight" style="padding-bottom:24px;">
<div class="vx-wrap vx-center" style="max-width:680px;">
<span class="vx-eyebrow"><i></i> Free 14-Day Trial</span>
<h1 class="vx-h1">See Verexa Running Your Firm.</h1>
<p class="vx-lead vx-center" style="margin-left:auto;margin-right:auto;">Tell us a bit about your firm below. We'll set up your workspace and walk you through activating your trial -- no generic sign-up flow, a real person will help.</p>
<div class="vx-checks" style="justify-content:center;">
<span>Full platform access</span>
<span>Real onboarding, not a bot</span>
<span>$0 setup fees</span>
</div>
</div>
</section>
</div>$vxr4$) where id = 'df27a8f0-fd99-4ce4-83f5-9f8d6481ff8a';

-- pricing --------------------------------------------------------------
update public.site_pages set custom_css = $vxr5$@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.vx{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0c1f3f}
.vx *{box-sizing:border-box}
.vx a{text-decoration:none}
.vx-wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.vx-bleed{margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);width:100vw}
.vx-navstrip{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 24px}
.vx-navstrip .vx-wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.vx-navlinks{display:flex;gap:28px;flex-wrap:wrap;align-items:center}
.vx-navlinks a{color:#334155;font-size:15px;font-weight:700}
.vx-navlinks a:hover{color:#0b7fe0}
.vx-navlinks a.current{color:#0b7fe0}
.vx-kicker{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.15em;color:#0b7fe0}
.vx-eyebrow{display:inline-flex;align-items:center;gap:8px;border:1px solid #e8f3fe;background:#e8f3fe;color:#0a5aa8;border-radius:999px;padding:7px 14px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.vx-eyebrow i{width:7px;height:7px;border-radius:50%;background:#0b7fe0}
.vx-h1{font-size:clamp(38px,5.2vw,60px);line-height:1.05;letter-spacing:-.03em;margin:18px 0 0;font-weight:800;color:#0c1f3f;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-h2{font-size:clamp(30px,3.6vw,44px);line-height:1.1;letter-spacing:-.03em;margin:10px 0 0;font-weight:800;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#0c1f3f}
.vx-blue{color:#0b7fe0}
.vx-lead{font-size:18px;line-height:1.75;color:#4b5f7a;max-width:640px;margin:20px 0 0}
.vx-sub{font-size:17px;line-height:1.8;color:#4b5f7a;max-width:700px;margin:16px 0 0}
.vx-section{padding:88px 0}
.vx-section.tight{padding:56px 0}
.vx-section.alt{background:#e8f3fe}
.vx-section.dark{background:linear-gradient(180deg,#07152f,#0c1f3f);color:#fff}
.vx-section.dark .vx-kicker{color:#a4d22b}
.vx-section.dark .vx-h1,.vx-section.dark .vx-h2{color:#fff}
.vx-section.dark .vx-lead,.vx-section.dark .vx-sub{color:#cbd5e1}
.vx-center{text-align:center;margin-left:auto;margin-right:auto}
.vx-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.vx-actions.center{justify-content:center}
.vx-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:12px;padding:15px 24px;font-size:15px;font-weight:800;border:none;cursor:pointer}
.vx-primary{background:linear-gradient(120deg,#0b7fe0,#a4d22b);color:#071018;box-shadow:0 14px 35px rgba(11,127,224,.25)}
.vx-secondary{background:#fff;color:#0c1f3f;border:1px solid #dbe3ee}
.vx-white{background:#fff;color:#0c1f3f}
.vx-ghost-dark{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3)}
.vx-checks{display:flex;flex-wrap:wrap;gap:16px 26px;margin-top:24px;color:#4b5f7a;font-size:15px;font-weight:700}
.vx-checks span:before{content:'✓';color:#a4d22b;margin-right:8px}
.vx-checks.dark{color:#e2e8f0}
.vx-card{background:#fff;border-radius:22px;padding:28px;box-shadow:0 14px 40px rgba(15,40,80,.09)}
.vx-icon{width:44px;height:44px;border-radius:13px;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900}
.vx-card h3{font-size:18px;margin:18px 0 8px;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-card p{font-size:15px;line-height:1.7;color:#4b5f7a;margin:0}
.vx-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:44px}
.vx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.vx-list{margin-top:26px;display:grid;gap:20px}
.vx-list>div{display:flex;gap:14px}
.vx-list i{width:30px;height:30px;border-radius:50%;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;flex:none;font-size:14px}
.vx-list h4{font-size:17px;margin:0;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-list p{font-size:15px;line-height:1.7;color:#4b5f7a;margin:5px 0 0}
.vx-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}
.vx-step{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);border-radius:22px;padding:26px}
.vx-step b{color:#a4d22b;font-size:12px;letter-spacing:.08em}
.vx-step h3{font-size:18px;margin:12px 0 8px;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#fff}
.vx-step p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0}
.vx-step.light{background:#fff;box-shadow:0 10px 30px rgba(15,40,80,.07)}
.vx-step.light b{color:#0b7fe0}
.vx-step.light h3{color:#0c1f3f}
.vx-step.light p{color:#4b5f7a}
.vx-stat-strip{background:transparent;border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12);margin-top:56px}
.vx-stat-strip .vx-four{display:grid;grid-template-columns:repeat(4,1fr)}
.vx-stat-strip .vx-four>div{padding:28px 20px;border-right:1px solid rgba(255,255,255,.12);text-align:center}
.vx-stat-strip .vx-four>div:last-child{border-right:0}
.vx-stat-strip strong{display:block;font-size:26px;font-family:'Piazzolla',ui-serif,Georgia,serif;color:#fff}
.vx-stat-strip span{display:block;margin-top:6px;font-size:12px;color:#cbd5e1;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.vx-cta-box{background:#0c1f3f;border-radius:32px;padding:64px 30px;text-align:center;color:#fff;overflow:hidden;position:relative}
.vx-cta-box:before{content:'';position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(11,127,224,.18);filter:blur(50px);left:50%;top:-170px;transform:translateX(-50%)}
.vx-cta-box>*{position:relative}
.vx-cta-box h2{font-size:clamp(32px,4vw,48px);letter-spacing:-.03em;line-height:1.08;margin:12px auto 0;max-width:760px;font-family:'Piazzolla',ui-serif,Georgia,serif;font-weight:800}
.vx-cta-box p{max-width:600px;margin:16px auto 0;color:#cbd5e1;line-height:1.7;font-size:16px}
.vx-faq{max-width:850px;margin:44px auto 0;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(15,40,80,.08)}
.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 22px}
.vx-faq details:last-child{border-bottom:0}
.vx-faq summary{cursor:pointer;list-style:none;padding:22px 0;font-size:16px;font-weight:800;display:flex;justify-content:space-between;gap:20px;color:#0c1f3f}
.vx-faq summary::-webkit-details-marker{display:none}
.vx-faq summary:after{content:'+';color:#94a3b8;font-size:20px}
.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}
.vx-faq p{font-size:15px;line-height:1.8;color:#4b5f7a;margin:0 0 22px}
.vx-terms{background:#f8fafc;border-left:4px solid #0b7fe0;border-radius:16px;padding:26px 28px;margin-top:36px}
.vx-terms h4{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0c1f3f;margin:0 0 12px}
.vx-terms p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 8px}
.vx-terms p:last-child{margin-bottom:0}
.vx-toggle{display:inline-flex;align-items:center;gap:0;background:#e8f3fe;border-radius:999px;padding:5px;margin-top:28px}
.vx-toggle button{border:none;background:transparent;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:800;color:#4b5f7a;cursor:pointer}
.vx-toggle button.active{background:#0c1f3f;color:#fff}
.vx-toggle .save{margin-left:8px;font-size:11px;font-weight:800;color:#0a8a3f;background:#e3f9ec;padding:4px 8px;border-radius:999px}
.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.vx-price{border-radius:26px;padding:30px;background:#fff;display:flex;flex-direction:column;box-shadow:0 14px 40px rgba(15,40,80,.08)}
.vx-price.featured{background:#0c1f3f;color:#fff;box-shadow:0 25px 70px rgba(12,31,63,.28)}
.vx-price small{font-size:12px;font-weight:900;color:#0b7fe0;letter-spacing:.06em}
.vx-price.featured small{color:#a4d22b}
.vx-price .vx-cost{font-size:44px;font-weight:900;letter-spacing:-.03em;margin-top:14px;font-family:'Piazzolla',ui-serif,Georgia,serif}
.vx-price .vx-cost span{font-size:14px;font-weight:600;color:#94a3b8;letter-spacing:0;font-family:'Plus Jakarta Sans',sans-serif}
.vx-price.featured .vx-cost span{color:#94a3b8}
.vx-price .vx-cost-note{font-size:13px;color:#94a3b8;margin-top:6px}
.vx-price.featured .vx-cost-note{color:#cbd5e1}
.vx-price>p.desc{font-size:14px;line-height:1.7;color:#64748b;min-height:40px;margin-top:14px}
.vx-price.featured>p.desc{color:#cbd5e1}
.vx-price ul{list-style:none;padding:0;margin:20px 0;display:grid;gap:12px;flex:1}
.vx-price li{font-size:14px;line-height:1.5}
.vx-price li:before{content:'✓';color:#a4d22b;font-weight:900;margin-right:9px}
.vx-fine{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}
.vx-fine div{border-radius:16px;padding:16px;background:#f8fafc}
.vx-fine strong{font-size:15px;display:block}
.vx-fine span{display:block;font-size:12px;color:#64748b;margin-top:4px}
.vx-footer{border-top:1px solid #e2e8f0;background:#fff;padding:36px 0}
.vx-footer-inner{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap}
.vx-footer p{font-size:12px;color:#64748b;line-height:1.6;max-width:540px}
.vx-footer-links{display:flex;gap:22px;flex-wrap:wrap;font-size:12px;font-weight:800;color:#64748b}
.vx-footer-links a{color:#64748b}
.vx-footer-links a:hover{color:#0c1f3f}
@media(max-width:900px){
.vx-grid2,.vx-grid3,.vx-prices{grid-template-columns:1fr}
.vx-steps{grid-template-columns:1fr 1fr}
.vx-stat-strip .vx-four{grid-template-columns:1fr 1fr}
.vx-fine{grid-template-columns:1fr 1fr}
}
@media(max-width:620px){
.vx-wrap{padding:0 18px}
.vx-section{padding:60px 0}
.vx-steps{grid-template-columns:1fr}
.vx-stat-strip .vx-four{grid-template-columns:1fr 1fr}
.vx-fine{grid-template-columns:1fr}
.vx-actions .vx-btn{width:100%}
.vx-navlinks{gap:18px}
}$vxr5$ where id = 'eb34e3e1-c86c-43c1-a47c-bd176f401f31';

update public.site_page_sections set config = jsonb_build_object('html', $vxr6$<div class="vx">
<div class="vx-navstrip vx-bleed"><div class="vx-wrap"><div class="vx-navlinks"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing" class="current">Pricing</a><a href="/site/verexa-hq-crm/www/about">About</a></div><a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-primary" style="padding:11px 20px;font-size:13px;">Start Free Trial</a></div></div>

<section class="vx-section tight">
<div class="vx-wrap vx-center" style="max-width:700px;">
<span class="vx-kicker">Pricing</span>
<h1 class="vx-h1">Straightforward Pricing For Firms At Every Stage.</h1>
<p class="vx-lead vx-center" style="margin-left:auto;margin-right:auto;">Every plan includes the full Verexa platform. The only difference is how many seats and how much room your firm needs. Try any plan free for 14 days.</p>
</div>
</section>
</div>$vxr6$) where id = '5fb78778-e9be-4097-ae1d-fddf617b5287';

update public.site_page_sections set section_type = 'pricing_table', display_order = 2, config = '{"noTopPadding": true}'::jsonb where id = 'a2d8fd4f-3684-4150-9d64-73e0e009bc52';

delete from public.site_page_sections where id = '4469586f-053f-4033-ad49-82da5f8b3f99';

update public.site_page_sections set display_order = 3 where id = '74f1eecc-7aa2-4b05-99b1-f38e42a4ff36';
update public.site_page_sections set display_order = 4 where id = '1e598fc6-2137-430c-ab5c-ac55db918280';
update public.site_page_sections set display_order = 5 where id = '44fcda0f-a08c-420c-b57f-4f5737cf99d3';
update public.site_page_sections set display_order = 6 where id = '9443e808-d60e-4be5-babd-3f9eb4f747c6';

-- home ------------------------------------------------------------------
update public.site_pages set custom_css = $vxr101$@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
.vx{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0c1f3f}
.vx *{box-sizing:border-box}.vx a{text-decoration:none}.vx-wrap{max-width:1180px;margin:0 auto;padding:0 24px}.vx-hero{background:radial-gradient(circle at 15% 15%,rgba(11,127,224,.16),transparent 32%),radial-gradient(circle at 90% 10%,rgba(99,102,241,.12),transparent 28%),linear-gradient(180deg,#07152f,#0c1f3f);padding:88px 0 96px}.vx-grid{display:grid;grid-template-columns:.92fr 1.08fr;gap:64px;align-items:center}.vx-eyebrow{display:inline-flex;align-items:center;gap:8px;border:1px solid #e8f3fe;background:#e8f3fe;color:#0a5aa8;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.vx-eyebrow i{width:7px;height:7px;border-radius:50%;background:#0b7fe0}.vx-h1{font-size:clamp(46px,6vw,74px);line-height:.98;letter-spacing:-.055em;margin:18px 0 0;font-weight:800;color:#0c1f3f;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-blue{color:#0b7fe0}.vx-lead{font-size:18px;line-height:1.8;color:#64748b;max-width:650px;margin:26px 0 0}.vx-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.vx-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:12px;padding:13px 19px;font-size:14px;font-weight:800}.vx-primary{background:linear-gradient(120deg,#0b7fe0,#a4d22b);color:#071018;box-shadow:0 14px 35px rgba(11,127,224,.25)}.vx-secondary{background:white;color:#0c1f3f;border:1px solid #dbe3ee}.vx-checks{display:flex;flex-wrap:wrap;gap:16px 24px;margin-top:22px;color:#64748b;font-size:14px;font-weight:700}.vx-checks span:before{content:'✓';color:#a4d22b;margin-right:7px}.vx-product{border-radius:28px;background:#fff;box-shadow:0 30px 90px rgba(15,40,80,.22);overflow:hidden}.vx-top{height:48px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;justify-content:space-between;padding:0 18px}.vx-dots{display:flex;gap:6px}.vx-dots b{width:8px;height:8px;border-radius:50%;background:#cbd5e1}.vx-pill{font-size:10px;font-weight:800;color:#475569;background:#f8fafc;padding:7px 10px;border-radius:8px}.vx-app{display:grid;grid-template-columns:120px 1fr;min-height:420px}.vx-side{background:#e8f3fe;border-right:1px solid #eef2f7;padding:16px 10px}.vx-brand{margin:0 7px 22px;height:28px;display:flex;align-items:center}.vx-brand img{max-width:92px;max-height:28px;object-fit:contain}.vx-nav{font-size:10px;font-weight:700;color:#64748b;padding:9px 8px;border-radius:9px;margin-bottom:2px}.vx-nav.active{background:#fff;color:#0b7fe0;box-shadow:0 3px 12px rgba(15,40,80,.06)}.vx-main{padding:22px}.vx-small{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;font-weight:800}.vx-title{font-size:18px;font-weight:800;margin:4px 0 0;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:20px}.vx-stat{background:#f8fafc;border-radius:13px;padding:12px}.vx-stat small{display:block;color:#94a3b8;font-size:9px;font-weight:700}.vx-stat strong{display:block;margin-top:4px;font-size:17px}.vx-panels{display:grid;grid-template-columns:1.35fr 1fr;gap:10px;margin-top:12px}.vx-panel{background:#f8fafc;border-radius:15px;padding:14px}.vx-panel h4{font-size:11px;margin:0 0 13px}.vx-bar{height:7px;background:#eef2f7;border-radius:99px;margin:5px 0 12px}.vx-bar i{display:block;height:100%;background:#0b7fe0;border-radius:99px}.vx-alert{margin-top:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:11px;padding:9px;font-size:9px;font-weight:800}.vx-strip{background:transparent;border-top:1px solid #eef2f7;border-bottom:1px solid #eef2f7}.vx-four{display:grid;grid-template-columns:repeat(4,1fr)}.vx-four>div{padding:28px 24px;border-right:1px solid #eef2f7}.vx-four>div:last-child{border-right:0}.vx-num{font-size:12px;color:#0b7fe0;font-weight:900}.vx-four h3{font-size:14px;margin:7px 0 5px;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-four p,.vx-card p,.vx-copy p{font-size:14px;line-height:1.65;color:#64748b;margin:0}.vx-section{padding:96px 0}.vx-section.alt{background:#e8f3fe}.vx-kicker{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.15em;color:#0b7fe0}.vx-h2{font-size:clamp(34px,4vw,52px);line-height:1.06;letter-spacing:-.045em;margin:10px 0 0;font-weight:800;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-sub{font-size:17px;line-height:1.8;color:#64748b;max-width:700px;margin:18px 0 0}.vx-features{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:46px}.vx-card{background:white;border-radius:22px;padding:26px;box-shadow:0 14px 40px rgba(15,40,80,.08)}.vx-icon{width:42px;height:42px;border-radius:13px;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900}.vx-card h3{font-size:17px;margin:18px 0 7px;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-dark{background:#0c1f3f;color:#fff}.vx-dark .vx-kicker{color:#a4d22b}.vx-dark .vx-h2{color:#fff}.vx-dark .vx-sub{color:#cbd5e1}.vx-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:44px}.vx-step{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);border-radius:22px;padding:24px}.vx-step b{color:#a4d22b;font-size:11px}.vx-step h3{font-size:17px;margin:10px 0 6px;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-step p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0}.vx-growth{display:grid;grid-template-columns:1fr 1fr;gap:54px;align-items:center}.vx-list{margin-top:28px;display:grid;gap:18px}.vx-list>div{display:flex;gap:12px}.vx-list i{width:28px;height:28px;border-radius:50%;background:#e8f3fe;color:#0b7fe0;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;flex:none}.vx-list h4{font-size:16px;margin:0;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-list p{font-size:14px;line-height:1.65;color:#64748b;margin:4px 0 0}.vx-structure{border-radius:26px;padding:28px;background:linear-gradient(135deg,#f8fbff,#fff);box-shadow:0 24px 70px rgba(15,40,80,.12)}.vx-structure h3{font-size:22px;margin:7px 0 0;font-family:'Piazzolla',ui-serif,Georgia,serif}.vx-rows{margin-top:22px;display:grid;gap:9px}.vx-row{display:flex;gap:12px;align-items:center;background:#f8fafc;border-radius:15px;padding:13px}.vx-row b{width:30px;height:30px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;color:#64748b}.vx-row strong{font-size:12px;display:block}.vx-row span{font-size:10px;color:#64748b}.vx-ero{background:#e8f3fe}.vx-ero-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:40px}.vx-ero .vx-card{box-shadow:none}.vx-price-head{text-align:center;max-width:720px;margin:0 auto}.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:44px}.vx-price{border-radius:26px;padding:28px;background:#fff;display:flex;flex-direction:column;box-shadow:0 14px 40px rgba(15,40,80,.08)}.vx-price.featured{background:#0c1f3f;color:#fff;box-shadow:0 25px 70px rgba(12,31,63,.28)}.vx-price small{font-size:12px;font-weight:900;color:#0b7fe0}.vx-price.featured small{color:#a4d22b}.vx-cost{font-size:48px;font-weight:900;letter-spacing:-.05em;margin-top:12px}.vx-cost span{font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:0}.vx-price>p{font-size:12px;line-height:1.6;color:#64748b;min-height:42px}.vx-price.featured>p{color:#cbd5e1}.vx-price ul{list-style:none;padding:0;margin:22px 0;display:grid;gap:10px;flex:1}.vx-price li{font-size:12px;line-height:1.5}.vx-price li:before{content:'✓';color:#a4d22b;font-weight:900;margin-right:8px}.vx-price.featured li:before{color:#a4d22b}.vx-bonus{font-size:11px;font-weight:800;padding:10px;border-radius:12px;background:#e8f3fe;color:#0a5aa8}.vx-price.featured .vx-bonus{background:rgba(255,255,255,.1);color:#e8f3fe}.vx-fine{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}.vx-fine div{border-radius:16px;padding:14px;background:#f8fafc}.vx-fine strong{font-size:13px}.vx-fine span{display:block;font-size:10px;color:#64748b;margin-top:4px}.vx-faq{max-width:850px;margin:40px auto 0;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 14px 40px rgba(15,40,80,.08)}.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 20px}.vx-faq details:last-child{border-bottom:0}.vx-faq summary{cursor:pointer;list-style:none;padding:20px 0;font-size:14px;font-weight:800;display:flex;justify-content:space-between;gap:20px}.vx-faq summary::-webkit-details-marker{display:none}.vx-faq summary:after{content:'+';color:#94a3b8}.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}.vx-faq p{font-size:13px;line-height:1.75;color:#64748b;margin:0 0 20px}.vx-cta{padding:0 0 90px}.vx-cta-box{background:#0c1f3f;border-radius:32px;padding:60px 30px;text-align:center;color:#fff;overflow:hidden;position:relative}.vx-cta-box:before{content:'';position:absolute;width:260px;height:260px;border-radius:50%;background:rgba(11,127,224,.18);filter:blur(45px);left:50%;top:-160px;transform:translateX(-50%)}.vx-cta-box>*{position:relative}.vx-cta-box h2{font-size:clamp(34px,4vw,52px);letter-spacing:-.045em;line-height:1.05;margin:12px auto 0;max-width:780px}.vx-cta-box p{max-width:620px;margin:18px auto 0;color:#cbd5e1;line-height:1.7}.vx-white{background:#fff;color:#0c1f3f}.vx-footer{border-top:1px solid #e2e8f0;background:#fff;padding:34px 0}.vx-footer-inner{display:flex;justify-content:space-between;gap:24px;align-items:center}.vx-footer p{font-size:11px;color:#64748b;line-height:1.6;max-width:520px}.vx-footer-links{display:flex;gap:20px;flex-wrap:wrap;font-size:11px;font-weight:800;color:#64748b}.vx-footer-links a{color:#64748b}.vx-footer-links a:hover{color:#0c1f3f}@media(max-width:900px){.vx-grid,.vx-growth{grid-template-columns:1fr}.vx-features,.vx-prices{grid-template-columns:1fr 1fr}.vx-steps{grid-template-columns:1fr 1fr}.vx-ero-grid{grid-template-columns:1fr 1fr}.vx-four{grid-template-columns:1fr 1fr}.vx-four>div:nth-child(2){border-right:0}.vx-four>div{border-bottom:1px solid #eef2f7}.vx-fine{grid-template-columns:1fr 1fr}.vx-product{max-width:700px;margin:0 auto}}@media(max-width:620px){.vx-wrap{padding:0 18px}.vx-hero,.vx-section{padding:64px 0}.vx-features,.vx-prices,.vx-steps,.vx-ero-grid{grid-template-columns:1fr}.vx-four{grid-template-columns:1fr}.vx-four>div{border-right:0}.vx-stats{grid-template-columns:1fr 1fr}.vx-panels{grid-template-columns:1fr}.vx-app{grid-template-columns:78px 1fr}.vx-side{padding:12px 7px}.vx-brand{font-size:10px}.vx-nav{font-size:8px}.vx-main{padding:14px}.vx-footer-inner{flex-direction:column;align-items:flex-start}.vx-fine{grid-template-columns:1fr}.vx-actions .vx-btn{width:100%}.vx-four>div{padding:22px 4px}.vx-num{font-size:13px}.vx-four h3{font-size:17px}.vx-four p{font-size:14px}}$vxr101$ where id = 'b75cbf39-2ab3-4fef-822a-18b476338ffc';

update public.site_page_sections set display_order = 1, config = jsonb_build_object('html', $vxr102$<div class="vx">
<section class="vx-hero"><div class="vx-wrap"><div class="vx-grid"><div>
<div class="vx-eyebrow"><i></i> Tax office operating system</div>
<h1 class="vx-h1">Run your tax practice.<br><span class="vx-blue">Not the paperwork.</span></h1>
<p class="vx-lead">Verexa brings your clients, documents, organizers, workflows, communications, signatures, tasks and team operations into one purpose-built workspace for tax professionals.</p>
<div class="vx-actions"><a class="vx-btn vx-primary" href="/site/verexa-hq-crm/www/home#trial-form">Start your 14-day trial →</a><a class="vx-btn vx-secondary" href="#platform">Explore Verexa ↓</a></div>
<div class="vx-checks"><span>Built for tax offices</span><span>Secure client portal</span><span>No tax filing lock-in</span></div>
</div>
<div class="vx-product"><div class="vx-top"><div class="vx-dots"><b></b><b></b><b></b></div><span class="vx-pill">ERO Workspace</span></div><div class="vx-app"><aside class="vx-side"><p class="vx-brand"><img src="https://daxpavvsotvsyqqntddc.supabase.co/storage/v1/object/public/branding/74321fb2-9a18-4625-ab12-01c98e888667/sidebar-logo-1787593471647-2DDB8B45-564A-417D-89E6-1D8ED97440FC.png" alt="Verexa"></p><div class="vx-nav active">Dashboard</div><div class="vx-nav">Clients</div><div class="vx-nav">Pipeline</div><div class="vx-nav">Workflows</div><div class="vx-nav">Documents</div><div class="vx-nav">Team</div></aside><div class="vx-main"><span class="vx-small">Tax season dashboard</span><h3 class="vx-title">Good morning, ERO</h3><div class="vx-stats"><div class="vx-stat"><small>Clients</small><strong>428</strong></div><div class="vx-stat"><small>In progress</small><strong>64</strong></div><div class="vx-stat"><small>Awaiting docs</small><strong>27</strong></div><div class="vx-stat"><small>Review</small><strong>12</strong></div></div><div class="vx-panels"><div class="vx-panel"><h4>Client pipeline</h4><div class="vx-small">New lead · 18</div><div class="vx-bar"><i style="width:42%"></i></div><div class="vx-small">Documents · 27</div><div class="vx-bar"><i style="width:60%"></i></div><div class="vx-small">In preparation · 34</div><div class="vx-bar"><i style="width:76%"></i></div><div class="vx-small">Review · 12</div><div class="vx-bar"><i style="width:32%"></i></div></div><div class="vx-panel"><h4>Team workload</h4><p style="font-size:10px;color:#64748b;margin:0 0 9px">Sarah · 18 clients</p><p style="font-size:10px;color:#64748b;margin:0 0 9px">Marcus · 14 clients</p><p style="font-size:10px;color:#64748b;margin:0">Taylor · 11 clients</p><div style="margin-top:14px;background:#0c1f3f;color:#fff;border-radius:8px;padding:8px;text-align:center;font-size:9px;font-weight:800">Manage team</div></div></div><div class="vx-alert">⚡ 8 clients need attention today</div></div></div></div>
</div></div></section>

<section class="vx-strip"><div class="vx-wrap"><div class="vx-four"><div><span class="vx-num">01</span><h3>One workspace</h3><p>Clients, documents, workflows and communications together.</p></div><div><span class="vx-num">02</span><h3>Built for tax</h3><p>Designed around how tax offices actually operate.</p></div><div><span class="vx-num">03</span><h3>Your team, your rules</h3><p>Roles, permissions and assignments for growing offices.</p></div><div><span class="vx-num">04</span><h3>Flexible resources</h3><p>Prepaid communication usage that scales with you.</p></div></div></div></section>

<section id="platform" class="vx-section"><div class="vx-wrap"><span class="vx-kicker">Everything around the return</span><h2 class="vx-h2">One system for the work your tax software doesn’t manage.</h2><p class="vx-sub">Verexa is not trying to replace your tax preparation software. It organizes the business around it so your team knows what needs to happen, who owns it and what comes next.</p><div class="vx-features">
<div class="vx-card"><div class="vx-icon">CRM</div><h3>Client CRM</h3><p>Keep every client, contact, note, status and activity record in one place.</p></div>
<div class="vx-card"><div class="vx-icon">↗</div><h3>Pipelines & workflows</h3><p>Build visual pipelines, triggers, actions, conditions, branches and automated follow-up.</p></div>
<div class="vx-card"><div class="vx-icon">▣</div><h3>Documents</h3><p>Collect, organize, request, share and track client documents without chasing email threads.</p></div>
<div class="vx-card"><div class="vx-icon">✓</div><h3>Forms & organizers</h3><p>Build public forms and client organizers with conditional logic and automatic routing.</p></div>
<div class="vx-card"><div class="vx-icon">✎</div><h3>Signatures & engagements</h3><p>Send engagement letters and documents for electronic signature and track what is still pending.</p></div>
<div class="vx-card"><div class="vx-icon">SMS</div><h3>Communications</h3><p>Keep email, SMS and communication history tied to the client record with prepaid usage.</p></div>
<div class="vx-card"><div class="vx-icon">♙</div><h3>Team management</h3><p>ERO workspaces add seats, roles, permissions, assignments, preparer profiles and team visibility.</p></div>
<div class="vx-card"><div class="vx-icon">▤</div><h3>Client portal</h3><p>Give clients one secure place to upload documents, complete organizers, sign and see what you need.</p></div>
<div class="vx-card"><div class="vx-icon">▥</div><h3>Reporting</h3><p>See pipeline activity, workload, outstanding work, workflow performance and team activity.</p></div>
</div></div></section>

<section id="how-it-works" class="vx-section vx-dark"><div class="vx-wrap"><span class="vx-kicker">How Verexa works</span><h2 class="vx-h2">From first contact to completed work.</h2><p class="vx-sub">Your client journey stays visible from intake through documents, preparation, review, signatures and completion.</p><div class="vx-steps"><div class="vx-step"><b>01 · CAPTURE</b><h3>Bring the lead in.</h3><p>New clients can enter through staff entry, your public form or a client organizer.</p></div><div class="vx-step"><b>02 · ORGANIZE</b><h3>Make the work visible.</h3><p>The client record, pipeline, document requests and tasks stay connected.</p></div><div class="vx-step"><b>03 · AUTOMATE</b><h3>Let workflows move it.</h3><p>Send messages, create tasks, branch on conditions and move work forward automatically.</p></div><div class="vx-step"><b>04 · COLLABORATE</b><h3>Put work with the right person.</h3><p>Assign clients and tasks to your team or connect an independent PTIN to share selected files.</p></div><div class="vx-step"><b>05 · REVIEW</b><h3>Know what is waiting.</h3><p>Keep signatures, missing documents, pending tasks and review work visible.</p></div><div class="vx-step"><b>06 · COMPLETE</b><h3>Finish with a history.</h3><p>Every completed workflow leaves a clear record of what happened and who handled it.</p></div></div></div></section>

<section class="vx-section"><div class="vx-wrap"><div class="vx-growth"><div><span class="vx-kicker">Built to grow with you</span><h2 class="vx-h2">One person today. A team tomorrow.</h2><p class="vx-sub">Verexa uses the same workspace foundation as your practice grows. Add people when you need them without turning every employee into a separate business workspace.</p><div class="vx-list"><div><i>✓</i><div><h4>Independent PTIN</h4><p>Your own workspace, one user, full core CRM and client operations.</p></div></div><div><i>✓</i><div><h4>ERO</h4><p>Your workspace plus team seats, roles, assignments, ERO profile, reporting and controlled PTIN connections.</p></div></div><div><i>✓</i><div><h4>Service Bureau</h4><p>Your workspace plus multi-ERO, multi-office and organization-level management.</p></div></div></div></div><div class="vx-structure"><span class="vx-kicker">Workspace structure</span><h3>Your account stays yours.</h3><div class="vx-rows"><div class="vx-row"><b>01</b><div><strong>Your login</strong><span>One person, one login</span></div></div><div class="vx-row"><b>02</b><div><strong>Your workspace</strong><span>Business data and resources</span></div></div><div class="vx-row"><b>03</b><div><strong>Your seats</strong><span>People working inside the workspace</span></div></div><div class="vx-row"><b>04</b><div><strong>Your permissions</strong><span>Access based on role</span></div></div><div class="vx-row"><b>05</b><div><strong>Your connections</strong><span>Controlled sharing between workspaces</span></div></div></div></div></div></div></section>

<section class="vx-section vx-ero"><div class="vx-wrap"><span class="vx-kicker">ERO workspace</span><h2 class="vx-h2">When you stop working alone, Verexa grows with you.</h2><p class="vx-sub">ERO workspaces add the organizational controls that independent preparers don’t need: people, permissions, assignments, team workflows, reporting and ERO-specific management.</p><div class="vx-ero-grid"><div class="vx-card"><div class="vx-icon">♙</div><h3>Team</h3><p>Invite users, manage roles, activate/deactivate accounts and control access.</p></div><div class="vx-card"><div class="vx-icon">↔</div><h3>Assignments</h3><p>Assign clients, tasks, reviews and workflow steps to the right person.</p></div><div class="vx-card"><div class="vx-icon">🔗</div><h3>Connections</h3><p>Connect independent PTINs and control exactly what is shared.</p></div><div class="vx-card"><div class="vx-icon">✓</div><h3>ERO Profile</h3><p>Keep firm, ERO and protected EFIN information in one controlled area.</p></div></div></div></section>
</div>$vxr102$) where id = '9068d5e4-85c5-4347-a332-5204fe52e316';

insert into public.site_page_sections (page_id, section_type, display_order, config) values ('b75cbf39-2ab3-4fef-822a-18b476338ffc', 'pricing_table', 2, '{"eyebrow": "Simple Pricing", "heading": "Choose the workspace that fits your practice.", "subheading": "Start small, add seats when you need them, and pay for variable communications as you use them."}'::jsonb);

insert into public.site_page_sections (page_id, section_type, display_order, config) values ('b75cbf39-2ab3-4fef-822a-18b476338ffc', 'custom_html', 3, jsonb_build_object('html', $vxr103$<div class="vx">
<section class="vx-section vx-alt"><div class="vx-wrap"><div class="vx-growth"><div><span class="vx-kicker">Security-minded architecture</span><h2 class="vx-h2">Separate workspaces. Clear permissions. Controlled sharing.</h2><p class="vx-sub">A person has a login. A business has a workspace. A seat is membership in a workspace. Connections between independent PTINs and EROs are controlled sharing relationships—not a back door into another business.</p></div><div class="vx-features" style="margin-top:0;grid-template-columns:1fr 1fr"><div class="vx-card"><div class="vx-icon">🔒</div><h3>Workspace isolation</h3><p>Business data stays inside its workspace.</p></div><div class="vx-card"><div class="vx-icon">✓</div><h3>Role-based access</h3><p>Users see only what their role permits.</p></div><div class="vx-card"><div class="vx-icon">▣</div><h3>Controlled documents</h3><p>Share specific items without opening the workspace.</p></div><div class="vx-card"><div class="vx-icon">☁</div><h3>Workspace resources</h3><p>Storage and communication balances belong to the workspace.</p></div></div></div></div></section>

<section id="faq" class="vx-section"><div class="vx-wrap"><div class="vx-price-head"><span class="vx-kicker">FAQ</span><h2 class="vx-h2">Questions, answered.</h2></div><div class="vx-faq"><details><summary>Is Verexa tax preparation software?</summary><p>No. Verexa is the business operating system around the tax return. Your tax preparation software handles the actual return and filing while Verexa manages clients, documents, organizers, workflows, communications and office operations.</p></details><details><summary>What is the difference between a PTIN and an ERO workspace?</summary><p>An Independent PTIN owns a one-user workspace. An ERO owns a workspace and can add users, assign clients and tasks, manage permissions, monitor team activity and connect with independent PTINs.</p></details><details><summary>Do seats get their own workspace?</summary><p>No. Every person gets their own login, but a seat operates inside the workspace owned by the main account holder. Seats share workspace resources and only see what their permissions allow.</p></details><details><summary>Can an Independent PTIN work with an ERO without giving up their workspace?</summary><p>Yes. The PTIN keeps their own login, workspace, clients, storage, communications and billing. They can selectively share files with the ERO without giving the ERO broad access to the PTIN workspace.</p></details><details><summary>How do email, SMS and phone usage work?</summary><p>Every plan includes a one-time free amount of email and SMS, granted the first time your workspace converts to a paid plan. Usage beyond that is billed at standard additional-usage rates -- see the <a href="/site/verexa-hq-crm/www/pricing" style="color:#0b7fe0;font-weight:700;">Pricing page</a> for the exact numbers.</p></details><details><summary>Do I get free usage during the trial?</summary><p>The 14-day trial gives you full access to explore Verexa, but trial workspaces don't include free communication or storage credits -- those begin once you convert to a paid plan.</p></details><details><summary>What happens when I add team members?</summary><p>Team and Firm plans include multiple seats out of the box, and you can add more at any time for a flat per-seat rate. Adding a seat never creates a separate workspace or a separate storage allocation -- see <a href="/site/verexa-hq-crm/www/pricing" style="color:#0b7fe0;font-weight:700;">Pricing</a> for current seat counts and rates.</p></details><details><summary>Does Verexa transmit tax returns to the IRS?</summary><p>No. Verexa is intentionally not responsible for IRS transmission. It organizes the business around the tax return while tax software and filing providers handle return preparation and submission.</p></details></div></div></section>

<section class="vx-cta"><div class="vx-wrap"><div class="vx-cta-box"><span class="vx-kicker">Ready when you are</span><h2>Your tax office deserves a system built around the way you actually work.</h2><p>Start with your own workspace. Add your team when you’re ready. Keep your clients, documents and workflows organized from one place.</p><div class="vx-actions" style="justify-content:center"><a class="vx-btn vx-white" href="/site/verexa-hq-crm/www/home#trial-form">Start 14-day trial →</a><a class="vx-btn" style="border:1px solid rgba(255,255,255,.25);color:#fff" href="/login">Log in to Verexa</a></div></div></div></section>

<footer class="vx-footer"><div class="vx-wrap vx-footer-inner"><div><p>Verexa is a business operating platform for tax professionals. It helps run the work around the return; it does not transmit tax returns to the IRS.</p><p>© 2026 Verexa. All rights reserved.</p></div><div class="vx-footer-links"><a href="#platform">Platform</a><a href="/site/verexa-hq-crm/www/pricing">Pricing</a><a href="#faq">FAQ</a><a href="/login">Log in</a><a href="/site/verexa-hq-crm/www/home#trial-form">Start trial</a></div></div></footer>
</div>

<div id="trial-form"></div>$vxr103$));

update public.site_page_sections set display_order = 4 where id = 'e747fbe7-ee92-4c08-a8ca-d987fc9994fb';

