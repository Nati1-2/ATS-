// Realistic validation CVs with the decision an experienced recruiter would make for each job (test/validation.test.js).
// acc-bookkeeper is expected to disagree: IFRS is a must-have, so the ATS knockout rejects it where a recruiter might look.
export const JOBS = {
  frontend: {
    title: 'Frontend Developer',
    mustHaveSkills: ['React', 'JavaScript', 'CSS'],
    niceToHaveSkills: ['TypeScript', 'Next.js', 'Jest'],
    minYearsExperience: 3,
    minEducation: 'bachelor',
    description: 'We are looking for a Frontend Developer to build responsive web applications for our e-commerce platform. You will build reusable components, work with REST APIs, improve page performance and write unit tests. You will work closely with designers to turn designs into responsive web applications.',
    requirements: '3+ years of frontend development with React. Strong JavaScript, HTML and CSS. Experience with REST APIs and unit tests. Performance optimisation and responsive design.',
  },
  analyst: {
    title: 'Data Analyst',
    mustHaveSkills: ['SQL', 'Excel'],
    niceToHaveSkills: ['Power BI', 'Python'],
    minYearsExperience: 2,
    minEducation: 'bachelor',
    description: 'We need a Data Analyst to turn data into insights for the commercial team. You will write SQL queries, build dashboards and reports, and present findings to stakeholders. You will clean data, track KPIs and support business decisions with data analysis.',
    requirements: '2+ years of data analysis. Strong SQL queries and Excel. Experience building dashboards and reports. Able to present findings to stakeholders.',
  },
  accountant: {
    title: 'Accountant',
    mustHaveSkills: ['IFRS', 'Financial reporting', 'Excel'],
    niceToHaveSkills: ['QuickBooks', 'Tax'],
    minYearsExperience: 3,
    minEducation: 'bachelor',
    description: 'We are hiring an Accountant to manage month-end close, bank reconciliations and financial reporting under IFRS. You will prepare financial statements, manage accounts payable and receivable, and support audits and tax filings.',
    requirements: '3+ years of accounting experience. Knowledge of IFRS and financial reporting. Experience with month-end close, reconciliations and audits. Advanced Excel.',
  },
  support: {
    title: 'Customer Service Representative',
    mustHaveSkills: ['Customer service', 'Communication'],
    niceToHaveSkills: ['CRM', 'Amharic'],
    minYearsExperience: 1,
    description: 'Join our call centre as a Customer Service Representative. You will answer customer calls and emails, resolve complaints, log tickets in our CRM and meet response time targets. You will help customers with orders, payments and account issues.',
    requirements: '1+ year in customer service or a call centre. Excellent communication in English and Amharic. Experience resolving complaints and meeting response time targets.',
  },
};

export const CASES = [
  // ---------------- Frontend ----------------
  { id: 'fe-strong', job: 'frontend', expect: 'pass', file: 'cv.pdf', text: `Abebe Kebede
abebe.kebede@gmail.com | +251 911 234 567 | Addis Ababa | linkedin.com/in/abebekebede
Summary
Frontend Developer with 5 years building responsive web applications in React, JavaScript and TypeScript for e-commerce and fintech products. Focused on performance, accessibility and clean reusable components.
Experience
Frontend Developer, Jumia Ethiopia (Feb 2021 - Present)
- Built and maintained 40+ reusable React components used across the checkout and product pages
- Cut page load time by 38% through code-splitting, image optimisation and caching REST API calls
- Worked with designers to turn Figma designs into responsive web applications for 1.2 million monthly users
- Introduced Jest and React Testing Library unit tests, raising coverage from 25% to 80%
- Mentored 2 junior developers and reviewed pull requests weekly
Junior Frontend Developer, Gebeya (Jun 2019 - Jan 2021)
- Developed responsive landing pages in HTML, CSS and JavaScript, increasing sign-ups by 22%
- Integrated REST APIs for a job marketplace serving 15,000 freelancers
- Fixed 120+ cross-browser bugs and improved Lighthouse performance score from 54 to 91
Education
BSc Computer Science, Addis Ababa University (2015 - 2019)
Skills
React, JavaScript, TypeScript, Next.js, HTML, CSS, Tailwind CSS, Jest, REST APIs, Git, Figma
Certifications
Meta Front-End Developer Professional Certificate (2022)` },
  { id: 'fe-junior', job: 'frontend', expect: 'review', file: 'cv.docx', text: `Hana Girma
hana.girma@gmail.com | +251 922 345 678 | Addis Ababa
Summary
Frontend developer with about 2 years of experience building web applications with React and JavaScript. Eager to grow in a product team.
Experience
Frontend Developer, Kuraz Technologies (Mar 2025 - Present)
- Built 15 React pages for a school management system used by 30 schools
- Styled responsive layouts with CSS and Bootstrap for mobile and desktop
- Connected forms to REST APIs and handled validation errors
Intern, iCog Labs (Sep 2024 - Feb 2025)
- Helped build a dashboard in React for an internal analytics tool
- Fixed UI bugs reported by the QA team
Education
BSc Software Engineering, Adama Science and Technology University (2020 - 2024)
Skills
React, JavaScript, HTML, CSS, Bootstrap, Git, REST APIs
Projects
Personal portfolio built with React and deployed on Netlify; a weather app using a public REST API.` },
  { id: 'fe-backend', job: 'frontend', expect: 'reject', file: 'cv.pdf', text: `Dawit Alemu
dawit.alemu@gmail.com | +251 933 456 789 | Addis Ababa
Summary
Backend developer with 6 years building APIs and services in Java and Spring Boot for banking systems.
Experience
Senior Backend Developer, Commercial Bank of Ethiopia (Jan 2020 - Present)
- Designed REST APIs in Java and Spring Boot processing 2 million transactions per day
- Reduced database query time by 60% by tuning Oracle indexes
- Led a team of 5 developers migrating services to Docker and Kubernetes
Backend Developer, Ethio Telecom (Jul 2017 - Dec 2019)
- Built billing microservices in Java used by 40 million subscribers
- Wrote integration tests with JUnit, cutting production incidents by 30%
Education
BSc Computer Engineering, Bahir Dar University (2012 - 2017)
Skills
Java, Spring Boot, Oracle, PostgreSQL, Docker, Kubernetes, Kafka, JUnit` },
  { id: 'fe-thin', job: 'frontend', expect: 'reject', file: 'cv.pdf', text: `Samuel T.
samuel@gmail.com
Objective
To get a job as a web developer in a good company.
Experience
Web developer (freelance)
Worked on websites for different clients using React, JavaScript, CSS etc.
Education
Diploma in IT
Skills
React, JavaScript, CSS, HTML, Photoshop` },

  // ---------------- Data analyst ----------------
  { id: 'da-strong', job: 'analyst', expect: 'pass', file: 'cv.docx', text: `Meron Tadesse
meron.tadesse@gmail.com | +251 944 567 890 | Addis Ababa
Summary
Data Analyst with 4 years turning sales and customer data into insights for commercial teams. Skilled in SQL, Excel, Power BI and Python.
Experience
Data Analyst, Safaricom Ethiopia (Apr 2022 - Present)
- Wrote SQL queries on a 50 million row data warehouse to track weekly sales KPIs
- Built 18 Power BI dashboards and reports used by 120 managers across 6 regions
- Presented churn analysis findings to stakeholders, leading to a retention campaign that cut churn by 9%
- Automated monthly Excel reports with Python, saving 30 hours of manual work per month
Junior Data Analyst, Dashen Bank (Aug 2020 - Mar 2022)
- Cleaned and analysed loan data in Excel and SQL for the credit risk team
- Built a branch performance dashboard that helped close 4 underperforming branches
Education
BSc Statistics, Addis Ababa University (2016 - 2020)
Skills
SQL, Excel (pivot tables, Power Query), Power BI, Python (pandas), data cleaning, data visualization, KPI reporting` },
  { id: 'da-excel-only', job: 'analyst', expect: 'reject', file: 'cv.docx', text: `Kebede Worku
kebede.worku@gmail.com | +251 955 678 901
Summary
Administrative officer with strong Excel skills and 5 years of office experience.
Experience
Administrative Officer, Ministry of Education (Jan 2019 - Present)
- Prepared monthly Excel reports on staff attendance for 3 departments
- Managed filing, scheduling and procurement requests for 40 staff
- Organised 25 workshops and training events per year
Office Assistant, Hilton Addis Ababa (Mar 2017 - Dec 2018)
- Handled correspondence and data entry for the HR office
Education
BA Management, Unity University (2013 - 2016)
Skills
Excel, Word, PowerPoint, data entry, scheduling` },
  { id: 'da-grad', job: 'analyst', expect: 'review', file: 'cv.pdf', text: `Ruth Haile
ruth.haile@gmail.com | +251 966 789 012 | Addis Ababa
Summary
Recent economics graduate with internship experience in data analysis using SQL, Excel and Python.
Experience
Data Analysis Intern, Ethiopian Airlines (Jul 2025 - Dec 2025)
- Wrote SQL queries to analyse on-time performance for 200 daily flights
- Built an Excel dashboard tracking delays by route, used by the operations team
- Presented findings on the top 10 delay causes to the operations manager
Research Assistant, Addis Ababa University (Jan 2025 - Jun 2025)
- Cleaned and analysed survey data from 1,500 households in Python and Excel
Education
BA Economics, Addis Ababa University (2021 - 2025)
Skills
SQL, Excel, Python, Power BI (basic), data cleaning, statistics` },
  { id: 'da-stuffed', job: 'analyst', expect: 'reject', file: 'cv.pdf', text: `Yared M.
yared@gmail.com | +251 977 890 123
Skills
SQL, Excel, Power BI, Python, Tableau, R, SAS, SPSS, Hadoop, Spark, AWS, Azure, GCP, Snowflake, dbt, Airflow, Looker, Qlik, MongoDB, PostgreSQL, MySQL, Oracle, data analysis, data analyst, dashboards, reports, stakeholders, KPIs, SQL queries, data visualization, machine learning, deep learning, statistics, A/B testing, ETL, data warehouse, BigQuery, Redshift, pandas, numpy, scikit-learn, TensorFlow, Keras, Excel VBA, Power Query, DAX, SQL Server, SSIS, SSRS
Experience
Data analyst
Education
BSc` },

  // ---------------- Accountant ----------------
  { id: 'acc-strong', job: 'accountant', expect: 'pass', file: 'cv.docx', text: `Selam Bekele
selam.bekele@gmail.com | +251 911 111 222 | Addis Ababa
Summary
Accountant with 6 years of experience in IFRS financial reporting, month-end close and audits for manufacturing and NGO clients. ACCA part-qualified.
Experience
Senior Accountant, East African Bottling S.C. (Mar 2021 - Present)
- Lead month-end close for a company with ETB 3 billion annual revenue, cutting close time from 10 to 6 days
- Prepare IFRS financial statements and quarterly financial reporting for the board
- Perform 25 bank reconciliations per month and resolve discrepancies within 48 hours
- Coordinate external audits with Deloitte, closing 2 years with no material findings
- Manage accounts payable for 300+ suppliers and VAT and withholding tax filings
Accountant, Save the Children Ethiopia (Jan 2019 - Feb 2021)
- Managed accounts receivable and donor fund reporting for 12 projects worth USD 8 million
- Built Excel models with pivot tables and VLOOKUP to reconcile project expenses
Education
BA Accounting and Finance, Addis Ababa University (2014 - 2018)
Skills
IFRS, financial reporting, month-end close, reconciliations, audits, accounts payable, accounts receivable, tax, Excel, QuickBooks, Peachtree
Certifications
ACCA (Applied Skills completed, 2022)` },
  { id: 'acc-bookkeeper', job: 'accountant', expect: 'review', file: 'cv.docx', text: `Tigist Abebe
tigist.abebe@gmail.com | +251 922 222 333 | Hawassa
Summary
Bookkeeper with 4 years of experience in a small trading company. Experienced in Peachtree, reconciliations and tax filing.
Experience
Bookkeeper, Hawassa Trading PLC (Feb 2021 - Present)
- Record 600+ sales and purchase transactions per month in Peachtree
- Reconcile 3 bank accounts monthly and prepare VAT returns
- Prepare monthly profit and loss statements for the owner
Accounts Clerk, Sidama Coffee Union (Jan 2020 - Jan 2021)
- Processed supplier payments and petty cash for 4 branches
Education
BA Accounting, Hawassa University (2015 - 2019)
Skills
Peachtree, Excel, bookkeeping, VAT, payroll, bank reconciliation` },
  { id: 'acc-nurse', job: 'accountant', expect: 'reject', file: 'cv.pdf', text: `Almaz Tesfaye
almaz.tesfaye@gmail.com | +251 933 333 444
Summary
Registered nurse with 7 years of experience in emergency and surgical wards.
Experience
Senior Nurse, Black Lion Hospital (Jan 2020 - Present)
- Care for 20+ patients per shift in the emergency department
- Trained 15 new nurses on triage protocols
Nurse, St. Paul's Hospital (Jun 2017 - Dec 2019)
- Assisted in 300+ surgeries and managed post-operative care
Education
BSc Nursing, Jimma University (2013 - 2017)
Skills
Patient care, triage, emergency care, medication administration, Excel` },
  { id: 'acc-gap', job: 'accountant', expect: 'pass', file: 'cv.pdf', text: `Fikru Lemma
fikru.lemma@gmail.com | +251 944 444 555 | Addis Ababa
Summary
Accountant with 5 years of experience in financial reporting and audits, returning to work after a 2-year career break.
Experience
Accountant, Awash Insurance (Jan 2017 - Dec 2021)
- Prepared monthly financial reporting and IFRS-based annual statements
- Reconciled 15 bank and suspense accounts monthly
- Supported 4 annual external audits and responded to 100+ audit queries
Career break (2022 - 2023)
Caring for a family member.
Education
BA Accounting, Addis Ababa University (2012 - 2016)
Skills
IFRS, financial reporting, reconciliations, audits, Excel, Peachtree` },

  // ---------------- Customer service ----------------
  { id: 'cs-strong', job: 'support', expect: 'pass', file: 'cv.docx', text: `Betelhem Asfaw
betelhem.asfaw@gmail.com | +251 911 555 666 | Addis Ababa
Summary
Customer service representative with 3 years in a busy call centre. Fluent in English and Amharic, experienced with CRM tools and resolving complaints.
Experience
Customer Service Representative, Ethio Telecom Call Centre (Jan 2022 - Present)
- Answer 80+ customer calls and emails per day about payments, orders and account issues
- Resolve complaints on first contact 85% of the time, above the 75% team target
- Log and track every ticket in Salesforce CRM, keeping average response time under 2 minutes
- Trained 6 new agents on call handling and the CRM
Sales Assistant, Shoa Supermarket (Mar 2021 - Dec 2021)
- Served 200+ customers per day and handled returns and complaints
Education
Diploma in Marketing, St. Mary's University (2018 - 2020)
Skills
Customer service, communication, complaint resolution, Salesforce CRM, English, Amharic, Afaan Oromo, typing 50 wpm` },
  { id: 'cs-retail', job: 'support', expect: 'review', file: 'cv.docx', text: `Mulugeta Desta
mulugeta.desta@gmail.com | +251 922 666 777 | Adama
Summary
Friendly sales assistant with 2 years of experience serving customers in retail. Speaks Amharic and English.
Experience
Sales Assistant, Adama Mall (Feb 2023 - Present)
- Serve about 100 customers per day and answer questions about products
- Handle customer complaints and returns with the store manager
- Keep the shop floor organised and restock shelves
Education
High School Diploma, Adama Secondary School (2021)
Skills
Customer service, communication, Amharic, English, cash handling` },
  { id: 'cs-engineer', job: 'support', expect: 'reject', file: 'cv.pdf', text: `Henok Getachew
henok.getachew@gmail.com | +251 933 777 888
Summary
Civil engineer with 4 years of experience in road construction projects.
Experience
Site Engineer, China Road and Bridge Corporation (Jan 2021 - Present)
- Supervised construction of 45 km of asphalt roads
- Managed a site team of 60 workers and subcontractors
Junior Engineer, Ethiopian Roads Authority (Jul 2019 - Dec 2020)
- Prepared quantity surveys and site reports
Education
BSc Civil Engineering, Mekelle University (2014 - 2019)
Skills
AutoCAD, quantity surveying, site supervision, project management` },
  { id: 'cs-scanned', job: 'support', expect: 'reject', file: 'cv.pdf', text: '' },
];
