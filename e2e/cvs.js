/** Builds realistic test CVs on the fly (PDF, DOCX, TXT, RTF) so the suite has no binary fixtures. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-e2e-cvs-'));

export function pdf(name, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 11 Tf 60 ${740 - i * 18} Td (${esc(l)}) Tj ET`).join('\n');
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
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return write(name, Buffer.from(out, 'latin1'));
}

export async function docx(name, lines) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const body = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return write(name, await zip.generateAsync({ type: 'nodebuffer' }));
}

export const txt = (name, lines) => write(name, Buffer.from(lines.join('\n'), 'utf8'));

export const rtf = (name, lines) => write(name, Buffer.from(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs22 ${lines.map((l) => l.replace(/[\\{}]/g, (c) => `\\${c}`)).join('\\par\n')}\\par}`, 'latin1'));

/** An image-only "scanned" PDF has no text layer: a valid PDF with an empty page. */
export const blankPdf = (name) => write(name, Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n'));

function write(name, buf) {
  const file = path.join(DIR, name);
  fs.writeFileSync(file, buf);
  return file;
}

// Ready-made candidates
export const strongCloudCv = () =>
  docx('selam-girma.docx', [
    'Selam Girma', 'Cloud Engineer', 'Experience', 'Cloud Engineer, Ethio Telecom (Jan 2019 - Present)',
    'Ran Kubernetes clusters on AWS, provisioned with Terraform; monitoring with Prometheus; tooling in Go.',
    'Skills', 'Kubernetes, Terraform, AWS, Prometheus, Go',
  ]);
export const weakCloudCv = () => pdf('abel-tadesse.pdf', ['Abel Tadesse', 'Skills: Terraform, Linux, Bash']);
export const strongFrontendCv = () =>
  docx('hanna-bekele.docx', [
    'Hanna Bekele', 'Frontend Developer', 'Experience', 'Senior Frontend Developer, Chapa (Feb 2019 - Present)',
    'Built the merchant dashboard in React and TypeScript, CSS modules, Next.js, WCAG accessibility.',
    'Education', 'BSc Software Engineering, Addis Ababa Institute of Technology', 'Skills', 'React, TypeScript, CSS, Next.js, Accessibility',
  ]);
export const frontendLines = [
  'Meron Assefa', 'Senior Frontend Developer', 'Experience', 'Senior Frontend Developer, Kifiya (2020 - Present)',
  'Built accessible design systems in React and TypeScript with modern CSS and Next.js.',
  'Education', 'BSc Computer Science, Addis Ababa University', 'Skills', 'React, TypeScript, CSS, Next.js',
];
