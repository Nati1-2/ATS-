/* Resets the database and loads demo data. Run with `npm run seed`. */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Invite, Company, Job, Candidate, Application, Note, Interview, Activity, Report, CvCheck } from './models/index.js';
import { UPLOAD_DIR } from './utils/uploads.js';
import { STAGE_LABELS } from './utils/activity.js';
import { extractResumeText, scoreApplication, evaluateScreening, decideApplication } from './utils/screening.js';
import { decideWithAi, applyAiDecision } from './utils/aiScreening.js';

const DEMO_PASSWORD = 'Password123!';
const day = 24 * 60 * 60 * 1000;
const ago = (days, hours = 0) => new Date(Date.now() - days * day - hours * 3600 * 1000);
const ahead = (days, hour) => {
  const d = new Date(Date.now() + days * day);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Build a tiny one-page PDF so seeded résumés can be previewed. */
function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 72 ${720 - i * 24} Td (${esc(l)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function main() {
  // The seed wipes every collection — never let it run against production by accident
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('Refusing to seed: NODE_ENV=production and this would DELETE all data. Pass --force if you really mean it.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Clearing existing data…');
  await Promise.all([User, Invite, Company, Job, Candidate, Application, Note, Interview, Activity, Report, CvCheck].map((m) => m.deleteMany({})));
  const resumeDir = path.join(UPLOAD_DIR, 'resumes');
  for (const f of fs.readdirSync(resumeDir)) fs.unlinkSync(path.join(resumeDir, f));

  await Company.create({
    name: 'Acme Labs',
    description:
      'Acme Labs builds friendly software for logistics teams around the world. We are a remote-friendly company of 120 people who care about craft, clarity, and kindness.',
    website: 'https://acme.example.com',
    contactEmail: 'careers@acme.example.com',
    phone: '+1 (415) 555-0100',
    address: '500 Market Street, San Francisco, CA',
    careersHeadline: 'Build the software that keeps the world’s deliveries moving',
    careersIntro:
      'Every day, dispatchers and drivers in 30 countries plan millions of stops with Acme. We are a small, senior team that ships carefully, writes things down and takes real ownership of our work.',
    benefits: [
      'Competitive salary and equity for every employee',
      'Remote-friendly, with hubs in San Francisco, London and Addis Ababa',
      'Private health, dental and vision cover',
      '25 days of paid leave plus local public holidays',
      '$2,000 yearly learning budget',
      '16 weeks of fully paid parental leave',
    ],
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [admin, recruiter, recruiter2, hm1, hm2] = await User.create([
    { name: 'Ava Admin', email: 'admin@acme.test', role: 'admin', passwordHash },
    { name: 'Riley Recruiter', email: 'recruiter@acme.test', role: 'recruiter', passwordHash },
    { name: 'Sam Patel', email: 'sam@acme.test', role: 'recruiter', passwordHash },
    { name: 'Morgan Manager', email: 'manager@acme.test', role: 'hiring_manager', passwordHash },
    { name: 'Jordan Lee', email: 'jordan@acme.test', role: 'hiring_manager', passwordHash },
  ]);

  const jobDefs = [
    {
      title: 'Senior Frontend Engineer',
      mustHaveSkills: ['React | React.js', 'TypeScript', 'CSS'], niceToHaveSkills: ['Next.js', 'Accessibility | a11y', 'Design systems', 'GraphQL'], autoRejectKnockouts: true,
      minYearsExperience: 5, minEducation: 'bachelor',
      autoScreen: { rejectBelowScore: 40, advanceAtScore: 85, rejectMissingMustHave: false },
      aiScreen: { mode: 'review', rejectBelowFit: 50, advanceAtFit: 85 }, screeningQuestions: [
        { question: 'Are you legally authorized to work in this location?', type: 'yes_no', required: true, knockout: true, expectedAnswer: 'yes' },
        { question: 'How many years of professional experience do you have?', type: 'number', required: true, knockout: true, minValue: 5 },
        { question: 'What is your notice period?', type: 'text', required: false },
      ], department: 'Engineering', location: 'San Francisco, CA', remotePolicy: 'hybrid',
      employmentType: 'full_time', salaryMin: 150000, salaryMax: 190000, currency: 'USD', status: 'published',
      hiringManagers: [hm1._id], publishedAt: ago(21),
      description: 'We are looking for a Senior Frontend Engineer to lead the development of our customer-facing dashboard. You will work closely with design and product to ship fast, accessible, and delightful interfaces.',
      responsibilities: '- Build and maintain React components used across the product\n- Lead technical design for new features\n- Mentor engineers and review code\n- Improve performance and accessibility',
      requirements: '- 5+ years building web applications\n- Deep knowledge of React and TypeScript\n- Experience with design systems\n- Clear written communication',
    },
    {
      title: 'Backend Engineer (Node.js)',
      mustHaveSkills: ['Node.js | Node', 'MongoDB', 'REST | REST API'], niceToHaveSkills: ['PostgreSQL', 'AWS', 'Docker', 'Kubernetes'], autoRejectKnockouts: false,
      minYearsExperience: 3,
      autoScreen: { rejectMissingMustHave: true, advanceAtScore: 80 }, screeningQuestions: [
        { question: 'Are you legally authorized to work in this location?', type: 'yes_no', required: true, knockout: true, expectedAnswer: 'yes' },
        { question: 'How many years of professional experience do you have?', type: 'number', required: true, knockout: true, minValue: 3 },
        { question: 'What is your notice period?', type: 'text', required: false },
      ], department: 'Engineering', location: 'Remote — US', remotePolicy: 'remote',
      employmentType: 'full_time', salaryMin: 135000, salaryMax: 170000, currency: 'USD', status: 'published',
      hiringManagers: [hm1._id], publishedAt: ago(14),
      description: 'Join the platform team building the APIs that power route optimisation for thousands of fleets. You will own services end to end, from design through production monitoring.',
      responsibilities: '- Design and build REST APIs in Node.js\n- Model data in MongoDB and PostgreSQL\n- Own on-call rotation for your services',
      requirements: '- 3+ years of backend experience\n- Strong Node.js and SQL/NoSQL skills\n- Experience with cloud infrastructure (AWS or GCP)',
    },
    {
      title: 'Product Designer',
      mustHaveSkills: ['Figma', 'Prototyping', 'User research'], niceToHaveSkills: ['Mobile', 'Design systems'],
      aiScreen: { mode: 'auto', rejectBelowFit: 35, rejectMissingMustHave: true, advanceAtFit: 85 }, department: 'Design', location: 'London, UK', remotePolicy: 'hybrid',
      employmentType: 'full_time', salaryMin: 65000, salaryMax: 85000, currency: 'GBP', status: 'published',
      hiringManagers: [hm2._id], publishedAt: ago(10),
      description: 'We are hiring a Product Designer to shape the end-to-end experience of our mobile driver app. You will run discovery, prototype ideas, and partner with engineers to bring them to life.',
      responsibilities: '- Run user research with drivers and dispatchers\n- Produce wireframes, prototypes and high-fidelity designs\n- Contribute to the design system',
      requirements: '- A portfolio showing product design work\n- Proficiency in Figma\n- Experience designing for mobile',
    },
    {
      title: 'Customer Success Manager',
      mustHaveSkills: ['Customer success | Account management', 'Onboarding'], niceToHaveSkills: ['Salesforce', 'SaaS'],
      aiScreen: { mode: 'review', rejectBelowFit: 40, advanceAtFit: 80 }, department: 'Customer Success', location: 'Austin, TX', remotePolicy: 'onsite',
      employmentType: 'full_time', status: 'published', hiringManagers: [hm2._id], publishedAt: ago(5),
      description: 'Help our largest customers get the most out of Acme. You will onboard new accounts, run quarterly business reviews, and be the voice of the customer inside the company.',
      responsibilities: '- Own a portfolio of enterprise accounts\n- Drive adoption and renewals\n- Partner with product on feedback',
      requirements: '- 2+ years in customer success or account management\n- Excellent communication skills\n- Comfortable with data and spreadsheets',
    },
    {
      title: 'Marketing Intern', department: 'Marketing', location: 'Remote — Worldwide', remotePolicy: 'remote',
      employmentType: 'internship', status: 'closed', publishedAt: ago(60), closedAt: ago(20),
      description: 'A 12-week paid internship working alongside our marketing team on content, campaigns and community events.',
      responsibilities: '- Write blog posts and social content\n- Help organise webinars',
      requirements: '- Currently studying marketing, communications or similar\n- Strong writing skills',
    },
    {
      title: 'Data Analyst', department: 'Operations', location: 'Addis Ababa, Ethiopia', remotePolicy: 'hybrid',
      employmentType: 'contract', status: 'draft', hiringManagers: [hm1._id],
      description: 'A six-month contract to help us build reporting on fleet performance and customer health for the leadership team.',
      responsibilities: '- Build dashboards\n- Define and document key metrics',
      requirements: '- SQL\n- Experience with a BI tool such as Metabase or Looker',
    },
  ];
  const jobs = await Job.create(jobDefs.map((j) => ({ ...j, createdBy: recruiter._id })));
  const [feJob, beJob, designJob, csmJob, internJob] = jobs;

  const people = [
    ['Liya Tesfaye', 'liya.tesfaye@example.com', '+251 91 123 4567'],
    ['Marcus Chen', 'marcus.chen@example.com', '+1 415 555 0134'],
    ['Priya Sharma', 'priya.sharma@example.com', '+44 20 7946 0958'],
    ['Daniel Okafor', 'daniel.okafor@example.com', ''],
    ['Sofia Rossi', 'sofia.rossi@example.com', '+39 06 1234 5678'],
    ['Ethan Brooks', 'ethan.brooks@example.com', '+1 512 555 0177'],
    ['Hana Kim', 'hana.kim@example.com', ''],
    ['Yonas Bekele', 'yonas.bekele@example.com', '+251 92 765 4321'],
    ['Grace Miller', 'grace.miller@example.com', '+1 206 555 0199'],
    ['Omar Haddad', 'omar.haddad@example.com', ''],
    ['Chloe Martin', 'chloe.martin@example.com', '+33 1 23 45 67 89'],
    ['Lucas Silva', 'lucas.silva@example.com', '+55 11 91234 5678'],
    ['Amara Nwosu', 'amara.nwosu@example.com', ''],
    ['Noah Fischer', 'noah.fischer@example.com', '+49 30 123456'],
  ];
  const candidates = await Candidate.create(people.map(([fullName, email, phone]) => ({ fullName, email, phone })));
  const c = Object.fromEntries(candidates.map((x) => [x.fullName.split(' ')[0], x]));

  // [candidate, job, stage, daysAgo]
  // Work history written into each demo CV, so experience, title and education can be scored
  const HISTORY = {
    Liya: { title: 'Senior Frontend Developer', company: 'Kifiya', from: 'Jan 2020', previous: 'Frontend Developer, Gebeya (Mar 2017 - Dec 2019)', degree: 'BSc Computer Science, Addis Ababa University' },
    Marcus: { title: 'Frontend Engineer', company: 'Brightwave', from: 'Mar 2019', previous: 'Web Developer, Pixel Co (Jun 2017 - Feb 2019)', degree: 'BSc Software Engineering, UC Davis' },
    Priya: { title: 'Web Developer', company: 'Infotech', from: 'Jun 2021', degree: 'BSc Information Technology, University of Mumbai' },
    Daniel: { title: 'Junior Web Developer', company: 'Andela', from: 'Sep 2022', degree: 'Diploma in Web Development, Lagos Tech Academy' },
    Ethan: { title: 'PHP Developer', company: 'Local Agency', from: 'Jan 2024', degree: 'Graduated from Lincoln High School' },
    Hana: { title: 'Frontend Developer', company: 'Kakao', from: 'Feb 2020', previous: 'Marketing Intern, Acme Labs (Jun 2019 - Sep 2019)', degree: 'BSc Computer Science, Seoul National University' },
    Yonas: { title: 'Backend Engineer', company: 'Safaricom Ethiopia', from: 'Jan 2019', degree: 'BSc Computer Engineering, Bahir Dar University' },
    Omar: { title: 'Python Developer', company: 'DataCo', from: 'Jul 2024', degree: 'BSc Mathematics, University of Jordan' },
    Noah: { title: 'Senior Backend Developer', company: 'N26', from: 'Apr 2016', degree: 'MSc Computer Science, TU Berlin' },
    Sofia: { title: 'Product Designer', company: 'Satispay', from: 'May 2018', degree: 'BA Interaction Design, Politecnico di Milano' },
    Chloe: { title: 'UI Designer', company: 'Doctolib', from: 'Oct 2020', degree: 'BA Graphic Design, ECV Paris' },
    Amara: { title: 'Graphic Designer', company: 'Studio Lagos', from: 'Jan 2022', degree: 'Diploma in Visual Arts' },
    Grace: { title: 'Account Manager', company: 'HubSpot', from: 'Aug 2019', degree: 'BA Business Administration, University of Washington' },
    Lucas: { title: 'Customer Support Lead', company: 'Nubank', from: 'Mar 2020', degree: 'BSc Marketing, USP' },
  };

  // [candidate, job, stage, daysAgo, skills listed on CV, screening answers (work auth, years)]
  const appDefs = [
    [c.Liya, feJob, 'interview', 18, 'React, TypeScript, CSS, Next.js, Accessibility, Design systems', ['yes', 7]],
    [c.Marcus, feJob, 'offer', 20, 'React, TypeScript, CSS, GraphQL', ['yes', 6]],
    [c.Priya, feJob, 'screening', 6, 'React, JavaScript, CSS, Next.js', ['yes', 5]],
    [c.Daniel, feJob, 'applied', 2, 'React, JavaScript, HTML, CSS', ['yes', 6]],
    [c.Ethan, feJob, 'rejected', 15, 'jQuery, PHP, HTML', ['no', 2]],
    [c.Hana, feJob, 'screening', 1, 'React, TypeScript, Tailwind CSS, Design systems', ['yes', 5]],
    [c.Liya, beJob, 'screening', 9, 'Node.js, Express, MongoDB, REST API, Docker', ['yes', 7]],
    [c.Yonas, beJob, 'interview', 11, 'Node.js, MongoDB, REST, PostgreSQL, AWS, Kubernetes', ['yes', 5]],
    [c.Omar, beJob, 'rejected', 3, 'Python, Django, PostgreSQL', ['yes', 2]],
    [c.Noah, beJob, 'hired', 13, 'Node.js, MongoDB, REST API, AWS, Docker', ['yes', 8]],
    [c.Sofia, designJob, 'interview', 8, 'Figma, Prototyping, User research, Mobile'],
    [c.Chloe, designJob, 'screening', 4, 'Figma, Sketch, Prototyping, Design systems'],
    [c.Amara, designJob, 'applied', 0, 'Photoshop, Illustrator, Branding'],
    [c.Grace, csmJob, 'applied', 2, 'Account management, Onboarding, Salesforce, SaaS'],
    [c.Lucas, csmJob, 'screening', 3, 'Customer success, Zendesk, Onboarding'],
    [c.Hana, internJob, 'hired', 45, 'Copywriting, Social media'],
    [c.Amara, internJob, 'rejected', 40, 'Branding, Social media'],
  ];
  const order = ['applied', 'screening', 'interview', 'offer', 'hired'];
  const applications = [];
  for (const [cand, job, stage, daysAgo, skills, answers] of appDefs) {
    const filename = `${crypto.randomUUID()}.pdf`;
    const h = HISTORY[cand.fullName.split(' ')[0]];
    const skillList = skills.split(', ');
    const pdf = makePdf([
      cand.fullName,
      `${h.title} | ${cand.email}`,
      '',
      'Summary',
      `  ${h.title} who enjoys building great products with small teams.`,
      '',
      'Experience',
      `  ${h.title}, ${h.company} (${h.from} - Present)`,
      `  Day-to-day work with ${skillList.slice(0, 3).join(', ')}.`,
      ...(h.previous ? [`  ${h.previous}`] : []),
      '',
      'Education',
      `  ${h.degree}`,
      '',
      'Skills',
      `  ${skills}`,
    ]);
    fs.writeFileSync(path.join(resumeDir, filename), pdf);
    const createdAt = ago(daysAgo, 3);
    const coverLetter = `Dear hiring team,\n\nI am excited to apply for the ${job.title} role at Acme Labs. I believe my background is a strong fit and I would love to contribute to your mission.\n\nBest regards,\n${cand.fullName}`;
    const resumeText = await extractResumeText(path.join(resumeDir, filename), 'application/pdf');
    const match = scoreApplication(job, { resumeText, coverLetter });
    const qs = job.screeningQuestions || [];
    const screening = evaluateScreening(qs, answers && qs.length ? { [qs[0]._id]: answers[0], [qs[1]._id]: String(answers[1]), [qs[2]._id]: '4 weeks' } : {});
    const decision = decideApplication(job, { match, screeningPassed: screening.passed, resumeReadable: resumeText.length > 0 });
    if (decision.decision === 'rejected' && stage !== 'rejected') throw new Error(`Seed mismatch: ${cand.fullName} would be auto-rejected`);
    if (decision.decision === 'advanced' && stage === 'applied') throw new Error(`Seed mismatch: ${cand.fullName} would be auto-shortlisted`);
    const app = await Application.create({
      autoDecision: decision.decision ?? 'review', autoDecisionReasons: decision.reasons,
      resumeText, resumeTextExtracted: resumeText.length > 0, match: match ?? undefined,
      screeningAnswers: screening.answers, screeningPassed: screening.passed,
      autoRejected: decision.decision === 'rejected',
      candidate: cand._id, job: job._id, stage, createdAt, stageChangedAt: ago(Math.max(0, daysAgo - 2)),
      coverLetter,
      resume: { filename, originalName: `${cand.fullName.replace(/\s+/g, '_')}_Resume.pdf`, mimetype: 'application/pdf', size: pdf.length },
    });
    applications.push(app);

    const acts = [{ type: 'applied', message: `Applied for ${job.title}`, createdAt }];
    if (decision.decision === 'rejected') {
      acts.push({ type: 'auto_rejected', message: `Automatically rejected: ${decision.reasons.join('; ')}`, createdAt: new Date(createdAt.getTime() + 1000) });
    } else if (decision.decision === 'advanced') {
      acts.push({ type: 'auto_advanced', message: `Automatically shortlisted to Screening: ${decision.reasons.join('; ')}`, createdAt: new Date(createdAt.getTime() + 1000) });
    }
    const autoPath = decision.decision === 'rejected' ? ['rejected'] : decision.decision === 'advanced' ? ['screening'] : ['applied'];
    const path_ = stage === 'rejected' ? (decision.decision === 'rejected' ? autoPath : ['applied', 'screening', 'rejected']) : order.slice(order.indexOf(autoPath[0]), order.indexOf(stage) + 1);
    for (let i = 1; i < path_.length; i++) {
      acts.push({
        type: 'stage_changed', actor: recruiter._id, meta: { from: path_[i - 1], to: path_[i] },
        message: `Moved from ${STAGE_LABELS[path_[i - 1]]} to ${STAGE_LABELS[path_[i]]}`,
        createdAt: new Date(createdAt.getTime() + i * day),
      });
    }
    await Activity.insertMany(acts.map((a) => ({ ...a, candidate: cand._id, application: app._id, job: job._id, updatedAt: a.createdAt })));
  }
  const find = (cand, job) => applications.find((a) => a.candidate.equals(cand._id) && a.job.equals(job._id));

  // Demo AI analyses for the people still in Applied, so AI screening has something to show without
  // a Gemini key. Marked as model "demo-seed". With a real key, new applicants are analysed for real.
  const demoAi = [
    [find(c.Daniel, feJob), feJob, {
      fitLevel: 'partial', fitScore: 42, recommendation: 'reject', currentTitle: 'Junior Web Developer', yearsExperience: 4,
      rejectionReason: 'About 4 years of junior-level experience and no TypeScript, below what this senior role requires.',
      summary: 'Junior web developer building React interfaces at Andela since 2022. Solid on React and CSS, but no TypeScript and no senior-level ownership yet.',
      strengths: ['Uses React day to day', 'Comfortable with HTML and CSS'], concerns: ['No TypeScript on the CV', 'Junior scope; the role is senior'],
      skills: [{ skill: 'React', level: 'strong', evidence: 'Day-to-day work with React' }, { skill: 'TypeScript', level: 'none', evidence: '' }, { skill: 'CSS', level: 'some', evidence: 'Skills: CSS' }],
    }],
    [find(c.Amara, designJob), designJob, {
      fitLevel: 'weak', fitScore: 18, recommendation: 'reject', currentTitle: 'Graphic Designer', yearsExperience: 4,
      rejectionReason: 'Brand and print design background with no product design, prototyping or user research.',
      summary: 'Graphic designer focused on branding with Photoshop and Illustrator. No evidence of product design, Figma, prototyping or user research.',
      strengths: ['Visual and brand design'], concerns: ['No Figma, prototyping or user research'],
      skills: [{ skill: 'Figma', level: 'none', evidence: '' }, { skill: 'Prototyping', level: 'none', evidence: '' }, { skill: 'User research', level: 'none', evidence: '' }],
    }],
    [find(c.Grace, csmJob), csmJob, {
      fitLevel: 'strong', fitScore: 88, recommendation: 'advance', rejectionReason: '', currentTitle: 'Account Manager', yearsExperience: 7,
      summary: 'Account manager at HubSpot since 2019, onboarding and growing SaaS customers in Salesforce. A close match for this role.',
      strengths: ['7 years of account management in SaaS', 'Onboarding and Salesforce experience'], concerns: ['Check experience with enterprise-sized accounts'],
      skills: [{ skill: 'Customer success', level: 'strong', evidence: 'Account Manager, HubSpot' }, { skill: 'Onboarding', level: 'strong', evidence: 'Skills: Onboarding' }],
    }],
  ];
  for (const [app, job, analysis] of demoAi) {
    const analyzedAt = new Date(app.createdAt.getTime() + 60_000);
    app.ai = { status: 'done', model: 'demo-seed', analyzedAt, readable: true, cvText: '', injectionAttempt: false, ...analysis };
    const result = decideWithAi(job, app);
    const activity = result && applyAiDecision(app, { ...result, decidedAt: analyzedAt });
    if (activity) app.stageChangedAt = analyzedAt;
    await app.save();
    await Activity.create({ candidate: app.candidate, application: app._id, job: job._id, type: 'ai_analyzed', message: `AI summary ready (${analysis.fitLevel} fit, ${analysis.fitScore}%)`, createdAt: analyzedAt });
    if (activity) await Activity.create({ candidate: app.candidate, application: app._id, job: job._id, ...activity, createdAt: new Date(analyzedAt.getTime() + 1000) });
  }

  const notes = [
    [find(c.Liya, feJob), recruiter, 'note', 'Strong portfolio. Previously led a design-system migration. Salary expectations within range.'],
    [find(c.Liya, feJob), hm1, 'feedback', 'Excellent technical depth in the React deep-dive. Communicates trade-offs clearly.', 5, 'strong_yes'],
    [find(c.Marcus, feJob), hm1, 'feedback', 'Solid all round. A little light on accessibility experience, but eager to learn.', 4, 'yes'],
    [find(c.Marcus, feJob), recruiter, 'note', 'Offer sent on Monday. Candidate has a competing offer — follow up by Friday.'],
    [find(c.Yonas, beJob), recruiter2, 'note', 'Referred by Noah. Great take-home submission.'],
    [find(c.Sofia, designJob), hm2, 'feedback', 'Portfolio is impressive; research process was a bit thin.', 3, 'yes'],
    [find(c.Ethan, feJob), recruiter, 'note', 'Not enough frontend experience for the senior level. Encourage to apply for future mid-level roles.'],
  ];
  for (const [app, author, kind, body, rating, recommendation] of notes) {
    const createdAt = new Date(app.createdAt.getTime() + 2 * day);
    await Note.create({ application: app._id, candidate: app.candidate, author: author._id, kind, body, rating, recommendation, createdAt });
    await Activity.create({
      candidate: app.candidate, application: app._id, job: app.job, actor: author._id,
      type: kind === 'feedback' ? 'feedback_added' : 'note_added',
      message: kind === 'feedback' ? `Left feedback (${rating}/5)` : 'Added an internal note', createdAt,
    });
  }

  const interviews = [
    [find(c.Liya, feJob), hm1, ahead(1, 10), 'Video call — https://meet.example.com/fe-liya'],
    [find(c.Yonas, beJob), hm1, ahead(2, 14), 'Video call'],
    [find(c.Sofia, designJob), hm2, ahead(3, 11), 'London office, Room 4B'],
    [find(c.Marcus, feJob), hm1, ago(5), 'Video call', 'completed'],
  ];
  for (const [app, interviewer, scheduledAt, location, status = 'scheduled'] of interviews) {
    await Interview.create({
      application: app._id, candidate: app.candidate, job: app.job, interviewer: interviewer._id,
      scheduledAt, durationMinutes: 60, location, status, createdBy: recruiter._id,
    });
    await Activity.create({
      candidate: app.candidate, application: app._id, job: app.job, actor: recruiter._id, type: 'interview_scheduled',
      message: `Scheduled an interview with ${interviewer.name}`, meta: { scheduledAt },
    });
  }

  console.log(`\nSeeded ${jobs.length} jobs, ${candidates.length} candidates, ${applications.length} applications.`);
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD})`);
  console.log('  admin@acme.test      — Admin');
  console.log('  recruiter@acme.test  — Recruiter');
  console.log('  manager@acme.test    — Hiring manager (Engineering jobs)');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
