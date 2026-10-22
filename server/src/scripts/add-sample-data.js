/*
 * Fill the careers site with sample content, without deleting anything (unlike `npm run seed`).
 *   npm run sample-data
 * Company fields are only set while still empty, and jobs whose title already exists are skipped,
 * so it is safe to run more than once and never overwrites what an admin has entered.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });
import mongoose from 'mongoose';
import { Job, User, getCompany } from '../models/index.js';

const day = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * day);

const COMPANY = {
  name: 'Acme Labs',
  description:
    'Acme Labs builds friendly software for logistics teams around the world. We are a remote-friendly company of 120 people who care about craft, clarity, and kindness.',
  website: 'https://acme.example.com',
  contactEmail: 'careers@acme.example.com',
  phone: '+251 11 555 0100',
  address: 'Bole Road, Addis Ababa, Ethiopia',
  careersHeadline: 'Build the software that keeps the world’s deliveries moving',
  careersIntro:
    'Every day, dispatchers and drivers in 30 countries plan millions of stops with Acme. We are a small, senior team that ships carefully, writes things down and takes real ownership of our work.',
  benefits: [
    'Competitive salary and equity for every employee',
    'Remote-friendly, with hubs in Addis Ababa, London and San Francisco',
    'Private health, dental and vision cover',
    '25 days of paid leave plus local public holidays',
    '$2,000 yearly learning budget',
    '16 weeks of fully paid parental leave',
  ],
};

const WORK_AUTH = { question: 'Are you legally authorized to work in this location?', type: 'yes_no', required: true, knockout: true, expectedAnswer: 'yes' };
const yearsQuestion = (min) => ({ question: 'How many years of professional experience do you have?', type: 'number', required: true, knockout: true, minValue: min });
const NOTICE = { question: 'What is your notice period?', type: 'text', required: false };

const JOBS = [
  {
    title: 'Senior Frontend Engineer', department: 'Engineering', location: 'Addis Ababa, Ethiopia', remotePolicy: 'hybrid',
    employmentType: 'full_time', salaryMin: 90000, salaryMax: 130000, currency: 'USD', publishedAt: ago(21),
    mustHaveSkills: ['React | React.js', 'TypeScript', 'CSS'], niceToHaveSkills: ['Next.js', 'Accessibility | a11y', 'Design systems'],
    minYearsExperience: 5, minEducation: 'bachelor', screeningQuestions: [WORK_AUTH, yearsQuestion(5), NOTICE],
    description: 'We are looking for a Senior Frontend Engineer to lead the development of our customer-facing dashboard. You will work closely with design and product to ship fast, accessible, and delightful interfaces.',
    responsibilities: '- Build and maintain React components used across the product\n- Lead technical design for new features\n- Mentor engineers and review code\n- Improve performance and accessibility',
    requirements: '- 5+ years building web applications\n- Deep knowledge of React and TypeScript\n- Experience with design systems\n- Clear written communication',
  },
  {
    title: 'Backend Engineer (Node.js)', department: 'Engineering', location: 'Remote — Africa & Europe', remotePolicy: 'remote',
    employmentType: 'full_time', salaryMin: 70000, salaryMax: 110000, currency: 'USD', publishedAt: ago(14),
    mustHaveSkills: ['Node.js | Node', 'MongoDB', 'REST | REST API'], niceToHaveSkills: ['PostgreSQL', 'AWS', 'Docker'],
    minYearsExperience: 3, screeningQuestions: [WORK_AUTH, yearsQuestion(3), NOTICE],
    description: 'Join the platform team building the APIs that power route optimisation for thousands of fleets. You will own services end to end, from design through production monitoring.',
    responsibilities: '- Design and build REST APIs in Node.js\n- Model data in MongoDB and PostgreSQL\n- Take part in the on-call rotation for your services',
    requirements: '- 3+ years of backend experience\n- Strong Node.js and SQL/NoSQL skills\n- Experience with cloud infrastructure (AWS or GCP)',
  },
  {
    title: 'DevOps Engineer', department: 'Engineering', location: 'Addis Ababa, Ethiopia', remotePolicy: 'hybrid',
    employmentType: 'full_time', salaryMin: 75000, salaryMax: 115000, currency: 'USD', publishedAt: ago(8),
    mustHaveSkills: ['Docker', 'Kubernetes | K8s', 'CI/CD'], niceToHaveSkills: ['Terraform', 'AWS', 'Prometheus'],
    minYearsExperience: 3, screeningQuestions: [WORK_AUTH, yearsQuestion(3), NOTICE],
    description: 'Help us run a reliable platform for customers in 30 countries. You will own our build pipelines, infrastructure as code and observability.',
    responsibilities: '- Run and improve our Kubernetes clusters\n- Automate builds, tests and deployments\n- Set up monitoring, alerting and incident reviews',
    requirements: '- 3+ years in DevOps or SRE roles\n- Hands-on Docker and Kubernetes experience\n- Comfortable with Linux and scripting',
  },
  {
    title: 'Product Designer', department: 'Design', location: 'London, UK', remotePolicy: 'hybrid',
    employmentType: 'full_time', salaryMin: 65000, salaryMax: 85000, currency: 'GBP', publishedAt: ago(10),
    mustHaveSkills: ['Figma', 'Prototyping', 'User research'], niceToHaveSkills: ['Mobile', 'Design systems'],
    description: 'We are hiring a Product Designer to shape the end-to-end experience of our mobile driver app. You will run discovery, prototype ideas, and partner with engineers to bring them to life.',
    responsibilities: '- Run user research with drivers and dispatchers\n- Produce wireframes, prototypes and high-fidelity designs\n- Contribute to the design system',
    requirements: '- A portfolio showing product design work\n- Proficiency in Figma\n- Experience designing for mobile',
  },
  {
    title: 'Customer Success Manager', department: 'Customer Success', location: 'Addis Ababa, Ethiopia', remotePolicy: 'onsite',
    employmentType: 'full_time', publishedAt: ago(5),
    mustHaveSkills: ['Customer success | Account management', 'Onboarding'], niceToHaveSkills: ['Salesforce', 'SaaS'],
    description: 'Help our largest customers get the most out of Acme. You will onboard new accounts, run quarterly business reviews, and be the voice of the customer inside the company.',
    responsibilities: '- Own a portfolio of enterprise accounts\n- Drive adoption and renewals\n- Partner with product on feedback',
    requirements: '- 2+ years in customer success or account management\n- Excellent communication skills\n- Comfortable with data and spreadsheets',
  },
  {
    title: 'Data Analyst', department: 'Operations', location: 'Addis Ababa, Ethiopia', remotePolicy: 'hybrid',
    employmentType: 'contract', publishedAt: ago(3),
    mustHaveSkills: ['SQL', 'Excel | Spreadsheets'], niceToHaveSkills: ['Python', 'Metabase | Looker | Power BI'],
    description: 'A six-month contract to help us build reporting on fleet performance and customer health for the leadership team.',
    responsibilities: '- Build dashboards\n- Define and document key metrics\n- Answer ad-hoc questions from leadership',
    requirements: '- Strong SQL\n- Experience with a BI tool such as Metabase, Looker or Power BI',
  },
  {
    title: 'Marketing Intern', department: 'Marketing', location: 'Remote — Worldwide', remotePolicy: 'remote',
    employmentType: 'internship', publishedAt: ago(1),
    description: 'A 12-week paid internship working alongside our marketing team on content, campaigns and community events.',
    responsibilities: '- Write blog posts and social content\n- Help organise webinars and meetups',
    requirements: '- Currently studying marketing, communications or similar\n- Strong writing skills',
  },
];

await mongoose.connect(process.env.MONGODB_URI);

const company = await getCompany();
const filled = [];
for (const [key, value] of Object.entries(COMPANY)) {
  const current = company[key];
  const empty = Array.isArray(current) ? current.length === 0 : !current || (key === 'name' && current === 'Our Company');
  if (empty) {
    company[key] = value;
    filled.push(key);
  }
}
await company.save();
console.log(filled.length ? `Company: filled ${filled.join(', ')}` : 'Company: already filled in, left unchanged');

const createdBy = (await User.findOne({ role: 'admin', active: true }).select('_id'))?._id;
let added = 0;
for (const job of JOBS) {
  if (await Job.exists({ title: job.title })) continue;
  await Job.create({ ...job, status: 'published', createdBy });
  added++;
}
console.log(`Jobs: added ${added} published, skipped ${JOBS.length - added} that already exist`);

await mongoose.disconnect();
