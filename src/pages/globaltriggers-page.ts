/**
 * Global Triggers reference page
 * Uses shared utilities for common functionality
 */

import {
  initTheme,
  setupSearch,
  setupExpandCollapse,
  setupCopyButtons,
  getElementById,
  querySelectorAllAs,
  escapeHtml,
} from './shared-utils.js';
import rawGlobalTriggersData from '../globalTriggers.json';

interface TriggerEffect {
  effectID: string;
  description: string;
  sValue?: string;
  sValue2?: string;
  fValue?: number;
  xValue?: number;
  yValue?: number;
  delay?: number;
  bValue1?: boolean;
  bValue2?: boolean;
}

interface TriggerFlags {
  triggerImmediatelyOnEnteringZone?: boolean;
  disableOnZoneEntry?: boolean;
  triggerForEveryStepInArea?: boolean;
  triggerOnPlayerActorOnly?: boolean;
  travelModeOnly?: boolean;
}

interface GlobalTrigger {
  name: string;
  summary: string;
  whenFired: string;
  effects: TriggerEffect[];
  notes?: string;
  flags?: TriggerFlags;
  requirementFormula?: string;
  triggeredByElement?: string[];
}

const EFFECTS_OPEN_BY_DEFAULT_LIMIT = 5;

const globalTriggersData = rawGlobalTriggersData as GlobalTrigger[];

export function initGlobaltriggersApp(): void {
  if (!document.getElementById('globaltriggersList')) return;

  initTheme();

  const sortedTriggers = [...globalTriggersData].sort((a, b) => a.name.localeCompare(b.name));

  let filteredTriggers = sortedTriggers;

  const search = setupSearch({
    searchInputId: 'searchInput',
    clearButtonId: 'clearSearch',
    highlightToggleId: 'highlightToggle',
    onSearch: searchTerm => {
      filteredTriggers = applyFilters(searchTerm);
      renderTriggers(filteredTriggers, search.highlightMatch);
      updateCount(filteredTriggers.length, sortedTriggers.length);
    },
  });

  function applyFilters(searchTerm: string): GlobalTrigger[] {
    if (!searchTerm) return sortedTriggers;
    return sortedTriggers.filter(t => searchTrigger(t, searchTerm));
  }

  setupExpandCollapse('.globaltrigger-item', 'expandAll', 'collapseAll');

  setupCopyButtons('#globaltriggersList');

  renderTriggers(filteredTriggers, search.highlightMatch);
  updateCount(filteredTriggers.length, sortedTriggers.length);

  const versionElement = document.getElementById('triggerVersion');
  if (versionElement) {
    versionElement.textContent = `${sortedTriggers.length} triggers documented`;
  }

  // Deep linking via ?trigger=...
  const urlParams = new URLSearchParams(window.location.search);
  const triggerParam = urlParams.get('trigger');
  if (triggerParam) {
    openAndScrollTo(triggerParam);
  }

  function openAndScrollTo(name: string): void {
    const elements = querySelectorAllAs(
      `.globaltrigger-item[data-trigger-name="${cssAttrEscape(name)}"]`,
      HTMLDetailsElement
    );
    if (elements.length === 0) return;
    elements.forEach(el => {
      el.open = true;
    });
    setTimeout(() => {
      elements[0]!.scrollIntoView({ behavior: 'smooth', block: 'start' });
      elements.forEach(el => {
        el.classList.add('globaltrigger-highlight');
        setTimeout(() => el.classList.remove('globaltrigger-highlight'), 2000);
      });
    }, 100);
  }

  function searchTrigger(t: GlobalTrigger, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();
    if (t.name.toLowerCase().includes(term)) return true;
    if (t.summary.toLowerCase().includes(term)) return true;
    if (t.whenFired.toLowerCase().includes(term)) return true;
    if (t.notes && t.notes.toLowerCase().includes(term)) return true;
    if (t.requirementFormula && t.requirementFormula.toLowerCase().includes(term)) return true;
    if (t.triggeredByElement && t.triggeredByElement.some(e => e.toLowerCase().includes(term))) return true;
    if (t.flags) {
      const flagKeys = Object.keys(t.flags);
      if (flagKeys.some(k => k.toLowerCase().includes(term))) return true;
    }
    if (
      t.effects.some(
        e =>
          e.effectID.toLowerCase().includes(term) ||
          e.description.toLowerCase().includes(term) ||
          (e.sValue && e.sValue.toLowerCase().includes(term)) ||
          (e.sValue2 && e.sValue2.toLowerCase().includes(term))
      )
    ) {
      return true;
    }
    return false;
  }

  function renderTriggers(triggers: GlobalTrigger[], highlightMatch: (text: string) => string): void {
    const list = getElementById('globaltriggersList');

    if (triggers.length === 0) {
      list.innerHTML = '<p class="placeholder">No global triggers match your search.</p>';
      return;
    }

    // Preserve open state across re-renders (both trigger items and effects sub-details)
    const openStates = new Map<string, boolean>();
    querySelectorAllAs('.globaltrigger-item', HTMLDetailsElement, list).forEach(item => {
      const name = item.getAttribute('data-trigger-name');
      if (name) openStates.set(`trigger:${name}`, item.open);
    });
    querySelectorAllAs('.effects-details', HTMLDetailsElement, list).forEach(item => {
      const name = item.getAttribute('data-trigger-name');
      if (name) openStates.set(`effects:${name}`, item.open);
    });

    list.innerHTML = triggers.map(t => renderTrigger(t, highlightMatch)).join('');

    querySelectorAllAs('.globaltrigger-item', HTMLDetailsElement, list).forEach(item => {
      const name = item.getAttribute('data-trigger-name');
      const key = name ? `trigger:${name}` : null;
      if (key && openStates.has(key)) {
        item.open = openStates.get(key)!;
      }
    });
    querySelectorAllAs('.effects-details', HTMLDetailsElement, list).forEach(item => {
      const name = item.getAttribute('data-trigger-name');
      const key = name ? `effects:${name}` : null;
      if (key && openStates.has(key)) {
        item.open = openStates.get(key)!;
      }
    });
  }

  function renderTrigger(t: GlobalTrigger, highlight: (text: string) => string): string {
    const triggerUrl = `${window.location.origin}${window.location.pathname}?trigger=${encodeURIComponent(t.name)}`;
    const issueTitle = encodeURIComponent(`[GlobalTrigger Documentation] Issue with "${t.name}"`);
    const issueBody = encodeURIComponent(
      `**Trigger Name:** \`${t.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this trigger's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;

    const propertyRows: string[] = [];
    if (t.flags) {
      for (const [key, value] of Object.entries(t.flags)) {
        if (typeof value === 'boolean') {
          const valueClass = value ? 'props-value-true' : 'props-value-false';
          propertyRows.push(
            `<tr><td class="props-key">${highlight(key)}</td><td class="props-value ${valueClass}">${value}</td></tr>`
          );
        }
      }
    }
    if (t.triggeredByElement && t.triggeredByElement.length > 0) {
      const elements = t.triggeredByElement
        .map(el => `<code>${highlight(el)}</code>`)
        .join(', ');
      propertyRows.push(
        `<tr><td class="props-key">triggeredByElement</td><td class="props-value">${elements}</td></tr>`
      );
    }
    if (t.requirementFormula) {
      propertyRows.push(
        `<tr><td class="props-key">requirementFormula</td><td class="props-value"><code class="formula-code">${highlight(t.requirementFormula)}</code></td></tr>`
      );
    }

    const propertiesTable =
      propertyRows.length > 0
        ? `<table class="props-table"><tbody>${propertyRows.join('')}</tbody></table>`
        : '';

    const infoSections: string[] = [];

    infoSections.push(
      renderInfoSection('When Fired', `<div class="notes-content">${highlight(t.whenFired)}</div>`)
    );

    infoSections.push(renderEffectsSection(t, highlight));

    if (t.notes) {
      infoSections.push(
        renderInfoSection('Notes', `<div class="notes-content">${highlight(t.notes)}</div>`)
      );
    }

    return `
      <details class="globaltrigger-item" data-trigger-name="${escapeHtml(t.name)}">
        <summary class="globaltrigger-summary">
          <span class="globaltrigger-name">${highlight(t.name)}</span>
          <span class="globaltrigger-brief">${highlight(t.summary)}</span>
        </summary>
        <div class="globaltrigger-details">
          <div class="globaltrigger-header-row">
            <div class="globaltrigger-description">${highlight(t.summary)}</div>
            <button class="copy-name-btn" data-name="${escapeHtml(t.name)}" title="Copy name">📋</button>
            <button class="copy-link-btn" data-url="${triggerUrl}" title="Copy link to this trigger">🔗</button>
          </div>

          ${propertiesTable}

          <div class="globaltrigger-info-sections">
            ${infoSections.join('')}
          </div>

          <div class="globaltrigger-disclaimer">
            Documentation for global triggers is generated from a mix of source-code analysis and AI summarization. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>`;
  }

  function renderEffectsSection(t: GlobalTrigger, highlight: (text: string) => string): string {
    const count = t.effects.length;
    const openAttr = count <= EFFECTS_OPEN_BY_DEFAULT_LIMIT ? ' open' : '';

    if (count === 0) {
      return `
        <details class="effects-details" data-trigger-name="${escapeHtml(t.name)}"${openAttr}>
          <summary class="effects-summary">
            Effects
            <span class="effects-count-pill">0</span>
          </summary>
          <p class="no-effects">No built-in effects; this trigger is a hook for mods or other triggers.</p>
        </details>`;
    }

    const rows = t.effects.map((e, i) => renderEffect(e, i, highlight)).join('');

    return `
      <details class="effects-details" data-trigger-name="${escapeHtml(t.name)}"${openAttr}>
        <summary class="effects-summary">
          Effects
          <span class="effects-count-pill">${count}</span>
        </summary>
        <ul class="effects-list">${rows}</ul>
      </details>`;
  }

  function renderEffect(e: TriggerEffect, index: number, highlight: (text: string) => string): string {
    const params: string[] = [];
    const addParam = (key: string, value: string): void => {
      params.push(
        `<span class="effect-param"><span class="effect-param-key">${key}</span>=<span class="effect-param-value">${value}</span></span>`
      );
    };
    if (e.sValue !== undefined) addParam('sValue', highlight(e.sValue));
    if (e.sValue2 !== undefined) addParam('sValue2', highlight(e.sValue2));
    if (e.fValue !== undefined) addParam('fValue', highlight(String(e.fValue)));
    if (e.xValue !== undefined) addParam('xValue', highlight(String(e.xValue)));
    if (e.yValue !== undefined) addParam('yValue', highlight(String(e.yValue)));
    if (e.delay !== undefined) addParam('delay', highlight(String(e.delay)));
    if (e.bValue1 !== undefined) addParam('bValue1', highlight(String(e.bValue1)));
    if (e.bValue2 !== undefined) addParam('bValue2', highlight(String(e.bValue2)));

    return `
      <li class="effect-item">
        <div class="effect-header">
          <span class="effect-index">#${index + 1}</span>
          <code class="effect-id">${highlight(e.effectID)}</code>
        </div>
        ${params.length > 0 ? `<div class="effect-params">${params.join('')}</div>` : ''}
        <div class="effect-description">${highlight(e.description)}</div>
      </li>`;
  }

  function renderInfoSection(title: string, contentHtml: string): string {
    return `
      <div class="info-section">
        <h4 class="info-header">${title}</h4>
        <div class="info-content">${contentHtml}</div>
      </div>`;
  }

  function updateCount(showing: number, total: number): void {
    const count = getElementById('globaltriggerCount');
    count.textContent = showing === total ? `${total} triggers` : `${showing} / ${total} triggers`;
  }
}

function cssAttrEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

initGlobaltriggersApp();
