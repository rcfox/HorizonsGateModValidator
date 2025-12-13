/**
 * Shared utilities for all pages - function-based approach
 */

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
  const searchInput = document.getElementById(config.searchInputId) as HTMLInputElement;
  const clearButton = document.getElementById(config.clearButtonId) as HTMLButtonElement;
  const highlightToggle = document.getElementById(config.highlightToggleId) as HTMLInputElement;
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
    searchInput.addEventListener('input', (e) => {
      if (searchTimeout !== null) {
        clearTimeout(searchTimeout);
      }
      searchTimeout = window.setTimeout(() => {
        searchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim();
        config.onSearch(searchTerm);
      }, debounceMs);

      if (clearButton) {
        clearButton.style.display = (e.target as HTMLInputElement).value ? 'block' : 'none';
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
    highlightToggle.addEventListener('change', (e) => {
      highlightEnabled = (e.target as HTMLInputElement).checked;
      localStorage.setItem('highlightEnabled', highlightEnabled.toString());
      config.onSearch(searchTerm); // Re-render
    });
  }

  // Keyboard shortcut (Ctrl+F / Cmd+F)
  document.addEventListener('keydown', (e) => {
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

export function setupExpandCollapse(
  itemSelector: string,
  expandBtnId: string,
  collapseBtnId: string
): void {
  const expandBtn = document.getElementById(expandBtnId);
  const collapseBtn = document.getElementById(collapseBtnId);

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      document.querySelectorAll(itemSelector).forEach((details) => {
        (details as HTMLDetailsElement).open = true;
      });
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      document.querySelectorAll(itemSelector).forEach((details) => {
        (details as HTMLDetailsElement).open = false;
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

  container.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.copy-link-btn');
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
