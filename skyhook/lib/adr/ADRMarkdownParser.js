/**
 * Bi-Directional ADR Markdown Parser & Serializer
 * Parses standard ADR Markdown into structured objects and serializes them back.
 */

import crypto from 'crypto';

/**
 * Compute a SHA-256 hash of markdown content
 */
export function computeContentHash(content) {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Parse an ADR markdown string into a structured object
 * @param {string} markdown - The markdown content
 * @returns {Object} Structured decision object
 */
export function parseADRMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return null;
  }

  const result = {
    id: null,
    title: '',
    status: 'proposed',
    category: 'architecture',
    date: '',
    author: '',
    context: '',
    decision: '',
    consequences: { positive: [], negative: [], neutral: [] },
    alternatives: [],
    relatedRequirements: [],
    relatedDecisions: [],
    enforcement: null,
    diagrams: [],
    implementationNotes: '',
    validationCriteria: [],
    contentHash: computeContentHash(markdown)
  };

  // Title: # Decision: <title> or # <title>
  const titleMatch = markdown.match(/^#\s+(?:Decision:\s*)?([^\n\r]+)/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Metadata headers: **Key**: Value
  const idMatch = markdown.match(/\*\*ID\*\*:\s*([^\n\r]+)/i);
  if (idMatch) result.id = idMatch[1].trim();

  const statusMatch = markdown.match(/\*\*Status\*\*:\s*([^\n\r]+)/i);
  if (statusMatch) result.status = statusMatch[1].trim().toLowerCase();

  const categoryMatch = markdown.match(/\*\*Category\*\*:\s*([^\n\r]+)/i);
  if (categoryMatch) result.category = categoryMatch[1].trim().toLowerCase();

  const dateMatch = markdown.match(/\*\*Date\*\*:\s*([^\n\r]+)/i);
  if (dateMatch) result.date = dateMatch[1].trim();

  const authorMatch = markdown.match(/\*\*Author\*\*:\s*([^\n\r]+)/i);
  if (authorMatch) result.author = authorMatch[1].trim();

  // Helper to extract a section between ## SectionName and next ## or end of file
  function extractSection(headingRegex) {
    const start = markdown.search(headingRegex);
    if (start === -1) return '';
    const afterHeading = markdown.substring(start).replace(headingRegex, '');
    const nextSection = afterHeading.search(/\n##\s+/);
    const content = nextSection === -1 ? afterHeading : afterHeading.substring(0, nextSection);
    return content.trim();
  }

  // Context
  result.context = extractSection(/\n##\s+Context\b[^\n]*/i);

  // Decision
  result.decision = extractSection(/\n##\s+Decision\b[^\n]*/i);

  // Implementation Notes
  result.implementationNotes = extractSection(/\n##\s+Implementation Notes\b[^\n]*/i);

  // Consequences
  const consequencesSection = extractSection(/\n##\s+Consequences\b[^\n]*/i);
  if (consequencesSection) {
    result.consequences = parseConsequences(consequencesSection);
  }

  // Alternatives Considered
  const alternativesSection = extractSection(/\n##\s+Alternatives Considered\b[^\n]*/i);
  if (alternativesSection) {
    result.alternatives = parseAlternativesTable(alternativesSection);
  }

  // Related Requirements
  const reqsSection = extractSection(/\n##\s+Related Requirements\b[^\n]*/i);
  if (reqsSection) {
    const reqMatches = [...reqsSection.matchAll(/-\s+\*\*([A-Za-z0-9_-]+)\*\*:\s*([^\n\r]+)/g)];
    result.relatedRequirements = reqMatches.map(m => m[1].trim());
  }

  // Related Decisions
  const decisionsSection = extractSection(/\n##\s+Related Decisions\b[^\n]*/i);
  if (decisionsSection) {
    const decMatches = [...decisionsSection.matchAll(/-\s+\*\*([A-Za-z0-9_-]+)\*\*:\s*([^\n\r]+)/g)];
    result.relatedDecisions = decMatches.map(m => m[1].trim());
  }

  // Validation Criteria
  const criteriaSection = extractSection(/\n##\s+Validation Criteria\b[^\n]*/i);
  if (criteriaSection) {
    const items = criteriaSection.split('\n')
      .map(l => l.replace(/^-\s+\[[ xX]\]\s*/, '').trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));
    result.validationCriteria = items;
  }

  // Extract Mermaid Diagrams
  const mermaidMatches = [...markdown.matchAll(/```mermaid\s+([\s\S]*?)```/g)];
  result.diagrams = mermaidMatches.map(m => m[1].trim());

  // Extract Enforcement Rules block (if present)
  const enforcementMatch = markdown.match(/```(?:yaml|json):enforcement\s+([\s\S]*?)```/);
  if (enforcementMatch) {
    try {
      result.enforcement = JSON.parse(enforcementMatch[1].trim());
    } catch {
      result.enforcement = { raw: enforcementMatch[1].trim() };
    }
  }

  return result;
}

/**
 * Parse consequences section into positive, negative, neutral
 */
function parseConsequences(sectionText) {
  const consequences = { positive: [], negative: [], neutral: [] };

  function parseBullets(text) {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*'))
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .filter(line => line.length > 0 && !line.startsWith('('));
  }

  const posMatch = sectionText.match(/###\s+Positive\b([\s\S]*?)(?=###|$)/i);
  if (posMatch) consequences.positive = parseBullets(posMatch[1]);

  const negMatch = sectionText.match(/###\s+Negative\b([\s\S]*?)(?=###|$)/i);
  if (negMatch) consequences.negative = parseBullets(negMatch[1]);

  const neuMatch = sectionText.match(/###\s+(?:Neutral|Risks)\b([\s\S]*?)(?=###|$)/i);
  if (neuMatch) consequences.neutral = parseBullets(neuMatch[1]);

  return consequences;
}

/**
 * Parse markdown table of alternatives
 */
function parseAlternativesTable(sectionText) {
  const alternatives = [];
  const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));

  if (lines.length < 3) return alternatives;

  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cols.length >= 1 && cols[0] && !cols[0].toLowerCase().includes('no alternatives')) {
      alternatives.push({
        name: cols[0] || '',
        description: cols[1] || '',
        pros: cols[2] ? cols[2].split(';').map(p => p.trim()).filter(Boolean) : [],
        cons: cols[3] ? cols[3].split(';').map(c => c.trim()).filter(Boolean) : []
      });
    }
  }

  return alternatives;
}
