const LOGO_URL = "https://assets.cdn.filesafe.space/DS8aGyVjpPT17utB06sE/media/68b4edce091480ccef401763.png";
const FOUNDER_URL = "https://assets.cdn.filesafe.space/DS8aGyVjpPT17utB06sE/media/69d7cfd89bcdf086d1dd99ba.jpeg";
const BOOKING_URL = "/book/mkb-financial-group-llc";

export function MkbHomePage() {
  return (
    <div className="mkb-page" id="top">
      <div className="mkb-announcement">
        <p>
          Louisiana-based <span aria-hidden="true">✦</span> Virtual support available
        </p>
        <a href="tel:+18333792230">
          Call 833-379-2230 <span aria-hidden="true">↗</span>
        </a>
      </div>

      <header className="mkb-header">
        <a className="mkb-brand" href="#top" aria-label="MKB Financial Group home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="MKB Financial Group" />
        </a>
        <nav className="mkb-desktop-nav" aria-label="Primary navigation">
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a href="#process">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="mkb-button mkb-button--gold mkb-header-cta" href={BOOKING_URL}>
          Book a consultation <span aria-hidden="true">↗</span>
        </a>
        <details className="mkb-mobile-menu">
          <summary aria-label="Open navigation">
            <span />
            <span />
          </summary>
          <nav aria-label="Mobile navigation">
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#process">How it works</a>
            <a href="#faq">FAQ</a>
            <a href={BOOKING_URL}>Book a consultation</a>
          </nav>
        </details>
      </header>

      <main>
        <section className="mkb-hero" aria-labelledby="mkb-hero-title">
          <div className="mkb-hero-media" aria-hidden="true" />
          <div className="mkb-hero-grid" aria-hidden="true" />
          <div className="mkb-hero-copy">
            <p className="mkb-kicker">Structure before stress.</p>
            <h1 id="mkb-hero-title">
              Build your business with <em>clarity.</em>
            </h1>
            <p className="mkb-hero-text">
              Bookkeeping, payroll, tax preparation, planning, and compliance support for business owners who are ready to stop guessing and move forward with confidence.
            </p>
            <div className="mkb-hero-actions">
              <a className="mkb-button mkb-button--gold" href={BOOKING_URL}>
                Book a consultation <span aria-hidden="true">↗</span>
              </a>
              <a className="mkb-text-link" href="#services">
                Explore our services <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <p className="mkb-hero-side-label">
            MKB Financial Group <span>— Lafayette, Louisiana</span>
          </p>
          <div className="mkb-hero-monogram" aria-hidden="true">MKB</div>
        </section>

        <section className="mkb-marquee" aria-label="MKB service highlights">
          <div className="mkb-marquee-track">
            <span>Business structure</span><b>✦</b><span>Bookkeeping</span><b>✦</b><span>Payroll</span><b>✦</b><span>Tax preparation</span><b>✦</b><span>Tax planning</span><b>✦</b><span>Compliance</span><b>✦</b>
            <span aria-hidden="true">Business structure</span><b aria-hidden="true">✦</b><span aria-hidden="true">Bookkeeping</span><b aria-hidden="true">✦</b><span aria-hidden="true">Payroll</span><b aria-hidden="true">✦</b><span aria-hidden="true">Tax preparation</span><b aria-hidden="true">✦</b><span aria-hidden="true">Tax planning</span><b aria-hidden="true">✦</b><span aria-hidden="true">Compliance</span><b aria-hidden="true">✦</b>
          </div>
        </section>

        <section className="mkb-intro">
          <div className="mkb-section-number" aria-hidden="true">01</div>
          <div className="mkb-intro-copy">
            <p className="mkb-kicker mkb-kicker--dark">What MKB does</p>
            <h2>Financial support for the business you’re <em>building.</em></h2>
          </div>
          <div className="mkb-intro-body">
            <p>MKB Financial Group helps entrepreneurs and small business owners start right, organize what feels messy, manage the numbers, and prepare before pressure hits.</p>
            <a className="mkb-arrow-link" href="#services">See how we can help <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="mkb-services" id="services" aria-labelledby="mkb-services-title">
          <div className="mkb-services-heading">
            <p className="mkb-kicker">Four ways forward</p>
            <h2 id="mkb-services-title">From first step to <em>next level.</em></h2>
          </div>
          <div className="mkb-service-list">
            <Service number="01" label="Start" title="Business structure">
              Formation guidance, EIN and startup organization support, compliance basics, and a clear first-step plan.
            </Service>
            <Service number="02" label="Organize" title="Bookkeeping & cleanup">
              Catch-up bookkeeping, record organization, account review, monthly support, and reports you can understand.
            </Service>
            <Service number="03" label="Manage" title="Payroll & money flow">
              Payroll support, payroll-tax organization, income and expense tracking, and better monthly financial systems.
            </Service>
            <Service number="04" label="Prepare" title="Tax preparation & planning">
              Individual and business filing, deduction review, estimated-tax guidance, and year-round tax readiness.
            </Service>
          </div>
          <div className="mkb-services-footer">
            <p>Not sure which service fits?</p>
            <a className="mkb-button mkb-button--light" href={BOOKING_URL}>Let’s find your next step <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="mkb-proof" aria-label="MKB support model">
          <article><strong>04</strong><span>Core support areas</span></article>
          <article><strong>12</strong><span>Months of guidance</span></article>
          <article><strong>01</strong><span>Clear service plan</span></article>
          <article><strong>LA+</strong><span>Local roots. Virtual reach.</span></article>
        </section>

        <section className="mkb-about" id="about" aria-labelledby="mkb-about-title">
          <div className="mkb-about-image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FOUNDER_URL} alt="Krystal Esters, owner and principal tax professional at MKB Financial Group" />
            <div className="mkb-about-caption"><span>Founder / Principal</span><strong>Krystal Esters</strong></div>
          </div>
          <div className="mkb-about-copy">
            <div className="mkb-section-number" aria-hidden="true">02</div>
            <p className="mkb-kicker mkb-kicker--dark">The person behind the firm</p>
            <h2 id="mkb-about-title">More than a one-time tax <em>service.</em></h2>
            <p className="mkb-about-lead">Krystal Esters built MKB for entrepreneurs and business owners who need practical guidance, real organization, and a financial foundation they can trust.</p>
            <p>Whether you are starting fresh, behind on your books, or preparing for tax season, MKB helps you understand what is missing, clean up what is disorganized, and move with a clearer plan.</p>
            <div className="mkb-credentials" aria-label="Professional credentials">
              <span>AFSP Participant</span><span>PTIN Registered</span><span>QuickBooks Certified ProAdvisor</span>
            </div>
            <blockquote>“We don’t just file paperwork. We help business owners get structured before problems show up.”</blockquote>
          </div>
        </section>

        <section className="mkb-audience" aria-labelledby="mkb-audience-title">
          <div className="mkb-audience-heading">
            <p className="mkb-kicker">Who we help</p>
            <h2 id="mkb-audience-title">Built for owners who are <em>done guessing.</em></h2>
          </div>
          <div className="mkb-audience-grid">
            <article><span>01</span><h3>Starting something</h3><p>New entrepreneurs who need formation, records, tax, and compliance direction from day one.</p></article>
            <article><span>02</span><h3>Cleaning it up</h3><p>Business owners whose books, payroll, or financial records need structure and a clear catch-up path.</p></article>
            <article><span>03</span><h3>Ready to grow</h3><p>Self-employed professionals and growing businesses preparing for better reporting, planning, and scale.</p></article>
          </div>
        </section>

        <section className="mkb-process" id="process" aria-labelledby="mkb-process-title">
          <div className="mkb-process-header">
            <div className="mkb-section-number" aria-hidden="true">03</div>
            <div><p className="mkb-kicker mkb-kicker--dark">How it works</p><h2 id="mkb-process-title">A clear path to getting your business <em>in order.</em></h2></div>
            <p>The process stays simple, so you know what is happening, why it matters, and what comes next.</p>
          </div>
          <div className="mkb-process-steps">
            <ProcessStep number="01" title="Book a consultation">Tell us where your business is now, what feels unclear, and what support you need.</ProcessStep>
            <ProcessStep number="02" title="Get a service plan">We identify the right next step—formation, cleanup, bookkeeping, payroll, taxes, or a combination.</ProcessStep>
            <ProcessStep number="03" title="Move with structure">You get organized, prepared, and supported so the financial side is no longer holding you back.</ProcessStep>
          </div>
          <a className="mkb-button mkb-button--dark" href={BOOKING_URL}>Start with a consultation <span aria-hidden="true">↗</span></a>
        </section>

        <section className="mkb-faq" id="faq" aria-labelledby="mkb-faq-title">
          <div className="mkb-faq-intro">
            <p className="mkb-kicker">Quick answers</p>
            <h2 id="mkb-faq-title">Questions?<br /><em>We’ve got answers.</em></h2>
            <p>Everything you need to know before taking the next step with MKB.</p>
            <a className="mkb-text-link" href="tel:+18333792230">Prefer to talk? Call 833-379-2230 <span aria-hidden="true">↗</span></a>
          </div>
          <div className="mkb-faq-list">
            <Faq question="Do you only help during tax season?" open>No. MKB supports clients throughout the year with bookkeeping, payroll organization, tax planning, tax preparation, business formation guidance, and compliance support.</Faq>
            <Faq question="My books are behind. Can you help?">Yes. Bookkeeping cleanup and catch-up support are part of how MKB helps business owners get organized before moving forward.</Faq>
            <Faq question="Do I need to know exactly which service I need?">No. Your consultation is designed to identify what is missing and determine which kind of support makes the most sense.</Faq>
            <Faq question="Do you work with new business owners?">Yes. MKB helps new entrepreneurs understand business setup, records, bookkeeping basics, tax responsibilities, and compliance.</Faq>
            <Faq question="Do you offer virtual support?">Yes. MKB is based in Lafayette, Louisiana and offers virtual support so clients can get organized from wherever they do business.</Faq>
          </div>
        </section>

        <section className="mkb-cta" aria-labelledby="mkb-cta-title">
          <p className="mkb-cta-label">Your next move starts here.</p>
          <h2 id="mkb-cta-title">Ready to get financially <em>organized?</em></h2>
          <p>Whether you are starting fresh, cleaning things up, managing payroll, or preparing for tax season, MKB can help you take the next right step.</p>
          <div className="mkb-cta-actions">
            <a className="mkb-button mkb-button--gold" href={BOOKING_URL}>Book a consultation <span aria-hidden="true">↗</span></a>
            <a className="mkb-text-link" href="mailto:info@mkbfinancialgroup.com">info@mkbfinancialgroup.com</a>
          </div>
        </section>
      </main>

      <footer className="mkb-footer">
        <div className="mkb-footer-main">
          <a className="mkb-footer-brand" href="#top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="MKB Financial Group" />
          </a>
          <p>Business structure, bookkeeping, payroll organization, tax preparation, tax planning, and compliance support for entrepreneurs and small business owners.</p>
          <div className="mkb-footer-social"><a href="https://www.instagram.com/mkbfinancialgroup/" target="_blank" rel="noreferrer">Instagram ↗</a></div>
        </div>
        <div className="mkb-footer-column"><h3>Navigate</h3><a href="#services">Services</a><a href="#about">About MKB</a><a href="#process">How it works</a><a href="#faq">FAQ</a></div>
        <div className="mkb-footer-column"><h3>Contact</h3><a href="tel:+18333792230">833-379-2230</a><a href="mailto:info@mkbfinancialgroup.com">info@mkbfinancialgroup.com</a><a href="https://www.google.com/maps/search/?api=1&query=5520+Johnston+St+PMB+1307+Ste+K+Lafayette+LA+70503" target="_blank" rel="noreferrer">5520 Johnston St, PMB 1307<br />Ste K, Lafayette, LA 70503 ↗</a></div>
        <div className="mkb-footer-column"><h3>Get started</h3><p>Not sure what your business needs yet? Begin with a clear conversation.</p><a className="mkb-arrow-link" href={BOOKING_URL}>Book a consultation <span aria-hidden="true">↗</span></a></div>
        <div className="mkb-footer-bottom"><span>© 2026 MKB Financial Group LLC</span><span>Tax preparation & business financial services. Not legal or investment advice.</span></div>
      </footer>
    </div>
  );
}

function Service({ number, label, title, children }: { number: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <article className="mkb-service-row">
      <span className="mkb-service-index">{number}</span>
      <div><p className="mkb-service-label">{label}</p><h3>{title}</h3></div>
      <p>{children}</p>
      <span className="mkb-service-arrow" aria-hidden="true">↗</span>
    </article>
  );
}

function ProcessStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <article><span>{number}</span><h3>{title}</h3><p>{children}</p></article>;
}

function Faq({ question, children, open = false }: { question: string; children: React.ReactNode; open?: boolean }) {
  return <details open={open}><summary>{question}<span aria-hidden="true">+</span></summary><p>{children}</p></details>;
}
