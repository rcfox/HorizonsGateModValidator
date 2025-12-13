// Formula functionality
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
  category: string;
  isFunctionStyle: boolean;
  aliases?: string[];
  uses: FormulaUse[];
}

interface FormulasData {
  gameVersion: string;
  operators: FormulaOperator[];
}

import rawFormulasData from './formula.json';

const formulasData = rawFormulasData as FormulasData;

// Theme management (shared with main validator)
const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
const root = document.documentElement;

// Initialize theme from localStorage or system preference
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  root.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme: string) {
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const currentTheme = root.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  root.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

themeToggle.addEventListener('click', toggleTheme);
initTheme();

// Sort operators alphabetically by name
const sortedOperators = [...formulasData.operators].sort((a, b) => a.name.localeCompare(b.name));

let filteredOperators: FormulaOperator[] = sortedOperators;
let searchTerm = '';
let highlightEnabled = localStorage.getItem('highlightEnabled') !== 'false'; // Default to true unless explicitly disabled

// Render operators to the DOM
function renderOperators(operators: FormulaOperator[]) {
  const operatorsList = document.getElementById('operatorsList')!;

  if (operators.length === 0) {
    operatorsList.innerHTML = '<p class="placeholder">No operators match your search.</p>';
    return;
  }

  operatorsList.innerHTML = operators.map(operator => renderOperator(operator)).join('');

  // Add click handlers for copy link buttons
  operatorsList.querySelectorAll('.copy-link-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const url = (e.target as HTMLElement).getAttribute('data-url');
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
          const originalText = (e.target as HTMLElement).textContent;
          (e.target as HTMLElement).textContent = '✓';
          (e.target as HTMLElement).classList.add('copied');
          setTimeout(() => {
            (e.target as HTMLElement).textContent = originalText;
            (e.target as HTMLElement).classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }
    });
  });
}

function renderOperator(operator: FormulaOperator): string {
  const hasAliases = operator.aliases && operator.aliases.length > 0;

  const issueTitle = encodeURIComponent(`[Formula Documentation] Issue with "${operator.name}" operator`);
  const issueBody = encodeURIComponent(`**Operator Name:** \`${operator.name}\`

**Issue Description:**
<!-- Describe what's wrong or unclear about this operator's documentation -->


**Expected:**
<!-- What should the documentation say? -->


<!-- Please provide as much detail as possible -->`);
  const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;

  // Render each use separately with its own details element
  return operator.uses
    .map((use, useIndex) => {
      const operatorKey = `${operator.name}-use-${useIndex}`;
      const operatorUrl = `${window.location.origin}${window.location.pathname}?operator=${encodeURIComponent(operator.name)}`;
      const hasArguments = use.arguments && use.arguments.length > 0;

      // Build operator signature
      let signature: string;
      if (operator.isFunctionStyle) {
        if (!use.arguments || use.arguments.length === 0) {
          signature = operator.name;
        } else if (operator.name.startsWith('m:')) {
          // Special case: m: prefix - all arguments go inside parentheses
          const allArgs = use.arguments.map(arg => arg.name).join(':');
          signature = `${operator.name}(${allArgs})`;
        } else if (use.arguments.length === 1) {
          signature = `${operator.name}:${use.arguments[0]?.name}`;
        } else {
          // Multiple arguments: first arg outside parentheses, rest inside
          const firstArg = use.arguments[0]?.name;
          const restArgs = use.arguments
            .slice(1)
            .map(arg => arg.name)
            .join(':');
          signature = `${operator.name}:${firstArg}(${restArgs})`;
        }
      } else {
        // Operator style: all args with colons
        const argNames = use.arguments ? use.arguments.map(arg => arg.name).join(':') : '';
        signature = argNames ? `${operator.name}:${argNames}` : operator.name;
      }

      return `
      <details class="operator-item" data-operator-key="${operatorKey}">
        <summary class="operator-summary">
          <span class="operator-name">${highlightMatch(signature)}</span>
          <span class="operator-brief">${highlightMatch(use.description)}</span>
        </summary>
        <div class="operator-details">
          <div class="operator-header-row">
            <div class="operator-description">
              ${highlightMatch(use.description)}
            </div>
            <button class="copy-link-btn" data-url="${operatorUrl}" title="Copy link to this operator">
              🔗
            </button>
          </div>

          <div class="operator-info-sections">
            <div class="info-section">
              <h4 class="info-header">Example</h4>
              <div class="info-content">
                <code class="info-code">${highlightMatch(use.example)}</code>
              </div>
            </div>

            ${
              hasAliases
                ? `
            <div class="info-section">
              <h4 class="info-header">Aliases</h4>
              <div class="info-content">
                <code class="info-code">${operator.aliases!.map(a => highlightMatch(a)).join(', ')}</code>
              </div>
            </div>
            `
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
                      <code class="argument-name">${highlightMatch(arg.name)}</code>
                      <span class="argument-type">${highlightMatch(arg.type)}</span>
                    </div>
                    <span class="argument-description">${highlightMatch(arg.description)}</span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
            </div>
          `
              : `
            <p class="no-arguments">No arguments</p>
          `
          }

          <div class="operator-disclaimer">
            Due to the number of operators, these descriptions were initially generated using AI. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>
    `;
    })
    .join('');
}

// Search functionality
function searchOperators(query: string) {
  searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    filteredOperators = sortedOperators;
    renderOperators(filteredOperators);
    updateOperatorCount(filteredOperators.length, formulasData.operators.length);
    return;
  }

  filteredOperators = sortedOperators.filter(operator => {
    // Search in operator name
    if (operator.name.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Search in aliases
    if (operator.aliases && operator.aliases.some(alias => alias.toLowerCase().includes(searchTerm))) {
      return true;
    }

    // Search in category
    if (operator.category.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Search in uses
    return operator.uses.some(use => {
      // Search in description
      if (use.description.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in example
      if (use.example.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in return type
      if (use.returns.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in arguments
      if (
        use.arguments &&
        use.arguments.some(
          arg =>
            arg.name.toLowerCase().includes(searchTerm) ||
            arg.type.toLowerCase().includes(searchTerm) ||
            arg.description.toLowerCase().includes(searchTerm)
        )
      ) {
        return true;
      }

      // Search in requires
      if (use.requires && use.requires.some(req => req.toLowerCase().includes(searchTerm))) {
        return true;
      }

      return false;
    });
  });

  renderOperators(filteredOperators);
  updateOperatorCount(filteredOperators.length, formulasData.operators.length);
}

// Highlight matching text
function highlightMatch(text: string): string {
  if (!searchTerm || !text || !highlightEnabled) {
    return escapeHtml(text);
  }

  const escapedText = escapeHtml(text);
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  return escapedText.replace(regex, '<mark>$1</mark>');
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Escape regex special characters
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Update operator count display
function updateOperatorCount(showing: number, total: number) {
  const operatorCount = document.getElementById('operatorCount')!;
  if (showing === total) {
    operatorCount.textContent = `${total} operators`;
  } else {
    operatorCount.textContent = `${showing} / ${total} operators`;
  }
}

// Expand/collapse all functionality
function expandAll() {
  document.querySelectorAll('.operator-item').forEach(details => {
    (details as HTMLDetailsElement).open = true;
  });
}

function collapseAll() {
  document.querySelectorAll('.operator-item').forEach(details => {
    (details as HTMLDetailsElement).open = false;
  });
}

// Event listeners
const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const clearSearch = document.getElementById('clearSearch') as HTMLButtonElement;
const expandAllBtn = document.getElementById('expandAll') as HTMLButtonElement;
const collapseAllBtn = document.getElementById('collapseAll') as HTMLButtonElement;
const highlightToggle = document.getElementById('highlightToggle') as HTMLInputElement;

// Debounced search
let searchTimeout: number;
searchInput.addEventListener('input', e => {
  clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => {
    searchOperators((e.target as HTMLInputElement).value);
  }, 300);

  // Show/hide clear button
  clearSearch.style.display = (e.target as HTMLInputElement).value ? 'block' : 'none';
});

clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  clearSearch.style.display = 'none';
  searchOperators('');
  searchInput.focus();
});

expandAllBtn.addEventListener('click', expandAll);
collapseAllBtn.addEventListener('click', collapseAll);

highlightToggle.addEventListener('change', e => {
  highlightEnabled = (e.target as HTMLInputElement).checked;
  localStorage.setItem('highlightEnabled', highlightEnabled.toString());
  renderOperators(filteredOperators);
});

// Keyboard shortcut for search (Ctrl+F or Cmd+F)
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// Initialize
highlightToggle.checked = highlightEnabled;
renderOperators(filteredOperators);
updateOperatorCount(formulasData.operators.length, formulasData.operators.length);

// Display game version
const gameVersionElement = document.getElementById('gameVersion')!;
gameVersionElement.textContent = `Up to date for v${formulasData.gameVersion}`;

// Handle URL parameter to auto-expand and scroll to operator
const urlParams = new URLSearchParams(window.location.search);
const operatorParam = urlParams.get('operator');
if (operatorParam) {
  // Resolve alias to canonical name
  let targetOperatorName = operatorParam;

  // Search for the operator by name or alias
  const matchingOperator = formulasData.operators.find(op => {
    if (op.name === operatorParam) {
      return true;
    }
    if (op.aliases && op.aliases.includes(operatorParam)) {
      targetOperatorName = op.name; // Use canonical name for searching
      return true;
    }
    return false;
  });

  if (matchingOperator) {
    // Find all matching operator elements (could be multiple uses)
    const operatorElements = document.querySelectorAll(
      `.operator-item[data-operator-key^="${targetOperatorName}-use-"]`
    );

    if (operatorElements.length > 0) {
      // Expand all uses of this operator
      operatorElements.forEach(element => {
        (element as HTMLDetailsElement).open = true;
      });

      // Scroll to the first one with a slight delay to ensure DOM is ready
      setTimeout(() => {
        operatorElements[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Add a highlight effect
        operatorElements.forEach(element => {
          element.classList.add('operator-highlight');
          setTimeout(() => {
            element.classList.remove('operator-highlight');
          }, 2000);
        });
      }, 100);
    }
  }
}
