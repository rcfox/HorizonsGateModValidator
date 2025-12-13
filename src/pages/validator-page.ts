/**
 * Browser application for mod validator
 * Uses the bundled validator from validator.bundle.js
 */

import { initTheme, escapeHtml, getElementByIdAs, assertInstanceOf } from './shared-utils.js';
import type { ValidationResult, ValidationMessage, Correction } from '../types.js';

// Global ModValidator from bundle
declare global {
  interface Window {
    ModValidator: {
      ModValidator: new () => {
        validate: (content: string) => ValidationResult;
        getKnownObjectTypes: () => string[];
      };
    };
  }
}

// Sample mod code
const SAMPLE_MOD = `[Action] ID=greatswordAttack;
	applyWeaponBuffs=tru;

	casterAnimation=broadswing
	casterAnimationDependsOnWeaponHand=true;
	FXChangesWithWeaponHand=true;
	FXOnTarget=swipe;
[Actionaoe]
	ID=greatswordAttack;
	cloneFrom=Adjacent;
[AvAffecter]
	actorValue=HP;
	magnitude= dat:gswordDmg;
	durration=-2;
	chance=test;
	element=2;
	element=physical;
	element=slash;
	element=heavSlash;
[AvAffecterAoE]
	ID=greatswordAttack;
	aoeCasterAsOrigin=true;
	maxRange = 1.5;
	coneAngle=g:foo;
`;

export function initValidatorApp(): void {
  // Check if we're on the validator page
  if (!document.getElementById('modInput')) return;

  // Theme management
  initTheme('mod-validator-theme');

  const validator = new window.ModValidator.ModValidator();

  // DOM elements
  const modInput = getElementByIdAs('modInput', HTMLTextAreaElement);
  const validateBtn = getElementByIdAs('validateBtn', HTMLButtonElement);
  const clearBtn = getElementByIdAs('clearBtn', HTMLButtonElement);
  const loadSampleBtn = getElementByIdAs('loadSampleBtn', HTMLButtonElement);
  const resultsContainer = getElementByIdAs('results', HTMLDivElement);
  const validationStatus = getElementByIdAs('validationStatus', HTMLDivElement);
  const lineNumbers = getElementByIdAs('lineNumbers', HTMLDivElement);

  // Event listeners
  validateBtn.addEventListener('click', handleValidate);
  clearBtn.addEventListener('click', handleClear);
  loadSampleBtn.addEventListener('click', handleLoadSample);

  // Auto-validate on input (debounced)
  let validateTimeout: number | undefined;
  modInput.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(validateTimeout);
    validateTimeout = window.setTimeout(handleValidate, 1000);
  });

  // Initialize line numbers
  updateLineNumbers();

  function handleValidate(): void {
  const content = modInput.value;

  if (!content.trim()) {
    resultsContainer.innerHTML = '<p class="placeholder">No content to validate.</p>';
    validationStatus.textContent = '';
    validationStatus.className = 'status';
    return;
  }

  // Add loading state
  validateBtn.classList.add('loading');
  validateBtn.textContent = 'Validating...';

  // Run validation
  setTimeout(() => {
    const result = validator.validate(content);
    displayResults(result);

    // Remove loading state
    validateBtn.classList.remove('loading');
    validateBtn.textContent = 'Validate';
  }, 100);
  }

  function handleClear(): void {
  modInput.value = '';
  updateLineNumbers();
  resultsContainer.innerHTML =
    '<p class="placeholder">No validation results yet. Paste your mod code and click "Validate".</p>';
  validationStatus.textContent = '';
  validationStatus.className = 'status';
  }

  function handleLoadSample(): void {
  modInput.value = SAMPLE_MOD;
  updateLineNumbers();
  handleValidate();
  }

  function displayResults(result: ValidationResult): void {
  // Update status
  if (result.valid) {
    validationStatus.textContent = '✓ Valid';
    validationStatus.className = 'status success';
  } else {
    validationStatus.textContent = `✗ ${result.errors.length} Error${result.errors.length !== 1 ? 's' : ''}`;
    validationStatus.className = 'status error';
  }

  // Display messages
  const messages = [...result.errors, ...result.warnings, ...result.info];

  if (messages.length === 0) {
    resultsContainer.innerHTML = `
            <div class="message success">
                <div class="message-header">
                    <span class="message-icon">✓</span>
                    <span>No issues found!</span>
                </div>
                <div class="message-text">Your mod code appears to be valid.</div>
            </div>
        `;
    return;
  }

  const html = messages.map((msg) => createMessageHTML(msg)).join('');
  resultsContainer.innerHTML = html;
  }

  function createMessageHTML(msg: ValidationMessage): string {
  const icon = getIcon(msg.severity);
  const lineAttr = msg.line ? `data-line="${msg.line}"` : '';
  const cursorClass = msg.line ? 'clickable' : '';

  // Add position data attributes if corrections are available
  let positionAttrs = '';
  if (msg.corrections && msg.corrections.length > 0) {
    const firstCorrection = msg.corrections[0];
    if (firstCorrection) {
      positionAttrs = `data-start-line="${firstCorrection.startLine}" data-start-column="${firstCorrection.startColumn}" data-end-line="${firstCorrection.endLine}" data-end-column="${firstCorrection.endColumn}"`;
    }
  }

  // Create corrections HTML if available
  let correctionsHTML = '';
  if (msg.corrections && msg.corrections.length > 0) {
    const icon = msg.correctionIcon || '💡';

    // If there's a custom suggestion text, make the entire suggestion clickable
    // Otherwise, show "Did you mean:" with each correction's replacementText as links
    if (msg.suggestion && msg.suggestion.trim().length > 0) {
      // Make the suggestion text itself clickable (for fixes like "Add a semicolon")
      const correctionData = JSON.stringify(msg.corrections[0]).replace(/"/g, '&quot;');
      const suggestionLink = `<span class="correction-link" data-correction="${correctionData}">${escapeHtml(msg.suggestion)}</span>`;
      correctionsHTML = `<div class="message-corrections">${icon} ${suggestionLink}</div>`;
    } else {
      // Show each correction's replacement text as separate links (for typos)
      const correctionLinks = msg.corrections
        .map((correction) => {
          const correctionData = JSON.stringify(correction).replace(/"/g, '&quot;');
          return `<span class="correction-link" data-correction="${correctionData}">${escapeHtml(correction.replacementText)}</span>`;
        })
        .join(', ');
      correctionsHTML = `<div class="message-corrections">${icon} Did you mean: ${correctionLinks}?</div>`;
    }
  }

  // Create formula reference link if available
  let formulaReferenceHTML = '';
  if (msg.formulaReference) {
    formulaReferenceHTML = `<div class="message-corrections">📖 See formula reference: <span class="correction-link formula-reference-link" data-operator="${escapeHtml(msg.formulaReference)}">${escapeHtml(msg.formulaReference)}</span></div>`;
  }

  // Create documentation URL link if available
  let documentationHTML = '';
  if (msg.documentationUrl) {
    const label = msg.documentationLabel || 'Documentation';
    documentationHTML = `<div class="message-corrections">📚 <a href="${escapeHtml(msg.documentationUrl)}" target="_blank" rel="noopener noreferrer" class="documentation-link">${escapeHtml(label)}</a></div>`;
  }

  return `
        <div class="message ${msg.severity} ${cursorClass}" ${lineAttr} ${positionAttrs}>
            <div class="message-header">
                <span class="message-icon">${icon}</span>
                <span>${msg.message}</span>
            </div>
            ${msg.line ? `<div class="message-line-info">Line ${msg.line}</div>` : ''}
            ${msg.context ? `<div class="message-context">${escapeHtml(msg.context)}</div>` : ''}
            ${correctionsHTML}
            ${formulaReferenceHTML}
            ${documentationHTML}
            ${
              !correctionsHTML && !formulaReferenceHTML && !documentationHTML && msg.suggestion
                ? `<div class="message-suggestion">💡 ${escapeHtml(msg.suggestion)}</div>`
                : ''
            }
        </div>
    `;
  }

  function getIcon(severity: string): string {
  switch (severity) {
    case 'error':
      return '✗';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
    default:
      return '•';
    }
  }

  function updateLineNumbers(): void {
  const lines = modInput.value.split('\n');
  const lineCount = lines.length;

  lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, i) => i + 1)
    .map((num) => `<div>${num}</div>`)
    .join('');
  }

  interface SelectionPosition {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  }

  function scrollToLine(lineNumber: number, position: SelectionPosition | null = null): void {
  const lines = modInput.value.split('\n');
  const lineHeight = parseFloat(getComputedStyle(modInput).lineHeight);
  const editorWrapper = modInput.parentElement;

  if (!editorWrapper) return;

  // Calculate the position of the target line
  const targetScrollTop = (lineNumber - 1) * lineHeight;

  // Scroll the wrapper (which contains both line numbers and textarea)
  editorWrapper.scrollTop = targetScrollTop;

  // Also scroll the page to ensure the editor wrapper is visible
  const editorSection = editorWrapper.closest('.editor-section');
  if (editorSection) {
    editorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Focus the textarea
  modInput.focus();

  // If we have position information, select just that part
  if (position) {
    const { startLine, startColumn, endLine, endColumn } = position;

    // Calculate absolute character positions
    let absoluteStart = 0;
    for (let i = 0; i < startLine - 1; i++) {
      const line = lines[i];
      if (line === undefined) {
        throw new Error(`Line ${i} is undefined when calculating position for startLine ${startLine}`);
      }
      absoluteStart += line.length + 1; // +1 for newline
    }
    absoluteStart += startColumn;

    let absoluteEnd = 0;
    for (let i = 0; i < endLine - 1; i++) {
      const line = lines[i];
      if (line === undefined) {
        throw new Error(`Line ${i} is undefined when calculating position for endLine ${endLine}`);
      }
      absoluteEnd += line.length + 1;
    }
    absoluteEnd += endColumn;

    modInput.setSelectionRange(absoluteStart, absoluteEnd);
  } else {
    // Fallback: select the entire line
    let charPosition = 0;
    for (let i = 0; i < lineNumber - 1; i++) {
      const line = lines[i];
      if (line === undefined) {
        throw new Error(`Line ${i} is undefined when calculating position for lineNumber ${lineNumber}`);
      }
      charPosition += line.length + 1; // +1 for newline
    }
    modInput.setSelectionRange(charPosition, charPosition + (lines[lineNumber - 1]?.length || 0));
    }
  }

  /**
   * Replace text in textarea using execCommand to make it undoable with Ctrl+Z
   */
  function replaceTextUndoable(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string
): void {
  // Focus the textarea
  textarea.focus();

  // Select the text to replace
  textarea.setSelectionRange(start, end);

  // Replace using execCommand to make it undoable
  // Note: execCommand is deprecated but still the only way to get undo/redo support
  document.execCommand('insertText', false, replacement);

  // Select the inserted text to show what was changed
  textarea.setSelectionRange(start, start + replacement.length);
  }

  function applyCorrection(correction: Correction): void {
  const lines = modInput.value.split('\n');
  const { startLine, startColumn, endLine, endColumn, replacementText } = correction;

  // Validate correction bounds
  if (startLine < 1 || startLine > lines.length || endLine < 1 || endLine > lines.length) {
    console.warn('Invalid correction line numbers:', correction);
    return;
  }
  if (startLine > endLine) {
    console.warn('Start line > end line:', correction);
    return;
  }

  // Calculate absolute character positions
  let absoluteStart = 0;
  for (let i = 0; i < startLine - 1; i++) {
    const line = lines[i];
    if (line === undefined) {
      throw new Error(`Line ${i} is undefined when applying correction at startLine ${startLine}`);
    }
    absoluteStart += line.length + 1; // +1 for newline
  }
  absoluteStart += startColumn;

  let absoluteEnd = 0;
  for (let i = 0; i < endLine - 1; i++) {
    const line = lines[i];
    if (line === undefined) {
      throw new Error(`Line ${i} is undefined when applying correction at endLine ${endLine}`);
    }
    absoluteEnd += line.length + 1;
  }
  absoluteEnd += endColumn;

  // Replace text (undoably)
  replaceTextUndoable(modInput, absoluteStart, absoluteEnd, replacementText);

  // Update and re-validate
  updateLineNumbers();
  handleValidate();

  // Scroll to and select the corrected text
  scrollToLine(startLine, {
    startLine: startLine,
    startColumn: startColumn,
    endLine: startLine, // Corrections are always single-line
    endColumn: startColumn + replacementText.length,
    });
  }

  // Handle clicks on messages to jump to line
  resultsContainer.addEventListener('click', (e) => {
  const target = assertInstanceOf(e.target, HTMLElement, 'Results container click event');

  // Check if clicked on a formula reference link
  const formulaReferenceLink = target.closest('.formula-reference-link');
  if (formulaReferenceLink) {
    e.stopPropagation();
    const operator = formulaReferenceLink.getAttribute('data-operator');
    if (operator) {
      window.open(`formulas.html?operator=${operator}`, '_blank');
    }
    return;
  }

  // Check if clicked on a correction link
  const correctionLink = target.closest('.correction-link:not(.formula-reference-link)');
  if (correctionLink) {
    e.stopPropagation();
    const correctionData = correctionLink.getAttribute('data-correction');

    if (correctionData) {
      try {
        const correction = JSON.parse(correctionData.replace(/&quot;/g, '"'));
        applyCorrection(correction);
      } catch (e) {
        console.error('Failed to parse correction data:', e);
      }
    }
    return;
  }

  // Otherwise handle message click to jump to line
  const messageElement = target.closest('.message.clickable');
  if (messageElement) {
    const lineNumber = parseInt(messageElement.getAttribute('data-line') || '', 10);
    if (lineNumber) {
      // Check if we have position information for more precise selection
      const startLineStr = messageElement.getAttribute('data-start-line');
      const startColumnStr = messageElement.getAttribute('data-start-column');
      const endLineStr = messageElement.getAttribute('data-end-line');
      const endColumnStr = messageElement.getAttribute('data-end-column');

      if (startLineStr && startColumnStr && endLineStr && endColumnStr) {
        scrollToLine(lineNumber, {
          startLine: parseInt(startLineStr, 10),
          startColumn: parseInt(startColumnStr, 10),
          endLine: parseInt(endLineStr, 10),
          endColumn: parseInt(endColumnStr, 10),
        });
      } else {
        scrollToLine(lineNumber);
      }
    }
    }
  });

  // Initialize
  console.log('Mod Validator loaded');
  console.log('Known object types:', validator.getKnownObjectTypes().length);
}

// Initialize on page load
initValidatorApp();
