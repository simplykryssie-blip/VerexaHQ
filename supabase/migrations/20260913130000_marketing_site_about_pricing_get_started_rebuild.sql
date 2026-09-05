-- Rebuilds Verexa's own marketing site (About, Pricing, Get Started) with real,
-- specific copy and the same larger-type design language already established on
-- the Home page, replacing the earlier thin/small-print draft. Also republishes
-- all three pages -- they (and Home) were deliberately archived on 2026-08-25
-- while this rewrite was pending; Home itself already meets the bar and is left
-- untouched. Pricing now reflects the live platform_subscription_plans rows
-- (Solo/Team/Firm), not the retired Independent-PTIN/ERO/Service-Bureau tiers.

-- about -------------------------------------------------------------------
delete from public.site_page_sections where page_id = 'c09b545b-8445-413f-81bc-1292abd93e40';

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'custom_html', 1, jsonb_build_object('html', $vx1$<style>
@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
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
.vx-card{border:1px solid #e2e8f0;background:#fff;border-radius:22px;padding:28px;box-shadow:0 10px 35px rgba(15,40,80,.05)}
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
.vx-step.light{background:#fff;border:1px solid #e2e8f0}
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
.vx-faq{max-width:850px;margin:44px auto 0;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;background:#fff}
.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 22px}
.vx-faq details:last-child{border-bottom:0}
.vx-faq summary{cursor:pointer;list-style:none;padding:22px 0;font-size:16px;font-weight:800;display:flex;justify-content:space-between;gap:20px;color:#0c1f3f}
.vx-faq summary::-webkit-details-marker{display:none}
.vx-faq summary:after{content:'+';color:#94a3b8;font-size:20px}
.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}
.vx-faq p{font-size:15px;line-height:1.8;color:#4b5f7a;margin:0 0 22px}
.vx-terms{border:1px solid #e2e8f0;background:#f8fafc;border-radius:20px;padding:26px 28px;margin-top:36px}
.vx-terms h4{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0c1f3f;margin:0 0 12px}
.vx-terms p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 8px}
.vx-terms p:last-child{margin-bottom:0}
.vx-toggle{display:inline-flex;align-items:center;gap:0;background:#e8f3fe;border-radius:999px;padding:5px;margin-top:28px}
.vx-toggle button{border:none;background:transparent;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:800;color:#4b5f7a;cursor:pointer}
.vx-toggle button.active{background:#0c1f3f;color:#fff}
.vx-toggle .save{margin-left:8px;font-size:11px;font-weight:800;color:#0a8a3f;background:#e3f9ec;padding:4px 8px;border-radius:999px}
.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.vx-price{border:1px solid #e2e8f0;border-radius:26px;padding:30px;background:#fff;display:flex;flex-direction:column}
.vx-price.featured{background:#0c1f3f;color:#fff;border-color:#0b7fe0;box-shadow:0 25px 70px rgba(12,31,63,.2)}
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
.vx-fine div{border:1px solid #e2e8f0;border-radius:16px;padding:16px;background:#fff}
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
}

</style>
<div class="vx">
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
</div>$vx1$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'custom_html', 2, jsonb_build_object('html', $vx2$<section class="vx-section">
<div class="vx-wrap vx-grid2">
<div>
<span class="vx-kicker">Why Verexa Exists</span>
<h2 class="vx-h2">Your Tax Software Handles The Return. Nothing Handled The Rest.</h2>
<p class="vx-sub">Preparing the return was never the hard part. The hard part was everything around it -- the spreadsheet of who still owes documents, the email thread with three attachments and no answer, the sticky note about a callback that never happened. Verexa was built to be that missing layer: the place where clients, documents, deadlines, and your team all live in one connected system.</p>
</div>
<div class="vx-list">
<div><i>1</i><div><h4>One login, one workspace</h4><p>Every client, document, task, and message tied to a single source of truth -- not scattered across inboxes and spreadsheets.</p></div></div>
<div><i>2</i><div><h4>Automation instead of memory</h4><p>Workflows move clients forward, send reminders, and create tasks automatically, so nothing depends on someone remembering to follow up.</p></div></div>
<div><i>3</i><div><h4>Room to grow</h4><p>Start as a solo preparer and add your team when you're ready, without re-platforming or starting over.</p></div></div>
</div>
</div>
</section>$vx2$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'custom_html', 3, jsonb_build_object('html', $vx3$<section class="vx-section alt vx-bleed">
<div class="vx-wrap vx-center" style="max-width:680px;">
<span class="vx-kicker">What We Believe</span>
<h2 class="vx-h2">A Few Things We Won't Compromise On.</h2>
</div>
<div class="vx-grid3">
<div class="vx-card"><div class="vx-icon">1</div><h3>One system, not five</h3><p>Clients, documents, workflows, and communication belong together -- not spread across a CRM, a file drive, a texting app, and a spreadsheet.</p></div>
<div class="vx-card"><div class="vx-icon">2</div><h3>Automation earns its keep</h3><p>If a step can happen without a person remembering to do it, it should. Your team's time belongs on client work, not busywork.</p></div>
<div class="vx-card"><div class="vx-icon">3</div><h3>Your workspace stays yours</h3><p>Business data stays inside your workspace. Sharing with a connected firm is a deliberate choice you control -- never a back door.</p></div>
</div>
</section>$vx3$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'custom_html', 4, jsonb_build_object('html', $vx4$<section class="vx-section tight vx-bleed">
<div class="vx-wrap">
<div class="vx-cta-box">
<span class="vx-kicker">Ready When You Are</span>
<h2>See what a real system built for tax offices feels like.</h2>
<p>No credit card judgment, no sales pressure -- just a 14-day trial and a team that will actually help you get set up.</p>
<div class="vx-actions center">
<a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-white">Start Your Free Trial</a>
<a href="/site/verexa-hq-crm/www/pricing" class="vx-btn vx-ghost-dark">See Pricing</a>
</div>
</div>
</div>
</section>$vx4$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'custom_html', 5, jsonb_build_object('html', $vx5$<section class="vx-section tight" style="padding-bottom:0;">
<div class="vx-wrap vx-center" style="max-width:620px;">
<span class="vx-kicker">Get In Touch</span>
<h2 class="vx-h2">Have A Question We Didn't Answer?</h2>
<p class="vx-sub vx-center" style="margin-left:auto;margin-right:auto;">Send us a note below. A real person on the Verexa team will get back to you -- not a support queue.</p>
</div>
</section>$vx5$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'organizer_form', 6, '{"template_id": "6c6ee600-9b6b-467a-ae0c-2e1ff68a5d4a", "public_token": "6399a195-9df6-4530-be4c-1255b5455241", "template_name": "Get in Touch", "on_submit": {"action": "inline_thank_you", "thank_you_heading": "Thanks for reaching out!", "thank_you_body": "A Verexa team member will get back to you shortly."}}'::jsonb);

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('c09b545b-8445-413f-81bc-1292abd93e40', 'custom_html', 7, jsonb_build_object('html', $vx6$<footer class="vx vx-footer vx-bleed">
<div class="vx-wrap vx-footer-inner">
<div><p>Verexa is a business operating platform for tax professionals. It helps run the work around the return; it does not transmit tax returns to the IRS.</p><p style="margin-top:6px;">&copy; 2026 Verexa. All rights reserved.</p></div>
<div class="vx-footer-links"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing">Pricing</a><a href="/site/verexa-hq-crm/www/about">About</a><a href="/login">Log in</a><a href="/site/verexa-hq-crm/www/get-started">Start trial</a></div>
</div>
</footer>$vx6$));

update public.site_pages set status = 'published', meta_description = 'Verexa is a business operating system built for tax and accounting firms -- one workspace for clients, documents, workflows, and your team.' where id = 'c09b545b-8445-413f-81bc-1292abd93e40';

-- pricing -------------------------------------------------------------------
delete from public.site_page_sections where page_id = 'eb34e3e1-c86c-43c1-a47c-bd176f401f31';

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 1, jsonb_build_object('html', $vx7$<style>
@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
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
.vx-card{border:1px solid #e2e8f0;background:#fff;border-radius:22px;padding:28px;box-shadow:0 10px 35px rgba(15,40,80,.05)}
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
.vx-step.light{background:#fff;border:1px solid #e2e8f0}
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
.vx-faq{max-width:850px;margin:44px auto 0;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;background:#fff}
.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 22px}
.vx-faq details:last-child{border-bottom:0}
.vx-faq summary{cursor:pointer;list-style:none;padding:22px 0;font-size:16px;font-weight:800;display:flex;justify-content:space-between;gap:20px;color:#0c1f3f}
.vx-faq summary::-webkit-details-marker{display:none}
.vx-faq summary:after{content:'+';color:#94a3b8;font-size:20px}
.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}
.vx-faq p{font-size:15px;line-height:1.8;color:#4b5f7a;margin:0 0 22px}
.vx-terms{border:1px solid #e2e8f0;background:#f8fafc;border-radius:20px;padding:26px 28px;margin-top:36px}
.vx-terms h4{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0c1f3f;margin:0 0 12px}
.vx-terms p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 8px}
.vx-terms p:last-child{margin-bottom:0}
.vx-toggle{display:inline-flex;align-items:center;gap:0;background:#e8f3fe;border-radius:999px;padding:5px;margin-top:28px}
.vx-toggle button{border:none;background:transparent;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:800;color:#4b5f7a;cursor:pointer}
.vx-toggle button.active{background:#0c1f3f;color:#fff}
.vx-toggle .save{margin-left:8px;font-size:11px;font-weight:800;color:#0a8a3f;background:#e3f9ec;padding:4px 8px;border-radius:999px}
.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.vx-price{border:1px solid #e2e8f0;border-radius:26px;padding:30px;background:#fff;display:flex;flex-direction:column}
.vx-price.featured{background:#0c1f3f;color:#fff;border-color:#0b7fe0;box-shadow:0 25px 70px rgba(12,31,63,.2)}
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
.vx-fine div{border:1px solid #e2e8f0;border-radius:16px;padding:16px;background:#fff}
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
}

</style>
<div class="vx">
<div class="vx-navstrip vx-bleed"><div class="vx-wrap"><div class="vx-navlinks"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing" class="current">Pricing</a><a href="/site/verexa-hq-crm/www/about">About</a></div><a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-primary" style="padding:11px 20px;font-size:13px;">Start Free Trial</a></div></div>

<section class="vx-section tight">
<div class="vx-wrap vx-center" style="max-width:700px;">
<span class="vx-kicker">Pricing</span>
<h1 class="vx-h1">Straightforward Pricing For Firms At Every Stage.</h1>
<p class="vx-lead vx-center" style="margin-left:auto;margin-right:auto;">Every plan includes the full Verexa platform. The only difference is how many seats and how much room your firm needs. Try any plan free for 14 days.</p>
</div>
</section>
</div>$vx7$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 2, jsonb_build_object('html', $vx8$<section class="vx-section tight" style="padding-top:0;">
<div class="vx-wrap">
<div class="vx-center">
<div class="vx-toggle" id="vx-billing-toggle">
<button type="button" class="active" data-cycle="monthly">Billed Monthly</button>
<button type="button" data-cycle="annual">Billed Annually <span class="save">2 months free</span></button>
</div>
</div>

<div class="vx-prices" id="vx-prices">
<div class="vx-price">
<small>SOLO</small>
<div class="vx-cost"><span class="amt-monthly">$99.99</span><span class="amt-annual" style="display:none;">$999.90</span> <span class="per-monthly">/month</span><span class="per-annual" style="display:none;">/year</span></div>
<p class="vx-cost-note per-annual" style="display:none;">Equal to $83.33/month, billed once a year</p>
<p class="desc">For a single preparer running their own book of clients.</p>
<ul>
<li>1 included seat</li>
<li>5 GB storage after conversion</li>
<li>1,000 free emails + 100 free SMS after conversion</li>
<li>+$39/month per additional seat</li>
</ul>
<a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-primary" style="margin-top:8px;">Start 14-Day Trial</a>
</div>

<div class="vx-price featured">
<small>TEAM &middot; MOST POPULAR</small>
<div class="vx-cost"><span class="amt-monthly">$199</span><span class="amt-annual" style="display:none;">$1,990</span> <span class="per-monthly">/month</span><span class="per-annual" style="display:none;">/year</span></div>
<p class="vx-cost-note per-annual" style="display:none;">Equal to $165.83/month, billed once a year</p>
<p class="desc">For a growing office with a small team sharing the workload.</p>
<ul>
<li>3 included seats</li>
<li>20 GB storage after conversion</li>
<li>3,000 free emails + 300 free SMS after conversion</li>
<li>+$39/month per additional seat</li>
</ul>
<a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-white" style="margin-top:8px;">Start 14-Day Trial</a>
</div>

<div class="vx-price">
<small>FIRM</small>
<div class="vx-cost"><span class="amt-monthly">$299.99</span><span class="amt-annual" style="display:none;">$2,999.90</span> <span class="per-monthly">/month</span><span class="per-annual" style="display:none;">/year</span></div>
<p class="vx-cost-note per-annual" style="display:none;">Equal to $249.99/month, billed once a year</p>
<p class="desc">For multi-preparer firms and offices managing several teams.</p>
<ul>
<li>6 included seats</li>
<li>50 GB storage after conversion</li>
<li>7,500 free emails + 750 free SMS after conversion</li>
<li>+$25/month per additional seat</li>
</ul>
<a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-primary" style="margin-top:8px;">Start 14-Day Trial</a>
</div>
</div>

<p class="vx-center" style="margin-top:20px;font-size:13px;color:#94a3b8;max-width:640px;margin-left:auto;margin-right:auto;">Every plan includes the same platform: client CRM, pipelines &amp; workflows, documents &amp; organizers, e-signatures, client portal, communications, and reporting. Team and Firm add the extra seats a multi-person office needs.</p>
</div>
</section>
<script>
(function(){
var toggle=document.getElementById('vx-billing-toggle');
var prices=document.getElementById('vx-prices');
if(!toggle||!prices)return;
toggle.addEventListener('click',function(e){
var btn=e.target.closest('button[data-cycle]');
if(!btn)return;
var cycle=btn.getAttribute('data-cycle');
toggle.querySelectorAll('button').forEach(function(b){b.classList.toggle('active',b===btn);});
var showAnnual=cycle==='annual';
prices.querySelectorAll('.amt-monthly,.per-monthly').forEach(function(el){el.style.display=showAnnual?'none':'';});
prices.querySelectorAll('.amt-annual,.per-annual,.vx-cost-note').forEach(function(el){el.style.display=showAnnual?'':'none';});
});
})();
</script>$vx8$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 3, jsonb_build_object('html', $vx9$<section class="vx-section tight alt vx-bleed">
<div class="vx-wrap">
<div class="vx-center" style="max-width:600px;">
<span class="vx-kicker">Usage Rates</span>
<h2 class="vx-h2">The Same Rates, On Every Plan.</h2>
</div>
<div class="vx-fine">
<div><strong>$0.02</strong><span>per email, over your included amount</span></div>
<div><strong>$0.04</strong><span>per SMS segment, over your included amount</span></div>
<div><strong>$0.15</strong><span>per GB of storage, over your included amount</span></div>
<div><strong>14 Days</strong><span>free trial on every plan</span></div>
</div>
</div>
</section>$vx9$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 4, jsonb_build_object('html', $vx10$<section class="vx-section tight" style="padding-bottom:0;">
<div class="vx-wrap" style="max-width:850px;">
<div class="vx-terms">
<h4>Trial &amp; Billing Terms</h4>
<p>A valid credit card is required to activate your 14-day free trial. Trial workspaces do not include free email, SMS, or storage credits -- those start once your workspace converts to a paid plan.</p>
<p>Billed annually, each plan costs 10 months' price for a full 12 months of service, calculated from your workspace's signup date.</p>
<p>All charges are final. Verexa does not offer refunds, credits, or balance transfers for any plan, add-on, or trial.</p>
</div>
</div>
</section>$vx10$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 5, jsonb_build_object('html', $vx11$<section class="vx-section">
<div class="vx-wrap">
<div class="vx-center" style="max-width:600px;">
<span class="vx-kicker">FAQ</span>
<h2 class="vx-h2">Pricing Questions, Answered.</h2>
</div>
<div class="vx-faq">
<details><summary>What do I get during the free trial?</summary><p>Full access to the plan you sign up for, for 14 days. A valid card is required to activate the trial, but trial workspaces don't include free communication or storage credits -- those begin once you convert to a paid plan.</p></details>
<details><summary>Can I switch plans later?</summary><p>Yes. Move between Solo, Team, and Firm as your practice grows -- you're never locked into the plan you started on.</p></details>
<details><summary>What happens if I go over my included seats, storage, or communications?</summary><p>Extra seats, storage, email, and SMS are billed at the usage rates above. You won't be blocked from working -- overages are simply added to your account.</p></details>
<details><summary>Do you offer refunds?</summary><p>No. All charges are final, and unused time or credits don't transfer between plans or billing periods.</p></details>
<details><summary>Is Verexa tax preparation software?</summary><p>No. Verexa is the business operating system around the tax return. Your tax preparation software handles the actual return and filing; Verexa manages clients, documents, organizers, workflows, communications, and office operations.</p></details>
</div>
</div>
</section>$vx11$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 6, jsonb_build_object('html', $vx12$<section class="vx-section tight vx-bleed" style="padding-top:0;">
<div class="vx-wrap">
<div class="vx-cta-box">
<span class="vx-kicker">Every Firm Is Different</span>
<h2>Not sure which plan fits? Just start the trial.</h2>
<p>You can explore the full platform for 14 days and decide once you've seen it running your own clients.</p>
<div class="vx-actions center">
<a href="/site/verexa-hq-crm/www/get-started" class="vx-btn vx-white">Start Your Free Trial</a>
<a href="/site/verexa-hq-crm/www/about" class="vx-btn vx-ghost-dark">Talk To Us</a>
</div>
</div>
</div>
</section>$vx12$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('eb34e3e1-c86c-43c1-a47c-bd176f401f31', 'custom_html', 7, jsonb_build_object('html', $vx13$<footer class="vx vx-footer vx-bleed">
<div class="vx-wrap vx-footer-inner">
<div><p>Verexa is a business operating platform for tax professionals. It helps run the work around the return; it does not transmit tax returns to the IRS.</p><p style="margin-top:6px;">&copy; 2026 Verexa. All rights reserved.</p></div>
<div class="vx-footer-links"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing">Pricing</a><a href="/site/verexa-hq-crm/www/about">About</a><a href="/login">Log in</a><a href="/site/verexa-hq-crm/www/get-started">Start trial</a></div>
</div>
</footer>$vx13$));

update public.site_pages set status = 'published', meta_description = 'Simple, transparent pricing for firms of any size. Solo, Team, and Firm plans, all with a 14-day free trial.' where id = 'eb34e3e1-c86c-43c1-a47c-bd176f401f31';

-- get-started -------------------------------------------------------------------
delete from public.site_page_sections where page_id = 'd4f5c664-2584-4fe8-82e0-42e44db52de2';

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('d4f5c664-2584-4fe8-82e0-42e44db52de2', 'custom_html', 1, jsonb_build_object('html', $vx14$<style>
@import url('https://fonts.googleapis.com/css2?family=Piazzolla:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
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
.vx-card{border:1px solid #e2e8f0;background:#fff;border-radius:22px;padding:28px;box-shadow:0 10px 35px rgba(15,40,80,.05)}
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
.vx-step.light{background:#fff;border:1px solid #e2e8f0}
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
.vx-faq{max-width:850px;margin:44px auto 0;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;background:#fff}
.vx-faq details{border-bottom:1px solid #eef2f7;padding:0 22px}
.vx-faq details:last-child{border-bottom:0}
.vx-faq summary{cursor:pointer;list-style:none;padding:22px 0;font-size:16px;font-weight:800;display:flex;justify-content:space-between;gap:20px;color:#0c1f3f}
.vx-faq summary::-webkit-details-marker{display:none}
.vx-faq summary:after{content:'+';color:#94a3b8;font-size:20px}
.vx-faq details[open] summary:after{content:'−';color:#0b7fe0}
.vx-faq p{font-size:15px;line-height:1.8;color:#4b5f7a;margin:0 0 22px}
.vx-terms{border:1px solid #e2e8f0;background:#f8fafc;border-radius:20px;padding:26px 28px;margin-top:36px}
.vx-terms h4{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0c1f3f;margin:0 0 12px}
.vx-terms p{font-size:14px;line-height:1.75;color:#64748b;margin:0 0 8px}
.vx-terms p:last-child{margin-bottom:0}
.vx-toggle{display:inline-flex;align-items:center;gap:0;background:#e8f3fe;border-radius:999px;padding:5px;margin-top:28px}
.vx-toggle button{border:none;background:transparent;padding:10px 22px;border-radius:999px;font-size:14px;font-weight:800;color:#4b5f7a;cursor:pointer}
.vx-toggle button.active{background:#0c1f3f;color:#fff}
.vx-toggle .save{margin-left:8px;font-size:11px;font-weight:800;color:#0a8a3f;background:#e3f9ec;padding:4px 8px;border-radius:999px}
.vx-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.vx-price{border:1px solid #e2e8f0;border-radius:26px;padding:30px;background:#fff;display:flex;flex-direction:column}
.vx-price.featured{background:#0c1f3f;color:#fff;border-color:#0b7fe0;box-shadow:0 25px 70px rgba(12,31,63,.2)}
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
.vx-fine div{border:1px solid #e2e8f0;border-radius:16px;padding:16px;background:#fff}
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
}

</style>
<div class="vx">
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
</div>$vx14$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('d4f5c664-2584-4fe8-82e0-42e44db52de2', 'organizer_form', 2, '{"template_id": "e283aba8-4f47-421e-bb7d-db5088569017", "public_token": "ae5d3caf-7564-46f5-bb5f-3b22a5c1038e", "template_name": "Start Your Free Trial", "on_submit": {"action": "inline_thank_you", "thank_you_heading": "You''re In!", "thank_you_body": "A Verexa team member will reach out shortly to help you get set up. Keep an eye on your inbox."}}'::jsonb);

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('d4f5c664-2584-4fe8-82e0-42e44db52de2', 'custom_html', 3, jsonb_build_object('html', $vx15$<section class="vx-section alt vx-bleed">
<div class="vx-wrap">
<div class="vx-center" style="max-width:600px;">
<span class="vx-kicker">What Happens Next</span>
<h2 class="vx-h2">From This Form To A Working Trial.</h2>
</div>
<div class="vx-steps">
<div class="vx-step light"><b>01 &middot; SUBMIT</b><h3>Tell us about your firm</h3><p>Use the form above to share your name, email, and firm name.</p></div>
<div class="vx-step light"><b>02 &middot; WE REACH OUT</b><h3>We activate your trial</h3><p>A Verexa team member contacts you to confirm your plan and billing details, then activates your 14-day trial.</p></div>
<div class="vx-step light"><b>03 &middot; GET TO WORK</b><h3>Your workspace is ready</h3><p>Start moving real clients through Verexa -- documents, workflows, and all.</p></div>
</div>
</div>
</section>$vx15$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('d4f5c664-2584-4fe8-82e0-42e44db52de2', 'custom_html', 4, jsonb_build_object('html', $vx16$<section class="vx-section tight" style="padding-bottom:56px;">
<div class="vx-wrap" style="max-width:850px;">
<div class="vx-terms">
<h4>Trial Terms</h4>
<p>A valid credit card is required to activate your 14-day free trial. Trial workspaces do not include free email, SMS, or storage credits -- those start once your workspace converts to a paid plan.</p>
<p>All charges are final. Verexa does not offer refunds, credits, or balance transfers for any plan, add-on, or trial.</p>
<p>Want the full pricing breakdown first? <a href="/site/verexa-hq-crm/www/pricing" style="color:#0b7fe0;font-weight:700;">See all plans &rarr;</a></p>
</div>
</div>
</section>$vx16$));

insert into public.site_page_sections (page_id, section_type, display_order, config)
values ('d4f5c664-2584-4fe8-82e0-42e44db52de2', 'custom_html', 5, jsonb_build_object('html', $vx17$<footer class="vx vx-footer vx-bleed">
<div class="vx-wrap vx-footer-inner">
<div><p>Verexa is a business operating platform for tax professionals. It helps run the work around the return; it does not transmit tax returns to the IRS.</p><p style="margin-top:6px;">&copy; 2026 Verexa. All rights reserved.</p></div>
<div class="vx-footer-links"><a href="/site/verexa-hq-crm/www/home">Home</a><a href="/site/verexa-hq-crm/www/pricing">Pricing</a><a href="/site/verexa-hq-crm/www/about">About</a><a href="/login">Log in</a></div>
</div>
</footer>$vx17$));

update public.site_pages set status = 'published', meta_description = 'Start your free 14-day Verexa trial. Tell us about your firm and a real person will help you get set up.' where id = 'd4f5c664-2584-4fe8-82e0-42e44db52de2';

