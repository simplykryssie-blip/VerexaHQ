-- Comprehensive, reusable organizer library. Known client identity/contact fields are
-- mapped for prefill; financial answers intentionally remain unmapped and blank.

do $$
declare
  template jsonb;
  section jsonb;
  question jsonb;
  template_id uuid;
  section_id uuid;
begin
  for template in select value from jsonb_array_elements($library$
  [
    {"name":"Comprehensive Individual Income Tax Organizer","type":"1040","sections":[
      {"title":"Taxpayer Profile","description":"Confirm the household information already on file.","questions":[
        {"q":"Taxpayer first name","t":"text","m":"first_name","r":true},{"q":"Taxpayer last name","t":"text","m":"last_name","r":true},{"q":"Email address","t":"text","m":"email"},{"q":"Phone number","t":"text","m":"phone"},{"q":"Current mailing address","t":"text","m":"address"},{"q":"City","t":"text","m":"city"},{"q":"State","t":"text","m":"state"},{"q":"ZIP code","t":"text","m":"zip_code"},{"q":"Date of birth","t":"date","m":"date_of_birth"},{"q":"Last four digits of SSN","t":"text","m":"ssn_last_four"}]},
      {"title":"Filing Status and Household","questions":[
        {"q":"Expected filing status","t":"select","o":["Single","Married filing jointly","Married filing separately","Head of household","Qualifying surviving spouse"],"r":true},{"q":"Did your marital status change during the year?","t":"boolean"},{"q":"Spouse full name, date of birth, and last four SSN","t":"textarea"},{"q":"List every dependent: name, relationship, birth date, months in home, and last four SSN","t":"textarea"},{"q":"Did anyone else qualify to claim you, your spouse, or a dependent?","t":"boolean"},{"q":"Did you pay childcare or dependent-care expenses?","t":"boolean"}]},
      {"title":"Income","questions":[
        {"q":"Select every income type received","t":"multiselect","o":["W-2 wages","Interest","Dividends","Brokerage sales","Retirement distributions","Social Security","Self-employment","Rental real estate","K-1 income","Unemployment","State tax refund","Alimony","Digital assets","Foreign income","Other income"]},{"q":"Upload all W-2, 1099, K-1, SSA-1099, and brokerage statements","t":"file"},{"q":"Cash or income received without a tax form","t":"currency"},{"q":"Describe other or foreign income and its source","t":"textarea"},{"q":"Did you buy, sell, exchange, gift, or receive digital assets?","t":"boolean"}]},
      {"title":"Business and Rental Activity","questions":[
        {"q":"Did you operate a sole proprietorship or gig business?","t":"boolean"},{"q":"Business name, activity, EIN, and accounting method","t":"textarea"},{"q":"Gross business receipts","t":"currency"},{"q":"Business expense totals by category","t":"textarea","h":"Advertising, vehicle, contract labor, insurance, legal, office, supplies, travel, meals, utilities, and other."},{"q":"Did you own rental property? Provide addresses, use dates, income, expenses, and improvements","t":"textarea"},{"q":"Upload mileage logs, asset purchases, and rental statements","t":"file"}]},
      {"title":"Adjustments, Deductions, and Credits","questions":[
        {"q":"Select applicable items","t":"multiselect","o":["IRA/HSA contributions","Student loan interest","Educator expenses","Self-employed health insurance","Estimated tax payments","Mortgage interest","Property taxes","Charitable gifts","Medical expenses","Energy improvements","Education expenses","Adoption","EV purchase"]},{"q":"Estimated federal tax payments","t":"currency"},{"q":"Estimated state/local tax payments","t":"currency"},{"q":"Upload deduction and credit support","t":"file"},{"q":"Describe major life changes that may affect the return","t":"textarea"}]},
      {"title":"Health, Foreign, and Compliance","questions":[
        {"q":"Did anyone receive Marketplace health insurance (Form 1095-A)?","t":"boolean"},{"q":"Did you have a financial interest in or authority over a foreign account?","t":"boolean"},{"q":"Highest combined foreign account balance","t":"currency"},{"q":"Did you receive, own, or transfer an interest in a foreign entity or trust?","t":"boolean"},{"q":"Did you make gifts above the annual exclusion or receive a large foreign gift?","t":"boolean"},{"q":"Notices, amended returns, identity PINs, or carryforwards to report","t":"textarea"}]},
      {"title":"Banking and Final Review","questions":[
        {"q":"Refund delivery preference","t":"select","o":["Direct deposit","Paper check","Apply to next year"]},{"q":"Bank name and account type","t":"text"},{"q":"Routing number","t":"text"},{"q":"Account number","t":"text"},{"q":"Anything else your preparer should know?","t":"textarea"},{"q":"I confirm the information is complete to the best of my knowledge","t":"boolean","r":true}]}]},

    {"name":"S Corporation Tax Organizer","type":"1120S","sections":[
      {"title":"Entity Profile","questions":[{"q":"Legal business name","t":"text","m":"business_name","r":true},{"q":"Primary contact email","t":"text","m":"email"},{"q":"Primary contact phone","t":"text","m":"phone"},{"q":"Business address","t":"text","m":"address"},{"q":"EIN, state formed, and election effective date","t":"textarea","r":true}]},
      {"title":"Ownership and Governance","questions":[{"q":"List shareholders, SSN/EIN, address, ownership percentage, and acquisition dates","t":"textarea","r":true},{"q":"Were shares issued, transferred, redeemed, or sold?","t":"boolean"},{"q":"Were shareholder loans made or repaid? Provide beginning, additions, repayments, interest, and ending balance","t":"textarea"},{"q":"Were distributions made to shareholders?","t":"currency"},{"q":"Upload formation, election, ownership, and loan documents","t":"file"}]},
      {"title":"Financial Statements","questions":[{"q":"Gross receipts or sales","t":"currency"},{"q":"Returns and allowances","t":"currency"},{"q":"Cost of goods sold and ending inventory","t":"textarea"},{"q":"Expense totals by general-ledger category","t":"textarea"},{"q":"Upload year-end profit and loss, comparative balance sheet, general ledger, and trial balance","t":"file","r":true}]},
      {"title":"Payroll, Assets, and Tax Items","questions":[{"q":"Officer compensation by officer","t":"textarea"},{"q":"Total wages and payroll tax returns filed","t":"textarea"},{"q":"Assets purchased, sold, traded, or disposed of","t":"textarea"},{"q":"Meals, charitable contributions, tax-exempt income, nondeductible expenses, and separately stated items","t":"textarea"},{"q":"Estimated tax payments, notices, prior-year carryforwards, and state filings","t":"textarea"}]},
      {"title":"Final Review","questions":[{"q":"Accounting method","t":"select","o":["Cash","Accrual","Other"]},{"q":"Did the business operate in additional states or countries?","t":"boolean"},{"q":"Did the business hold foreign accounts, digital assets, or ownership in another entity?","t":"boolean"},{"q":"Explain significant changes, unusual transactions, or open questions","t":"textarea"},{"q":"I confirm the information is complete","t":"boolean","r":true}]}]},

    {"name":"Partnership Tax Organizer","type":"1065","sections":[
      {"title":"Entity Profile","questions":[{"q":"Legal partnership name","t":"text","m":"business_name","r":true},{"q":"Primary contact email","t":"text","m":"email"},{"q":"Primary contact phone","t":"text","m":"phone"},{"q":"Business address","t":"text","m":"address"},{"q":"EIN, formation state, activity, and accounting method","t":"textarea","r":true}]},
      {"title":"Partners and Capital","questions":[{"q":"List partners with tax ID, address, entity type, profit/loss/capital percentages, and dates","t":"textarea","r":true},{"q":"Partner contributions and distributions by partner","t":"textarea"},{"q":"Partner loans and debt allocations, including recourse/nonrecourse/qualified nonrecourse","t":"textarea"},{"q":"Were interests admitted, transferred, sold, or redeemed?","t":"boolean"},{"q":"Upload partnership agreement and ownership changes","t":"file"}]},
      {"title":"Financial and Tax Data","questions":[{"q":"Gross receipts","t":"currency"},{"q":"Cost of goods sold and inventory detail","t":"textarea"},{"q":"Expense totals by category","t":"textarea"},{"q":"Guaranteed payments by partner","t":"textarea"},{"q":"Upload profit and loss, comparative balance sheet, general ledger, trial balance, and fixed asset detail","t":"file","r":true}]},
      {"title":"Special Allocations and Compliance","questions":[{"q":"Describe special allocations, 704(c) property, 754 elections, and basis adjustments","t":"textarea"},{"q":"Separately stated income, deductions, credits, foreign items, and tax-exempt income","t":"textarea"},{"q":"Related-party transactions or payments to foreign partners","t":"textarea"},{"q":"State filings, composite payments, withholding, notices, and carryforwards","t":"textarea"},{"q":"I confirm the information is complete","t":"boolean","r":true}]}]},

    {"name":"C Corporation Tax Organizer","type":"1120","sections":[
      {"title":"Corporation Profile","questions":[{"q":"Legal corporation name","t":"text","m":"business_name","r":true},{"q":"Primary contact email","t":"text","m":"email"},{"q":"Primary contact phone","t":"text","m":"phone"},{"q":"Business address","t":"text","m":"address"},{"q":"EIN, formation state, business activity, and accounting method","t":"textarea","r":true}]},
      {"title":"Ownership and Corporate Activity","questions":[{"q":"List owners and percentages, including direct/indirect foreign ownership","t":"textarea"},{"q":"Were shares issued, transferred, redeemed, or retired?","t":"boolean"},{"q":"Dividends paid and dates","t":"currency"},{"q":"Related-party, officer, shareholder, parent, or subsidiary transactions","t":"textarea"},{"q":"Upload organizational and ownership documents","t":"file"}]},
      {"title":"Financial Statements","questions":[{"q":"Gross receipts","t":"currency"},{"q":"Cost of goods sold and inventory","t":"textarea"},{"q":"Expense totals, officer compensation, interest, taxes, and charitable contributions","t":"textarea"},{"q":"Upload profit and loss, comparative balance sheet, trial balance, general ledger, and fixed assets","t":"file","r":true},{"q":"Book-to-tax differences and uncertain tax positions","t":"textarea"}]},
      {"title":"Tax and Compliance","questions":[{"q":"Estimated federal tax payments","t":"currency"},{"q":"State and local tax payments","t":"currency"},{"q":"NOL, capital loss, credit, and charitable carryforwards","t":"textarea"},{"q":"Foreign accounts, foreign owners, foreign subsidiaries, or international transactions","t":"textarea"},{"q":"Notices, audits, amended returns, mergers, liquidations, or major changes","t":"textarea"},{"q":"I confirm the information is complete","t":"boolean","r":true}]}]},

    {"name":"Estate and Trust Income Tax Organizer","type":"1041","sections":[
      {"title":"Fiduciary Profile","questions":[{"q":"Estate or trust legal name","t":"text","m":"business_name","r":true},{"q":"Fiduciary name, title, email, phone, and address","t":"textarea","r":true},{"q":"EIN and entity type","t":"textarea","r":true},{"q":"Decedent date of death or trust creation date","t":"date"},{"q":"Tax year, accounting method, and state of administration","t":"textarea"}]},
      {"title":"Beneficiaries and Distributions","questions":[{"q":"List beneficiaries with tax ID, address, relationship, residency, and allocation share","t":"textarea","r":true},{"q":"Cash and property distributions by beneficiary","t":"textarea"},{"q":"Specific bequests, charitable beneficiaries, or foreign beneficiaries","t":"textarea"},{"q":"Income required to be distributed currently","t":"currency"},{"q":"Upload governing instrument and distribution records","t":"file"}]},
      {"title":"Income, Deductions, and Assets","questions":[{"q":"Interest, dividends, capital gains, rents, royalties, business, K-1, and other income","t":"textarea"},{"q":"Fiduciary, legal, accounting, investment, tax, and administration expenses","t":"textarea"},{"q":"Assets sold, appraised, distributed, or transferred","t":"textarea"},{"q":"Estimated tax payments and withholding","t":"currency"},{"q":"Upload statements, appraisals, closing documents, and prior return","t":"file","r":true}]},
      {"title":"Compliance Review","questions":[{"q":"Is this the initial, final, amended, or regular return?","t":"select","o":["Initial","Regular","Final","Amended"]},{"q":"Foreign accounts, foreign trusts, or foreign beneficiaries?","t":"boolean"},{"q":"Elections, carryovers, notices, estimated distributions, or special issues","t":"textarea"},{"q":"I confirm the information is complete","t":"boolean","r":true}]}]},

    {"name":"Tax-Exempt Organization Organizer","type":"990","sections":[
      {"title":"Organization Profile","questions":[{"q":"Legal organization name","t":"text","m":"business_name","r":true},{"q":"Primary contact email","t":"text","m":"email"},{"q":"Primary contact phone","t":"text","m":"phone"},{"q":"Organization address","t":"text","m":"address"},{"q":"EIN, exemption type, formation date, and mission","t":"textarea","r":true}]},
      {"title":"Governance and Activities","questions":[{"q":"List officers, directors, trustees, key employees, hours, compensation, and relationships","t":"textarea","r":true},{"q":"Describe program-service accomplishments and changes in activities","t":"textarea"},{"q":"Conflicts of interest, governance policy changes, whistleblower/document retention, or board changes","t":"textarea"},{"q":"Lobbying, political activity, grants, fundraising events, gaming, or foreign activity","t":"textarea"},{"q":"Upload bylaws, board roster, minutes, and policy changes","t":"file"}]},
      {"title":"Revenue, Expenses, and Balance Sheet","questions":[{"q":"Contributions and grants","t":"currency"},{"q":"Program-service revenue","t":"currency"},{"q":"Investment and unrelated business income","t":"textarea"},{"q":"Functional expenses by program, management/general, and fundraising","t":"textarea"},{"q":"Upload financial statements, general ledger, donor/grant detail, and comparative balance sheet","t":"file","r":true}]},
      {"title":"Schedules and Compliance","questions":[{"q":"Select applicable areas","t":"multiselect","o":["Public charity support","Contributors","Political/lobbying","Foreign activities","Supplemental financial statements","Hospitals","Tax-exempt bonds","Compensation","Noncash contributions","Related organizations","Supplemental information"]},{"q":"Transactions with interested persons or related organizations","t":"textarea"},{"q":"Donor-restricted funds, endowments, conservation easements, collections, or escrow funds","t":"textarea"},{"q":"State registrations, notices, prior-year issues, or public disclosure concerns","t":"textarea"},{"q":"I confirm the information is complete","t":"boolean","r":true}]}]},

    {"name":"Federal Estate Tax Organizer","type":"706","sections":[
      {"title":"Decedent and Estate","questions":[{"q":"Decedent legal name","t":"text","m":"first_name","r":true},{"q":"Date of death","t":"date","r":true},{"q":"Last four digits of SSN","t":"text","m":"ssn_last_four"},{"q":"Domicile, citizenship, marital status, and surviving spouse information","t":"textarea","r":true},{"q":"Executor contact information and estate EIN","t":"textarea","r":true}]},
      {"title":"Beneficiaries and Transfers","questions":[{"q":"List heirs and beneficiaries with relationship, tax ID, address, and interest","t":"textarea"},{"q":"Lifetime gifts, gift tax returns, trusts, powers of appointment, or transfers within three years","t":"textarea"},{"q":"Jointly owned property and ownership percentages","t":"textarea"},{"q":"Life insurance policies, beneficiaries, ownership, and proceeds","t":"textarea"},{"q":"Upload will, trusts, probate filings, and prior gift tax returns","t":"file","r":true}]},
      {"title":"Gross Estate Assets","questions":[{"q":"Real estate and appraised date-of-death values","t":"textarea"},{"q":"Cash, securities, retirement, business interests, notes, vehicles, personal property, and other assets","t":"textarea"},{"q":"Alternative valuation or special-use valuation requested?","t":"boolean"},{"q":"Upload statements, appraisals, deeds, valuations, and ownership records","t":"file","r":true}]},
      {"title":"Deductions, Elections, and Tax","questions":[{"q":"Funeral, administration, debts, mortgages, and casualty losses","t":"textarea"},{"q":"Marital and charitable deductions","t":"textarea"},{"q":"Portability/DSUE, QTIP, installment payment, or other elections","t":"textarea"},{"q":"State death tax, prior transfer credit, and payments","t":"textarea"},{"q":"I confirm the information is complete","t":"boolean","r":true}]}]},

    {"name":"Federal Gift Tax Organizer","type":"709","sections":[
      {"title":"Donor Profile","questions":[{"q":"Donor first name","t":"text","m":"first_name","r":true},{"q":"Donor last name","t":"text","m":"last_name","r":true},{"q":"Email and phone","t":"textarea"},{"q":"Address, citizenship, marital status, and spouse details","t":"textarea","r":true},{"q":"Tax year and last four SSN","t":"textarea","r":true}]},
      {"title":"Gift Recipients and Transfers","questions":[{"q":"List each recipient with relationship, tax ID, address, and gift date","t":"textarea","r":true},{"q":"Describe each cash, property, business interest, trust transfer, debt forgiveness, or indirect gift","t":"textarea","r":true},{"q":"Fair market value of gifts","t":"currency"},{"q":"Donor adjusted basis and valuation method","t":"textarea"},{"q":"Upload appraisals, deeds, trust documents, statements, and transfer agreements","t":"file","r":true}]},
      {"title":"Elections and Prior Gifts","questions":[{"q":"Elect gift splitting with spouse?","t":"boolean"},{"q":"Gifts of future interests, generation-skipping transfers, 529 acceleration, or QTIP election","t":"textarea"},{"q":"Prior taxable gifts and exemption previously used","t":"textarea"},{"q":"Charitable gifts or gifts to political organizations","t":"textarea"},{"q":"Upload prior Forms 709 and supporting schedules","t":"file"}]},
      {"title":"Final Review","questions":[{"q":"Gift tax paid or estimated payment","t":"currency"},{"q":"Explain amended gifts, valuation changes, notices, or special circumstances","t":"textarea"},{"q":"I confirm every reportable gift is included","t":"boolean","r":true}]}]}
  ]
  $library$::jsonb)
  loop
    select id into template_id
    from public.tax_organizer_templates
    where template_name = template->>'name'
      and return_type = template->>'type'
      and is_active = true
    order by created_at desc limit 1;

    if template_id is null then
      insert into public.tax_organizer_templates
        (workspace_id, template_name, tax_year, return_type, is_platform_template, is_active)
      values
        (null, template->>'name', 2025, template->>'type', true, true)
      returning id into template_id;

      for section in
        select value || jsonb_build_object('sort', ordinality)
        from jsonb_array_elements(template->'sections') with ordinality as items(value, ordinality)
      loop
        insert into public.tax_organizer_sections
          (template_id, section_title, section_description, sort_order, conditional_logic)
        values
          (template_id, section->>'title', section->>'description',
           coalesce((section->>'sort')::integer, 0), '{}'::jsonb)
        returning id into section_id;

        for question in
          select value || jsonb_build_object('sort', ordinality)
          from jsonb_array_elements(section->'questions') with ordinality as items(value, ordinality)
        loop
          insert into public.tax_organizer_questions
            (section_id, question_text, help_text, question_type, options,
             is_required, mapped_field, conditional_logic, sort_order)
          values
            (section_id, question->>'q', question->>'h', coalesce(question->>'t', 'text'),
             coalesce(question->'o', '[]'::jsonb), coalesce((question->>'r')::boolean, false),
             question->>'m', null, coalesce((question->>'sort')::integer, 0));
        end loop;
      end loop;
    end if;
  end loop;

  update public.tax_organizer_templates
  set is_active = false
  where template_name in ('Basic 1040', 'Basic 1040 Tax Organizer')
    and exists (
      select 1 from public.tax_organizer_templates
      where template_name = 'Comprehensive Individual Income Tax Organizer'
        and is_active = true
    );
end $$;
