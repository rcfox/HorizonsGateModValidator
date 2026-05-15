/**
 * Global Variables reference page
 * Uses shared utilities for common functionality
 */

import {
  initTheme,
  setupSearch,
  setupExpandCollapse,
  setupCopyButtons,
  getElementById,
  getElementByIdAs,
  querySelectorAllAs,
  escapeHtml,
} from './shared-utils.js';
import rawGlobalvarsData from '../globalvars.json';

interface SetByEntry {
  where: string;
  op?: string;
  note?: string;
}

interface ReadByEntry {
  where: string;
  note?: string;
}

interface ParamEntry {
  name: string;
  type: string;
  note?: string;
}

interface GlobalVar {
  name: string;
  description: string;
  valueShape: string;
  lifetime: string;
  category: string;
  baseValue?: number;
  modKind?: string;
  idType?: string;
  enumValues?: string[];
  isTemplate?: boolean;
  params?: ParamEntry[];
  setBy: SetByEntry[];
  readBy: ReadByEntry[];
  related?: string[];
  notes?: string;
}

const globalvarsData = rawGlobalvarsData as GlobalVar[];

export function initGlobalvarsApp(): void {
  // Check if we're on the globalvars page
  if (!document.getElementById('globalvarsList')) return;

  // Theme management
  initTheme();

  // Sort alphabetically, but place template entries (names starting with '{') after regular names
  const sortedVars = [...globalvarsData].sort((a, b) => {
    const aTemplate = a.name.startsWith('{') ? 1 : 0;
    const bTemplate = b.name.startsWith('{') ? 1 : 0;
    if (aTemplate !== bTemplate) return aTemplate - bTemplate;
    return a.name.localeCompare(b.name);
  });

  // Build a set of known names so we can decide which 'related' entries to linkify
  const knownNames = new Set(sortedVars.map(v => v.name));

  // Populate category filter
  const categoryFilter = getElementByIdAs('categoryFilter', HTMLSelectElement);
  const categories = [...new Set(sortedVars.map(v => v.category))].sort();
  for (const cat of categories) {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  }

  let categoryFilterValue = '';
  let filteredVars = sortedVars;

  function applyFilters(searchTerm: string): GlobalVar[] {
    let result = sortedVars;
    if (categoryFilterValue) {
      result = result.filter(v => v.category === categoryFilterValue);
    }
    if (searchTerm) {
      result = result.filter(v => searchGlobalVar(v, searchTerm));
    }
    return result;
  }

  // Setup search
  const search = setupSearch({
    searchInputId: 'searchInput',
    clearButtonId: 'clearSearch',
    highlightToggleId: 'highlightToggle',
    onSearch: searchTerm => {
      filteredVars = applyFilters(searchTerm);
      renderGlobalvars(filteredVars, search.highlightMatch);
      updateCount(filteredVars.length, sortedVars.length);
    },
  });

  // Setup category filter
  categoryFilter.addEventListener('change', () => {
    categoryFilterValue = categoryFilter.value;
    filteredVars = applyFilters(search.searchTerm);
    renderGlobalvars(filteredVars, search.highlightMatch);
    updateCount(filteredVars.length, sortedVars.length);
  });

  // Setup expand/collapse
  setupExpandCollapse('.globalvar-item', 'expandAll', 'collapseAll');

  // Setup copy buttons
  setupCopyButtons('#globalvarsList');

  // Initial render
  renderGlobalvars(filteredVars, search.highlightMatch);
  updateCount(filteredVars.length, sortedVars.length);

  // No gameVersion in globalvars.json; hide or label the element if present
  const gameVersionElement = document.getElementById('gameVersion');
  if (gameVersionElement) {
    gameVersionElement.textContent = `${sortedVars.length} variables documented`;
  }

  // Handle deep linking via ?var=...
  const urlParams = new URLSearchParams(window.location.search);
  const varParam = urlParams.get('var');
  if (varParam) {
    openAndScrollTo(varParam);
  }

  // Intercept clicks on related links so we open + scroll within the page
  const globalvarsList = getElementById('globalvarsList');
  globalvarsList.addEventListener('click', e => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest('a.related-link');
    if (!link) return;
    e.preventDefault();
    const name = link.getAttribute('data-name');
    if (!name) return;
    const url = new URL(window.location.href);
    url.searchParams.set('var', name);
    window.history.replaceState({}, '', url.toString());
    openAndScrollTo(name);
  });

  function openAndScrollTo(name: string): void {
    const elements = querySelectorAllAs(
      `.globalvar-item[data-globalvar-name="${cssAttrEscape(name)}"]`,
      HTMLDetailsElement
    );
    if (elements.length === 0) return;
    elements.forEach(el => {
      el.open = true;
    });
    setTimeout(() => {
      elements[0]!.scrollIntoView({ behavior: 'smooth', block: 'start' });
      elements.forEach(el => {
        el.classList.add('globalvar-highlight');
        setTimeout(() => el.classList.remove('globalvar-highlight'), 2000);
      });
    }, 100);
  }

  function searchGlobalVar(v: GlobalVar, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();
    if (v.name.toLowerCase().includes(term)) return true;
    if (v.description.toLowerCase().includes(term)) return true;
    if (v.valueShape.toLowerCase().includes(term)) return true;
    if (v.lifetime.toLowerCase().includes(term)) return true;
    if (v.category.toLowerCase().includes(term)) return true;
    if (v.idType && v.idType.toLowerCase().includes(term)) return true;
    if (v.modKind && v.modKind.toLowerCase().includes(term)) return true;
    if (v.notes && v.notes.toLowerCase().includes(term)) return true;
    if (v.enumValues && v.enumValues.some(e => e.toLowerCase().includes(term))) return true;
    if (v.related && v.related.some(r => r.toLowerCase().includes(term))) return true;
    if (
      v.params &&
      v.params.some(
        p =>
          p.name.toLowerCase().includes(term) ||
          p.type.toLowerCase().includes(term) ||
          (p.note && p.note.toLowerCase().includes(term))
      )
    ) {
      return true;
    }
    if (
      v.setBy.some(
        s =>
          s.where.toLowerCase().includes(term) ||
          (s.op && s.op.toLowerCase().includes(term)) ||
          (s.note && s.note.toLowerCase().includes(term))
      )
    ) {
      return true;
    }
    if (
      v.readBy.some(
        r => r.where.toLowerCase().includes(term) || (r.note && r.note.toLowerCase().includes(term))
      )
    ) {
      return true;
    }
    return false;
  }

  function renderGlobalvars(vars: GlobalVar[], highlightMatch: (text: string) => string): void {
    const list = getElementById('globalvarsList');

    if (vars.length === 0) {
      list.innerHTML = '<p class="placeholder">No global variables match your search.</p>';
      return;
    }

    // Preserve open state across re-renders
    const openStates = new Map<string, boolean>();
    querySelectorAllAs('.globalvar-item', HTMLDetailsElement, list).forEach(item => {
      const name = item.getAttribute('data-globalvar-name');
      if (name) openStates.set(name, item.open);
    });

    list.innerHTML = vars.map(v => renderGlobalvar(v, highlightMatch)).join('');

    querySelectorAllAs('.globalvar-item', HTMLDetailsElement, list).forEach(item => {
      const name = item.getAttribute('data-globalvar-name');
      if (name && openStates.has(name)) {
        item.open = openStates.get(name)!;
      }
    });
  }

  function renderGlobalvar(v: GlobalVar, highlight: (text: string) => string): string {
    const varUrl = `${window.location.origin}${window.location.pathname}?var=${encodeURIComponent(v.name)}`;
    const issueTitle = encodeURIComponent(`[GlobalVar Documentation] Issue with "${v.name}"`);
    const issueBody = encodeURIComponent(
      `**Variable Name:** \`${v.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this variable's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;

    const badges: string[] = [
      `<span class="badge badge-shape badge-shape-${cssClassEscape(v.valueShape)}">${highlight(v.valueShape)}</span>`,
      `<span class="badge badge-lifetime badge-lifetime-${cssClassEscape(v.lifetime)}">${highlight(v.lifetime)}</span>`,
      `<span class="badge badge-category">${highlight(v.category)}</span>`,
    ];
    if (v.isTemplate) {
      badges.push('<span class="badge badge-template">template</span>');
    }
    if (v.modKind) {
      badges.push(`<span class="badge badge-modkind">${highlight(v.modKind)}</span>`);
    }

    const infoSections: string[] = [];

    if (v.baseValue !== undefined) {
      infoSections.push(renderInfoSection('Base Value', `<code class="info-code">${highlight(String(v.baseValue))}</code>`));
    }

    if (v.idType) {
      infoSections.push(renderInfoSection('ID Type', `<code class="info-code">${highlight(v.idType)}</code>`));
    }

    if (v.enumValues && v.enumValues.length > 0) {
      const enumHtml = v.enumValues
        .map(val => `<code class="info-code enum-value">${val === '' ? '<em>(empty)</em>' : highlight(val)}</code>`)
        .join(' ');
      infoSections.push(renderInfoSection('Enum Values', enumHtml));
    }

    if (v.params && v.params.length > 0) {
      const paramsHtml = `
        <ul class="arguments-list">
          ${v.params
            .map(
              p => `
            <li class="argument-item">
              <div class="argument-header">
                <code class="argument-name">${highlight(p.name)}</code>
                <span class="argument-type">${highlight(p.type)}</span>
              </div>
              ${p.note ? `<span class="argument-description">${highlight(p.note)}</span>` : ''}
            </li>`
            )
            .join('')}
        </ul>`;
      infoSections.push(`
        <div class="info-section">
          <h4 class="info-header">Template Parameters</h4>
          ${paramsHtml}
        </div>`);
    }

    if (v.setBy.length > 0) {
      const rows = v.setBy
        .map(
          s => `
        <li class="ref-item ref-item-set">
          <div class="ref-header">
            <code class="ref-where">${highlight(s.where)}</code>
            ${s.op ? `<span class="ref-op ref-op-${cssClassEscape(s.op)}">${highlight(s.op)}</span>` : ''}
          </div>
          ${s.note ? `<span class="ref-note">${highlight(s.note)}</span>` : ''}
        </li>`
        )
        .join('');
      infoSections.push(`
        <div class="info-section">
          <h4 class="info-header">Set By</h4>
          <ul class="ref-list">${rows}</ul>
        </div>`);
    }

    if (v.readBy.length > 0) {
      const rows = v.readBy
        .map(
          r => `
        <li class="ref-item ref-item-read">
          <div class="ref-header">
            <code class="ref-where">${highlight(r.where)}</code>
          </div>
          ${r.note ? `<span class="ref-note">${highlight(r.note)}</span>` : ''}
        </li>`
        )
        .join('');
      infoSections.push(`
        <div class="info-section">
          <h4 class="info-header">Read By</h4>
          <ul class="ref-list">${rows}</ul>
        </div>`);
    }

    if (v.related && v.related.length > 0) {
      const relatedHtml = v.related
        .map(name => {
          if (knownNames.has(name)) {
            const href = `?var=${encodeURIComponent(name)}`;
            return `<a class="related-link" href="${href}" data-name="${escapeHtml(name)}"><code>${highlight(name)}</code></a>`;
          }
          return `<code class="related-unknown">${highlight(name)}</code>`;
        })
        .join(' ');
      infoSections.push(`
        <div class="info-section">
          <h4 class="info-header">Related</h4>
          <div class="related-list">${relatedHtml}</div>
        </div>`);
    }

    if (v.notes) {
      infoSections.push(`
        <div class="info-section">
          <h4 class="info-header">Notes</h4>
          <div class="info-content notes-content">${highlight(v.notes)}</div>
        </div>`);
    }

    return `
      <details class="globalvar-item" data-globalvar-name="${escapeHtml(v.name)}">
        <summary class="globalvar-summary">
          <span class="globalvar-name">${highlight(v.name)}</span>
          <span class="globalvar-brief">${highlight(v.description)}</span>
        </summary>
        <div class="globalvar-details">
          <div class="globalvar-header-row">
            <div class="globalvar-description">${highlight(v.description)}</div>
            <button class="copy-name-btn" data-name="${escapeHtml(v.name)}" title="Copy name">📋</button>
            <button class="copy-link-btn" data-url="${varUrl}" title="Copy link to this variable">🔗</button>
          </div>

          <div class="globalvar-badges">${badges.join('')}</div>

          <div class="globalvar-info-sections">
            ${infoSections.join('')}
          </div>

          <div class="globalvar-disclaimer">
            Documentation for global variables is generated from a mix of source-code analysis and AI summarization. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>`;
  }

  function renderInfoSection(title: string, contentHtml: string): string {
    return `
      <div class="info-section">
        <h4 class="info-header">${title}</h4>
        <div class="info-content">${contentHtml}</div>
      </div>`;
  }

  function updateCount(showing: number, total: number): void {
    const count = getElementById('globalvarCount');
    count.textContent = showing === total ? `${total} variables` : `${showing} / ${total} variables`;
  }
}

function cssAttrEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function cssClassEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Initialize on page load
initGlobalvarsApp();
