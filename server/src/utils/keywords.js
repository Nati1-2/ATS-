/**
 * Keyword matching shared by the ATS rating and the AI review: words are compared by a light stem, as ATSs
 * match "dashboards" to "dashboard", "analysed" to "analyze" and "managing" to "manage".
 */
export const TOKEN = /[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]/g;
// Phrases never cross a sentence or list boundary
// "Front-end" and "frontend" are one word, not "front" + "end"
export const segments = (text) => String(text || '').toLowerCase().replace(/([a-z])-(?=[a-z])/g, '$1').split(/[.,;:!?()[\]\n/•|]+/);

/**
 * Light stemming. Terms with symbols or digits ("node.js", "c++", "s3") are kept as they are.
 */
export function stem(word) {
  let w = word;
  if (w.length <= 3 || /[^a-z]/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (/(?:ches|shes|xes|sses)$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  w = w.replace(/i[sz](?:ation|e)$/, 'iz').replace(/(?:ation|e)$/, '');
  // planned → plan, but keep "skill", "process", "staff"
  if (/([b-df-hj-km-np-tv-z])\1$/.test(w) && !/(?:ll|ss|ff|zz)$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** The CV as stemmed word sequences, one per sentence or list item. */
export const stemIndex = (text) => segments(text).map((seg) => (seg.match(TOKEN) || []).map(stem));

/** Whether every word of `term` appears in this order, next to each other, within one sentence of the CV. */
export function hasTerm(index, term) {
  const want = (String(term).toLowerCase().match(TOKEN) || []).map(stem);
  if (!want.length) return false;
  return index.some((words) => words.some((_, i) => want.every((w, k) => words[i + k] === w)));
}
