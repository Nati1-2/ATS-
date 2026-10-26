import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { fixCv, parseFix, cvToDocx } from '../src/utils/cvFixer.js';
import { resetModelHealth } from '../src/utils/ai.js';

const answer = { improvedCv: 'Abebe Kebede\nSummary\nFrontend developer.\nExperience\n- Built React apps used by [number of users]', changes: [{ area: 'Impact', change: 'Added a result to each bullet' }], stillMissing: ['[number of users]: how many people use the app'] };

test('only the chosen fixes, confirmed skills and notes are sent; the CV is untrusted data', async () => {
  resetModelHealth();
  let sent;
  const r = await fixCv(
    { text: 'Abebe\nExperience\n- Worked on React apps', items: ['No measurable results — add numbers'], skills: ['TypeScript'], notes: 'Used by 3,000 people' },
    { generate: async (req) => ((sent = req), { text: JSON.stringify(answer) }) }
  );
  assert.equal(r.status, 'done');
  assert.equal(r.result.stillMissing.length, 1);
  const prompt = sent.contents[0].parts.map((p) => p.text).join('\n');
  assert.match(prompt, /1\. No measurable results/);
  assert.match(prompt, /confirmed they have: TypeScript/);
  assert.match(prompt, /<<<NOTES\nUsed by 3,000 people\nNOTES>>>/);
  assert.match(prompt, /<<<CV\n/);
  assert.match(sent.config.systemInstruction, /Never invent/);
});

test('a CV with no text is not sent to the AI', async () => {
  let called = false;
  const r = await fixCv({ text: '', items: ['x'] }, { generate: async () => ((called = true), {}) });
  assert.equal(r.status, 'failed');
  assert.equal(called, false);
});

test('empty or broken AI answers are rejected', () => {
  assert.throws(() => parseFix('not json'));
  assert.throws(() => parseFix(JSON.stringify({ improvedCv: '  ', changes: [], stillMissing: [] })));
  assert.equal(parseFix(JSON.stringify(answer)).changes[0].area, 'Impact');
});

test('the improved CV downloads as a Word file with bold headings and bullets', async () => {
  const zip = await JSZip.loadAsync(await cvToDocx('Abebe <Kebede>\nExperience\n- Built apps & tools'));
  const doc = await zip.file('word/document.xml').async('string');
  assert.match(doc, /Abebe &lt;Kebede&gt;/);
  assert.match(doc, /<w:b\/><w:sz w:val="26"\/><\/w:rPr><w:t xml:space="preserve">Experience/);
  assert.match(doc, /• Built apps &amp; tools/);
});

test('facts the candidate gave are never left as placeholders', async () => {
  const { unbracketKnownFacts } = await import('../src/utils/cvFixer.js');
  const r = unbracketKnownFacts({ improvedCv: 'Used by [3,000] staff, cut costs by [X%]', changes: [], stillMissing: ['[3,000]', '[X%]: the saving'] }, 'Used by about 3,000 staff');
  assert.equal(r.improvedCv, 'Used by 3,000 staff, cut costs by [X%]');
  assert.deepEqual(r.stillMissing, ['[X%]: the saving']);
});
