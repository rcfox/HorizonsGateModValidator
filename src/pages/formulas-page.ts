/**
 * Formulas reference page
 * Uses shared utilities for common functionality
 */

import {
  initTheme,
  setupSearch,
  setupExpandCollapse,
  setupCopyButtons,
  getElementById,
  querySelectorAllAs,
} from './shared-utils.js';
import rawFormulasData from '../formula.json';
import rawFormulasDataPrev from '../formula_prev.json';

interface FormulaArgument {
  name: string;
  type: string;
  description: string;
}

interface FormulaUse {
  description: string;
  returns: string;
  example: string;
  arguments?: FormulaArgument[];
  requires?: string[];
}

interface FormulaOperator {
  name: string;
  isFunctionStyle: boolean;
  aliases?: string[];
  uses: FormulaUse[];
}

interface FormulasData {
  gameVersion: string;
  operators: FormulaOperator[];
}

const formulasData = rawFormulasData as FormulasData;
const formulasDataPrev = rawFormulasDataPrev as FormulasData;

const prevOperatorByAlias = new Map<string, FormulaOperator>();
for (const op of formulasDataPrev.operators) {
  prevOperatorByAlias.set(op.name, op);
  if (op.aliases) {
    for (const alias of op.aliases) {
      prevOperatorByAlias.set(alias, op);
    }
  }
}

function findPrevOperator(operator: FormulaOperator): FormulaOperator | undefined {
  const candidates = [operator.name, ...(operator.aliases ?? [])];
  for (const id of candidates) {
    const prev = prevOperatorByAlias.get(id);
    if (prev) return prev;
  }
  return undefined;
}

export function initFormulasApp(): void {
  // Check if we're on the formulas page
  if (!document.getElementById('operatorsList')) return;

  // Theme management
  initTheme();

  // Sort operators alphabetically
  const sortedOperators = [...formulasData.operators].sort((a, b) => a.name.localeCompare(b.name));
  let filteredOperators = sortedOperators;

  // Setup search
  const search = setupSearch({
    searchInputId: 'searchInput',
    clearButtonId: 'clearSearch',
    highlightToggleId: 'highlightToggle',
    onSearch: searchTerm => {
      filteredOperators = searchTerm ? sortedOperators.filter(op => searchOperator(op, searchTerm)) : sortedOperators;
      renderOperators(filteredOperators, search.highlightMatch);
      updateCount(filteredOperators.length, formulasData.operators.length);
    },
  });

  // Setup expand/collapse
  setupExpandCollapse('.operator-item', 'expandAll', 'collapseAll');

  // Setup copy buttons
  setupCopyButtons('#operatorsList');

  // Setup version tabs (event delegation, survives re-renders)
  setupVersionTabs();

  // Initial render
  renderOperators(filteredOperators, search.highlightMatch);
  updateCount(filteredOperators.length, formulasData.operators.length);

  // Display game version
  const gameVersionElement = getElementById('gameVersion');
  gameVersionElement.textContent = `Up to date for v${formulasData.gameVersion}`;

  // Handle deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const operatorParam = urlParams.get('operator');
  if (operatorParam) {
    const matchingOperator = formulasData.operators.find(
      op => op.name === operatorParam || (op.aliases && op.aliases.includes(operatorParam))
    );

    if (matchingOperator) {
      const operatorElements = querySelectorAllAs(
        `.operator-item[data-operator-key^="${matchingOperator.name}-use-"]`,
        HTMLDetailsElement
      );

      if (operatorElements.length > 0) {
        operatorElements.forEach(element => {
          element.open = true;
        });

        setTimeout(() => {
          operatorElements[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          operatorElements.forEach(element => {
            element.classList.add('operator-highlight');
            setTimeout(() => element.classList.remove('operator-highlight'), 2000);
          });
        }, 100);
      }
    }
  }

  function searchOperator(operator: FormulaOperator, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();
    if (operator.name.toLowerCase().includes(term)) return true;
    if (operator.aliases && operator.aliases.some(a => a.toLowerCase().includes(term))) return true;

    return operator.uses.some(use => {
      if (use.description.toLowerCase().includes(term)) return true;
      if (use.example.toLowerCase().includes(term)) return true;
      if (use.returns.toLowerCase().includes(term)) return true;
      if (
        use.arguments?.some(
          arg =>
            arg.name.toLowerCase().includes(term) ||
            arg.type.toLowerCase().includes(term) ||
            arg.description.toLowerCase().includes(term)
        )
      )
        return true;
      if (use.requires?.some(req => req.toLowerCase().includes(term))) return true;
      return false;
    });
  }

  function renderOperators(operators: FormulaOperator[], highlightMatch: (text: string) => string): void {
    const operatorsList = getElementById('operatorsList');

    if (operators.length === 0) {
      operatorsList.innerHTML = '<p class="placeholder">No operators match your search.</p>';
      return;
    }

    operatorsList.innerHTML = operators.map(op => renderOperator(op, highlightMatch)).join('');
  }

  function buildSignature(operator: FormulaOperator, use: FormulaUse): string {
    if (operator.isFunctionStyle) {
      if (!use.arguments || use.arguments.length === 0) {
        return operator.name;
      }
      if (operator.name.startsWith('m:')) {
        const allArgs = use.arguments.map(arg => arg.name).join(':');
        return `${operator.name}(${allArgs})`;
      }
      if (use.arguments.length === 1) {
        return `${operator.name}:${use.arguments[0]?.name}`;
      }
      const firstArg = use.arguments[0]?.name;
      const restArgs = use.arguments
        .slice(1)
        .map(arg => arg.name)
        .join(':');
      return `${operator.name}:${firstArg}(${restArgs})`;
    }
    const argNames = use.arguments ? use.arguments.map(arg => arg.name).join(':') : '';
    return argNames ? `${operator.name}:${argNames}` : operator.name;
  }

  function renderUseBody(
    operator: FormulaOperator,
    use: FormulaUse,
    highlight: (text: string) => string,
    showSignature: boolean
  ): string {
    const hasAliases = operator.aliases && operator.aliases.length > 0;
    const hasArguments = use.arguments && use.arguments.length > 0;
    const signature = buildSignature(operator, use);

    return `
          ${
            showSignature
              ? `<div class="prev-signature">
                  <code class="info-code">${highlight(signature)}</code>
                </div>`
              : ''
          }
          <div class="operator-description">${highlight(use.description)}</div>

          <div class="operator-info-sections">
            <div class="info-section">
              <h4 class="info-header">Example</h4>
              <div class="info-content">
                <code class="info-code">${highlight(use.example)}</code>
              </div>
            </div>

            ${
              hasAliases
                ? `
            <div class="info-section">
              <h4 class="info-header">Aliases</h4>
              <div class="info-content">
                <code class="info-code">${operator.aliases!.map(a => highlight(a)).join(', ')}</code>
              </div>
            </div>`
                : ''
            }
          </div>

          ${
            hasArguments
              ? `
            <div class="operator-arguments">
              <h4 class="arguments-header">Arguments</h4>
              <ul class="arguments-list">
                ${use
                  .arguments!.map(
                    arg => `
                  <li class="argument-item">
                    <div class="argument-header">
                      <code class="argument-name">${highlight(arg.name)}</code>
                      <span class="argument-type">${highlight(arg.type)}</span>
                    </div>
                    <span class="argument-description">${highlight(arg.description)}</span>
                  </li>`
                  )
                  .join('')}
              </ul>
            </div>`
              : '<p class="no-arguments">No arguments</p>'
          }`;
  }

  function renderOperator(operator: FormulaOperator, highlight: (text: string) => string): string {
    const issueTitle = encodeURIComponent(`[Formula Documentation] Issue with "${operator.name}" operator`);
    const issueBody = encodeURIComponent(
      `**Operator Name:** \`${operator.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this operator's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;
    const prevOperator = findPrevOperator(operator);

    return operator.uses
      .map((use, useIndex) => {
        const operatorKey = `${operator.name}-use-${useIndex}`;
        const operatorUrl = `${window.location.origin}${window.location.pathname}?operator=${encodeURIComponent(operator.name)}`;
        const signature = buildSignature(operator, use);

        const currentBody = renderUseBody(operator, use, highlight, false);
        const prevBody = prevOperator
          ? prevOperator.uses.map(u => renderUseBody(prevOperator, u, highlight, prevOperator.uses.length > 1)).join('<hr class="version-use-separator" />')
          : '';

        return `
      <details class="operator-item" data-operator-key="${operatorKey}">
        <summary class="operator-summary">
          <span class="operator-name">${highlight(signature)}</span>
          <span class="operator-brief">${highlight(use.description)}</span>
        </summary>
        <div class="operator-details">
          <div class="operator-header-row">
            ${
              prevOperator
                ? `<div class="version-tabs" role="tablist">
                    <button type="button" class="version-tab active" data-version="current" role="tab">v${formulasData.gameVersion}</button>
                    <button type="button" class="version-tab" data-version="prev" role="tab">v${formulasDataPrev.gameVersion}</button>
                  </div>`
                : '<div class="version-tabs-spacer"></div>'
            }
            <button class="copy-name-btn" data-name="${operator.name}" title="Copy name">📋</button>
            <button class="copy-link-btn" data-url="${operatorUrl}" title="Copy link to this operator">🔗</button>
          </div>

          <div class="version-content active" data-version="current">
            ${currentBody}
          </div>
          ${
            prevOperator
              ? `<div class="version-content" data-version="prev">
                  ${prevBody}
                </div>`
              : ''
          }

          <div class="operator-disclaimer">
            Due to the number of operators, these descriptions were initially generated using AI. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>`;
      })
      .join('');
  }

  function setupVersionTabs(): void {
    const operatorsList = getElementById('operatorsList');
    operatorsList.addEventListener('click', e => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tab = target.closest('.version-tab');
      if (!tab) return;
      e.preventDefault();
      e.stopPropagation();
      const details = tab.closest('.operator-details');
      if (!details) return;
      const version = tab.getAttribute('data-version');
      details.querySelectorAll('.version-tab').forEach(t => t.classList.toggle('active', t === tab));
      details
        .querySelectorAll('.version-content')
        .forEach(c => c.classList.toggle('active', c.getAttribute('data-version') === version));
    });
  }

  function updateCount(showing: number, total: number): void {
    const operatorCount = getElementById('operatorCount');
    operatorCount.textContent = showing === total ? `${total} operators` : `${showing} / ${total} operators`;
  }
}

// Initialize on page load
initFormulasApp();
