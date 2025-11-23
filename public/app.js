/**
 * Browser application
 * Uses the bundled validator from validator.bundle.js
 */

const validator = new ModValidator.ModValidator();

// DOM elements
const modInput = document.getElementById('modInput');
const validateBtn = document.getElementById('validateBtn');
const clearBtn = document.getElementById('clearBtn');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const themeToggle = document.getElementById('themeToggle');
const resultsContainer = document.getElementById('results');
const validationStatus = document.getElementById('validationStatus');
const lineNumbers = document.getElementById('lineNumbers');

// Sample mod code
const SAMPLE_MOD = `[Action] ID=greatswordAttack;
	applyWeaponBuffs=tru;

	casterAnimation=broadswing
	casterAnimationDependsOnWeaponHand=true;
	FXChangesWithWeaponHand=true;
	FXOnTarget=swipe;
[Actionaoe]
	ID=greatswordAttack;
	cloneFrom=adjacent;
[AvAffecter]
	ID=greatswordAttack;
	actorValue=HP;
	magnitude= d:gswordDmg;
	durration=-2;
	chance=test;
	element=melee;
	element=physical;
	element=slash;
	element=heavSlash;
[AvAffecterAoE]
	ID=greatswordAttack;
	aoeCasterAsOrigin=true;
	maxRange = 1.5;
	coneAngle=g:foo;
`;

// Theme management
const THEME_KEY = 'mod-validator-theme';

function getDefaultTheme() {
    // Check if user has a saved preference
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
        return savedTheme;
    }

    // Otherwise, use browser preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'light';
}

const currentTheme = getDefaultTheme();
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeIcon(currentTheme);

function updateThemeIcon(theme) {
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    updateThemeIcon(newTheme);
}

// Event listeners
validateBtn.addEventListener('click', handleValidate);
clearBtn.addEventListener('click', handleClear);
loadSampleBtn.addEventListener('click', handleLoadSample);
themeToggle.addEventListener('click', toggleTheme);

// Auto-validate on input (debounced)
let validateTimeout;
modInput.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(validateTimeout);
    validateTimeout = setTimeout(handleValidate, 1000);
});

// Initialize line numbers
updateLineNumbers();

function handleValidate() {
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

function handleClear() {
    modInput.value = '';
    updateLineNumbers();
    resultsContainer.innerHTML = '<p class="placeholder">No validation results yet. Paste your mod code and click "Validate".</p>';
    validationStatus.textContent = '';
    validationStatus.className = 'status';
}

function handleLoadSample() {
    modInput.value = SAMPLE_MOD;
    updateLineNumbers();
    handleValidate();
}

function displayResults(result) {
    // Update status
    if (result.valid) {
        validationStatus.textContent = '✓ Valid';
        validationStatus.className = 'status success';
    } else {
        validationStatus.textContent = `✗ ${result.errors.length} Error${result.errors.length !== 1 ? 's' : ''}`;
        validationStatus.className = 'status error';
    }

    // Display messages
    const messages = [
        ...result.errors,
        ...result.warnings,
        ...result.info,
    ];

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

    const html = messages.map(msg => createMessageHTML(msg)).join('');
    resultsContainer.innerHTML = html;
}

function createMessageHTML(msg) {
    const icon = getIcon(msg.severity);
    const lineAttr = msg.line ? `data-line="${msg.line}"` : '';
    const cursorClass = msg.line ? 'clickable' : '';

    // Create corrections HTML if available
    let correctionsHTML = '';
    if (msg.corrections && msg.corrections.length > 0) {
        const correctionLinks = msg.corrections
            .map(correction => `<span class="correction-link" data-correction="${escapeHTML(correction)}">${escapeHTML(correction)}</span>`)
            .join(', ');
        correctionsHTML = `<div class="message-corrections">💡 Did you mean: ${correctionLinks}?</div>`;
    }

    return `
        <div class="message ${msg.severity} ${cursorClass}" ${lineAttr}>
            <div class="message-header">
                <span class="message-icon">${icon}</span>
                <span>${msg.message}</span>
            </div>
            ${msg.line ? `<div class="message-line-info">Line ${msg.line}</div>` : ''}
            ${msg.context ? `<div class="message-context">${escapeHTML(msg.context)}</div>` : ''}
            ${correctionsHTML || (msg.suggestion ? `<div class="message-suggestion">💡 ${escapeHTML(msg.suggestion)}</div>` : '')}
        </div>
    `;
}

function getIcon(severity) {
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

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function updateLineNumbers() {
    const lines = modInput.value.split('\n');
    const lineCount = lines.length;

    lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, i) => i + 1)
        .map(num => `<div>${num}</div>`)
        .join('');
}

function scrollToLine(lineNumber) {
    const lines = modInput.value.split('\n');
    const lineHeight = parseFloat(getComputedStyle(modInput).lineHeight);
    const editorWrapper = modInput.parentElement;

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

    // Set cursor position at the start of the line and select the entire line
    let charPosition = 0;
    for (let i = 0; i < lineNumber - 1; i++) {
        charPosition += lines[i].length + 1; // +1 for newline
    }
    modInput.setSelectionRange(charPosition, charPosition + (lines[lineNumber - 1]?.length || 0));
}

/**
 * Replace text in textarea using execCommand to make it undoable with Ctrl+Z
 */
function replaceTextUndoable(textarea, start, end, replacement) {
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

function applyCorrection(lineNumber, correction) {
    const lines = modInput.value.split('\n');
    if (lineNumber < 1 || lineNumber > lines.length) {
        return;
    }

    const line = lines[lineNumber - 1];

    // Try to find and replace the incorrect identifier
    // Look for:
    // 1. Object type pattern: [ObjectType]
    // 2. Property name pattern: property=value
    // 3. Property value pattern: property=value (for enum corrections)
    let incorrectText = '';
    let searchStart = 0;

    // Check if this is an object type line [Type]
    const objectTypeMatch = line.match(/\[(\w+)\]/);
    if (objectTypeMatch) {
        incorrectText = objectTypeMatch[1];
    } else {
        // Check if this is a property line: property=value
        // The line may contain multiple properties separated by semicolons
        // We need to find which property/value pair to correct

        // First, try to find a property=value pair that contains the correction
        const propertyPairs = line.split(';').map(p => p.trim()).filter(p => p.length > 0);

        for (const pair of propertyPairs) {
            const pairMatch = pair.match(/^\s*(!?[\w+]+)\s*=\s*(.+)$/);
            if (pairMatch) {
                const propertyName = pairMatch[1];
                const propertyValue = pairMatch[2].trim();

                // Use findSimilar to check if correction matches the value or name
                const valueSimilar = ModValidator.findSimilar(correction, [propertyValue], ModValidator.MAX_EDIT_DISTANCE);
                const nameSimilar = ModValidator.findSimilar(correction, [propertyName], ModValidator.MAX_EDIT_DISTANCE);

                // If correction is similar to the value, replace the value
                if (valueSimilar.length > 0 && propertyValue !== correction) {
                    incorrectText = propertyValue;
                    searchStart = line.indexOf(pair) + pair.indexOf('=') + 1;
                    break;
                }

                // If correction is similar to the property name, replace the name
                if (nameSimilar.length > 0 && propertyName !== correction) {
                    incorrectText = propertyName;
                    searchStart = line.indexOf(pair);
                    break;
                }
            }
        }
    }

    if (!incorrectText) {
        // Couldn't find what to replace
        return;
    }

    // Calculate character position of the incorrect text
    let charPosition = 0;
    for (let i = 0; i < lineNumber - 1; i++) {
        charPosition += lines[i].length + 1; // +1 for newline
    }

    // Find the position of the incorrect identifier within the line (starting from searchStart)
    const incorrectStart = line.indexOf(incorrectText, searchStart);
    if (incorrectStart === -1) {
        return;
    }

    const selectionStart = charPosition + incorrectStart;
    const selectionEnd = selectionStart + incorrectText.length;

    // Replace the text (undoably)
    replaceTextUndoable(modInput, selectionStart, selectionEnd, correction);

    // Update line numbers and re-validate
    updateLineNumbers();
    handleValidate();

    // Scroll to the line
    const editorWrapper = modInput.parentElement;
    const lineHeight = parseFloat(getComputedStyle(modInput).lineHeight);
    const targetScrollTop = (lineNumber - 1) * lineHeight;
    editorWrapper.scrollTop = targetScrollTop;

    const editorSection = editorWrapper.closest('.editor-section');
    if (editorSection) {
        editorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Handle clicks on messages to jump to line
resultsContainer.addEventListener('click', (e) => {
    // Check if clicked on a correction link
    const correctionLink = e.target.closest('.correction-link');
    if (correctionLink) {
        e.stopPropagation();
        const correction = correctionLink.getAttribute('data-correction');
        const messageElement = correctionLink.closest('.message');
        const lineNumber = messageElement ? parseInt(messageElement.getAttribute('data-line'), 10) : null;

        if (lineNumber && correction) {
            applyCorrection(lineNumber, correction);
        }
        return;
    }

    // Otherwise handle message click to jump to line
    const messageElement = e.target.closest('.message.clickable');
    if (messageElement) {
        const lineNumber = parseInt(messageElement.getAttribute('data-line'), 10);
        if (lineNumber) {
            scrollToLine(lineNumber);
        }
    }
});

// Initialize
console.log('Mod Validator loaded');
console.log('Known object types:', validator.getKnownObjectTypes().length);
