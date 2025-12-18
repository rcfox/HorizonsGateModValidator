/**
 * Shared utilities for all pages - function-based approach
 */

// ============================================================================
// DOM Utilities
// ============================================================================

/**
 * Assert that a value is defined (not null or undefined)
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(value: T | undefined | null, errorMessage: string): T {
  if (value === undefined || value === null) {
    throw new Error(errorMessage);
  }
  return value;
}

/**
 * Assert that a value is an instance of a given type
 * @throws Error if value is not an instance of type
 */
export function assertInstanceOf<T>(value: unknown, type: new (...args: unknown[]) => T, context?: string): T {
  if (!(value instanceof type)) {
    const got = value?.constructor?.name ?? typeof value;
    const message = context ? `${context}: Expected ${type.name}, got ${got}` : `Expected ${type.name}, got ${got}`;
    throw new Error(message);
  }
  return value;
}

/**
 * Get an element by ID and verify it's the correct type
 * @throws Error if element not found or wrong type
 */
export function getElementByIdAs<T extends HTMLElement>(id: string, type: new (...args: unknown[]) => T): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id '${id}' not found`);
  }
  if (!(element instanceof type)) {
    throw new Error(`Element with id '${id}' is not a ${type.name}, got ${element.constructor.name}`);
  }
  return element;
}

/**
 * Get an element by ID (any type) and verify it exists
 * @throws Error if element not found
 */
export function getElementById(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id '${id}' not found`);
  }
  return element;
}

/**
 * Query all elements matching selector and verify they're the correct type
 * @throws Error if any element is wrong type
 */
export function querySelectorAllAs<T extends HTMLElement>(
  selector: string,
  type: new (...args: unknown[]) => T,
  parent: ParentNode = document
): T[] {
  const elements = Array.from(parent.querySelectorAll(selector));
  return elements.map((element, index) => {
    if (!(element instanceof type)) {
      throw new Error(
        `Element at index ${index} matching selector '${selector}' is not a ${type.name}, got ${element.constructor.name}`
      );
    }
    return element;
  });
}

/**
 * Query single element matching selector and verify it's the correct type
 * @throws Error if element is wrong type
 * @returns Element or null if not found
 */
export function querySelectorAs<T extends HTMLElement>(
  selector: string,
  type: new (...args: unknown[]) => T,
  parent: ParentNode = document
): T {
  const element = parent.querySelector(selector);
  if (!element) {
    throw new Error(`Element matching selector '${selector}' was not found.`);
  }
  if (!(element instanceof type)) {
    throw new Error(`Element matching selector '${selector}' is not a ${type.name}, got ${element.constructor.name}`);
  }
  return element;
}

// ============================================================================
// Theme Management
// ============================================================================

export function initTheme(storageKey: string = 'theme'): void {
  const savedTheme = localStorage.getItem(storageKey);
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);

  // Attach toggle listener
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem(storageKey, newTheme);
      updateThemeIcon(newTheme);
    });
    updateThemeIcon(theme);
  }
}

function updateThemeIcon(theme: string): void {
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// ============================================================================
// HTML/String Utilities
// ============================================================================

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Search Functionality
// ============================================================================

export interface SearchConfig {
  searchInputId: string;
  clearButtonId: string;
  highlightToggleId: string;
  onSearch: (searchTerm: string) => void;
  debounceMs?: number;
}

export function setupSearch(config: SearchConfig): {
  highlightMatch: (text: string) => string;
  searchTerm: string;
} {
  const searchInput = getElementByIdAs(config.searchInputId, HTMLInputElement);
  const clearButton = getElementByIdAs(config.clearButtonId, HTMLButtonElement);
  const highlightToggle = getElementByIdAs(config.highlightToggleId, HTMLInputElement);
  const debounceMs = config.debounceMs || 300;

  let highlightEnabled = localStorage.getItem('highlightEnabled') !== 'false';
  let searchTerm = '';
  let searchTimeout: number | null = null;

  // Initialize highlight toggle
  if (highlightToggle) {
    highlightToggle.checked = highlightEnabled;
  }

  // Setup search input with debouncing
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const target = assertInstanceOf(e.target, HTMLInputElement, 'Search input event');
      if (searchTimeout !== null) {
        clearTimeout(searchTimeout);
      }
      searchTimeout = window.setTimeout(() => {
        searchTerm = target.value.toLowerCase().trim();
        config.onSearch(searchTerm);
      }, debounceMs);

      if (clearButton) {
        clearButton.style.display = target.value ? 'block' : 'none';
      }
    });
  }

  // Setup clear button
  if (clearButton && searchInput) {
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      clearButton.style.display = 'none';
      searchTerm = '';
      config.onSearch('');
      searchInput.focus();
    });
  }

  // Setup highlight toggle
  if (highlightToggle) {
    highlightToggle.addEventListener('change', e => {
      const target = assertInstanceOf(e.target, HTMLInputElement, 'Highlight toggle event');
      highlightEnabled = target.checked;
      localStorage.setItem('highlightEnabled', highlightEnabled.toString());
      config.onSearch(searchTerm); // Re-render
    });
  }

  // Keyboard shortcut (Ctrl+F / Cmd+F)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  });

  // Return highlight function
  return {
    highlightMatch: (text: string) => {
      if (!searchTerm || !text || !highlightEnabled) {
        return escapeHtml(text);
      }
      const escapedText = escapeHtml(text);
      const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
      return escapedText.replace(regex, '<mark>$1</mark>');
    },
    get searchTerm() {
      return searchTerm;
    },
  };
}

// ============================================================================
// Expand/Collapse
// ============================================================================

export function setupExpandCollapse(itemSelector: string, expandBtnId: string, collapseBtnId: string): void {
  const expandBtn = document.getElementById(expandBtnId);
  const collapseBtn = document.getElementById(collapseBtnId);

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      querySelectorAllAs(itemSelector, HTMLDetailsElement).forEach(details => {
        details.open = true;
      });
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      querySelectorAllAs(itemSelector, HTMLDetailsElement).forEach(details => {
        details.open = false;
      });
    });
  }
}

// ============================================================================
// Copy Link Buttons
// ============================================================================

export function setupCopyButtons(containerSelector: string): void {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.addEventListener('click', async e => {
    const target = assertInstanceOf(e.target, HTMLElement, 'Copy button click event');
    const btn = target.closest('.copy-link-btn');
    if (!btn) return;

    e.stopPropagation();
    const url = btn.getAttribute('data-url');

    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        const originalText = btn.textContent;
        btn.textContent = '✓';
        btn.classList.add('copied');

        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  });
}

// ============================================================================
// Deep Linking
// ============================================================================

export interface DeepLinkConfig<T> {
  paramName: string;
  findItem: (paramValue: string) => T | undefined;
  getElement: (item: T) => HTMLDetailsElement | null;
  highlightClass: string;
}

export function handleDeepLink<T>(config: DeepLinkConfig<T>): void {
  const urlParams = new URLSearchParams(window.location.search);
  const paramValue = urlParams.get(config.paramName);

  if (!paramValue) return;

  const matchingItem = config.findItem(paramValue);
  if (!matchingItem) return;

  const element = config.getElement(matchingItem);
  if (!element) return;

  element.open = true;

  setTimeout(() => {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add(config.highlightClass);

    setTimeout(() => {
      element.classList.remove(config.highlightClass);
    }, 2000);
  }, 100);
}
