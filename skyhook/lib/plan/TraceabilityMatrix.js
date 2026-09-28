/**
 * Traceability Matrix
 * Generates an executive cross-domain correlation table linking
 * Requirements ➔ Stories ➔ Code Symbols ➔ Architecture Decisions (ADRs).
 */

export class TraceabilityMatrix {
  /**
   * Generate the Markdown Traceability Matrix table
   * @param {Object} data - { functionalReqs, nonFunctionalReqs, backlog, decisions, symbols }
   * @returns {string} Markdown table string
   */
  static generate(data = {}) {
    const funcReqs = (data.functionalReqs?.requirements) || [];
    const nonFuncReqs = (data.nonFunctionalReqs?.requirements) || [];
    const allReqs = [...funcReqs, ...nonFuncReqs];

    if (allReqs.length === 0) {
      return '*No requirements defined yet.*';
    }

    const stories = data.backlog?.stories || [];
    const decisions = data.decisions?.decisions || [];
    const symbols = data.symbols || [];

    let md = '| Req ID | Requirement Title | Category | Stories | Code Symbols | ADRs | Status |\n';
    md += '|:-------|:------------------|:---------|:--------|:-------------|:-----|:-------|\n';

    for (const req of allReqs) {
      const id = req.id || 'REQ-?';
      const title = (req.title || req.userStory || 'Untitled').replace(/\|/g, '-');
      const category = req.category || 'functional';

      // Find linked stories
      const linkedStories = stories.filter(s => 
        (s.relatedRequirements && s.relatedRequirements.includes(id)) || s.title?.includes(id)
      );
      const storiesStr = linkedStories.length
        ? linkedStories.map(s => `${s.id} (${s.status})`).join('<br/>')
        : '—';

      // Find linked ADRs
      const linkedADRs = decisions.filter(d => 
        (d.relatedRequirements && d.relatedRequirements.includes(id)) || d.title?.includes(id)
      );
      const adrsStr = linkedADRs.length
        ? linkedADRs.map(d => `${d.id}`).join('<br/>')
        : '—';

      // Find traced code symbols
      const tracedSymbols = symbols.filter(s => s.traced && s.requirementId === id);
      const symbolsStr = tracedSymbols.length
        ? tracedSymbols.slice(0, 3).map(s => `\`${s.symbolName}\``).join('<br/>')
        : '—';

      // Determine composite status
      let statusBadge = '🔴 Untraced';
      if (tracedSymbols.length > 0) {
        statusBadge = '🟢 Implemented';
      } else if (linkedStories.some(s => s.status === 'in-progress' || s.status === 'in-review')) {
        statusBadge = '🟡 In-Progress';
      } else if (linkedStories.some(s => s.status === 'ready')) {
        statusBadge = '⚪ Ready';
      }

      md += `| **${id}** | ${title} | \`${category}\` | ${storiesStr} | ${symbolsStr} | ${adrsStr} | ${statusBadge} |\n`;
    }

    return md;
  }
}
