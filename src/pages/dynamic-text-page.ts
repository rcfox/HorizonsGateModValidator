/**
 * Dynamic text reference page
 * Uses shared utilities for common functionality
 */

import {
  initTheme,
  setupSearch,
  setupExpandCollapse,
  setupCopyButtons,
  getElementById,
  querySelectorAs,
  querySelectorAllAs,
} from './shared-utils.js';
import rawDynamicTextData from '../dynamic-text.json';

interface TagArgument {
  name: string;
  description: string;
}

interface Tag {
  name: string;
  description: string;
  required: TagArgument[];
  optional: TagArgument[];
  aliases: string[];
  commands?: Tag[]; // Subcommands have the same structure as top-level tags
}

interface DynamicTextData {
  tags: Tag[];
}

const dynamicTextData = rawDynamicTextData as DynamicTextData;

export function initDynamicTextApp(): void {
  // Check if we're on the dynamic-text page
  if (!document.getElementById('tagsList')) return;

  // Theme management
  initTheme();

  // Sort tags alphabetically
  const sortedTags = [...dynamicTextData.tags].sort((a, b) => a.name.localeCompare(b.name));
  let filteredTags = sortedTags;

  // Setup search
  const search = setupSearch({
    searchInputId: 'searchInput',
    clearButtonId: 'clearSearch',
    highlightToggleId: 'highlightToggle',
    onSearch: searchTerm => {
      filteredTags = searchTerm ? sortedTags.filter(tag => searchTag(tag, searchTerm)) : sortedTags;
      renderTags(filteredTags, search.highlightMatch);
      updateCount(filteredTags.length, sortedTags.length);
    },
  });

  // Setup expand/collapse
  setupExpandCollapse('.tag-item, .subcommand-item', 'expandAll', 'collapseAll');

  // Setup copy buttons
  setupCopyButtons('#tagsList');

  // Initial render
  renderTags(filteredTags, search.highlightMatch);
  updateCount(filteredTags.length, sortedTags.length);

  // Display game version - dynamic-text.json doesn't have gameVersion, so we'll skip this
  // or you could add it to the JSON file if needed
  const gameVersionElement = document.getElementById('gameVersion');
  if (gameVersionElement) {
    gameVersionElement.textContent = 'Dynamic Text Tags';
  }

  // Handle deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const tagParam = urlParams.get('tag');
  if (tagParam) {
    const matchingTag = sortedTags.find(
      tag => tag.name.toLowerCase() === tagParam.toLowerCase() || tag.aliases.some(a => a.toLowerCase() === tagParam.toLowerCase())
    );

    if (matchingTag) {
      const tagElement = querySelectorAs(`.tag-item[data-tag-name="${matchingTag.name}"]`, HTMLDetailsElement);

      if (tagElement) {
        tagElement.open = true;

        setTimeout(() => {
          tagElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          tagElement.classList.add('tag-highlight');
          setTimeout(() => tagElement.classList.remove('tag-highlight'), 2000);
        }, 100);
      }
    }
  }

  function searchTag(tag: Tag, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();

    // Search in tag name
    if (tag.name.toLowerCase().includes(term)) return true;

    // Search in aliases
    if (tag.aliases && tag.aliases.some(a => a.toLowerCase().includes(term))) return true;

    // Search in description
    if (tag.description.toLowerCase().includes(term)) return true;

    // Search in required arguments
    if (
      tag.required.some(arg => arg.name.toLowerCase().includes(term) || arg.description.toLowerCase().includes(term))
    ) {
      return true;
    }

    // Search in optional arguments
    if (
      tag.optional.some(arg => arg.name.toLowerCase().includes(term) || arg.description.toLowerCase().includes(term))
    ) {
      return true;
    }

    // Search in subcommands (commands field)
    if (tag.commands) {
      return tag.commands.some(subcommand => searchTag(subcommand, searchTerm));
    }

    return false;
  }

  function renderTags(tags: Tag[], highlightMatch: (text: string) => string): void {
    const tagsList = getElementById('tagsList');

    if (tags.length === 0) {
      tagsList.innerHTML = '<p class="placeholder">No tags match your search.</p>';
      return;
    }

    // Save current open state of all tags
    const openStates = new Map<string, boolean>();
    querySelectorAllAs('.tag-item', HTMLDetailsElement, tagsList).forEach(item => {
      const tagName = item.getAttribute('data-tag-name');
      if (tagName) {
        openStates.set(tagName, item.open);
      }
    });

    tagsList.innerHTML = tags.map(tag => renderTag(tag, highlightMatch)).join('');

    // Restore open state
    querySelectorAllAs('.tag-item', HTMLDetailsElement, tagsList).forEach(item => {
      const tagName = item.getAttribute('data-tag-name');
      if (tagName && openStates.has(tagName)) {
        item.open = openStates.get(tagName)!;
      }
    });
  }

  function renderTag(tag: Tag, highlight: (text: string) => string): string {
    const hasRequired = tag.required && tag.required.length > 0;
    const hasOptional = tag.optional && tag.optional.length > 0;
    const hasAliases = tag.aliases && tag.aliases.length > 0;
    const hasCommands = tag.commands && tag.commands.length > 0;
    const tagUrl = `${window.location.origin}${window.location.pathname}?tag=${encodeURIComponent(tag.name)}`;

    return `
      <details class="tag-item" data-tag-name="${tag.name}">
        <summary class="tag-summary">
          <span class="tag-name">${highlight(tag.name)}</span>
          <span class="tag-brief">${highlight(tag.description)}</span>
        </summary>
        <div class="tag-details">
          <div class="tag-header-row">
            <div class="tag-description">${highlight(tag.description)}</div>
            <button class="copy-link-btn" data-url="${tagUrl}" title="Copy link to this tag">🔗</button>
          </div>

          ${
            hasAliases
              ? `
          <div class="tag-info-sections">
            <div class="info-section">
              <h4 class="info-header">Aliases</h4>
              <div class="info-content">
                <code class="info-code">${tag.aliases.map(a => highlight(a)).join(', ')}</code>
              </div>
            </div>
          </div>`
              : ''
          }

          ${
            hasRequired
              ? `
          <div class="tag-arguments">
            <h4 class="arguments-header required">Required Arguments</h4>
            <ul class="arguments-list">
              ${tag.required
                .map(
                  arg => `
                <li class="argument-item">
                  <code class="argument-name">${highlight(arg.name)}</code>
                  <span class="argument-description">${highlight(arg.description)}</span>
                </li>`
                )
                .join('')}
            </ul>
          </div>`
              : ''
          }

          ${
            hasOptional
              ? `
          <div class="tag-arguments">
            <h4 class="arguments-header optional">Optional Arguments</h4>
            <ul class="arguments-list">
              ${tag.optional
                .map(
                  arg => `
                <li class="argument-item">
                  <code class="argument-name">${highlight(arg.name)}</code>
                  <span class="argument-description">${highlight(arg.description)}</span>
                </li>`
                )
                .join('')}
            </ul>
          </div>`
              : ''
          }

          ${!hasRequired && !hasOptional ? '<p class="no-arguments">No arguments</p>' : ''}

          ${
            hasCommands
              ? `
          <div class="subcommands-section">
            <h4 class="subcommands-header">Subcommands</h4>
            <div class="subcommands-list">
              ${tag.commands!.map(subcommand => renderSubcommand(subcommand, highlight)).join('')}
            </div>
          </div>`
              : ''
          }
        </div>
      </details>`;
  }

  function renderSubcommand(subcommand: Tag, highlight: (text: string) => string): string {
    const hasRequired = subcommand.required && subcommand.required.length > 0;
    const hasOptional = subcommand.optional && subcommand.optional.length > 0;
    const hasAliases = subcommand.aliases && subcommand.aliases.length > 0;

    return `
      <details class="subcommand-item" data-subcommand-name="${subcommand.name}">
        <summary class="subcommand-summary">
          <span class="subcommand-name">${highlight(subcommand.name)}</span>
          <span class="subcommand-brief">${highlight(subcommand.description)}</span>
        </summary>
        <div class="subcommand-details">
          <div class="subcommand-description">${highlight(subcommand.description)}</div>

          ${
            hasAliases
              ? `
          <div class="tag-info-sections">
            <div class="info-section">
              <h4 class="info-header">Aliases</h4>
              <div class="info-content">
                <code class="info-code">${subcommand.aliases.map(a => highlight(a)).join(', ')}</code>
              </div>
            </div>
          </div>`
              : ''
          }

          ${
            hasRequired
              ? `
          <div class="tag-arguments">
            <h4 class="arguments-header required">Required Arguments</h4>
            <ul class="arguments-list">
              ${subcommand.required
                .map(
                  arg => `
                <li class="argument-item">
                  <code class="argument-name">${highlight(arg.name)}</code>
                  <span class="argument-description">${highlight(arg.description)}</span>
                </li>`
                )
                .join('')}
            </ul>
          </div>`
              : ''
          }

          ${
            hasOptional
              ? `
          <div class="tag-arguments">
            <h4 class="arguments-header optional">Optional Arguments</h4>
            <ul class="arguments-list">
              ${subcommand.optional
                .map(
                  arg => `
                <li class="argument-item">
                  <code class="argument-name">${highlight(arg.name)}</code>
                  <span class="argument-description">${highlight(arg.description)}</span>
                </li>`
                )
                .join('')}
            </ul>
          </div>`
              : ''
          }

          ${!hasRequired && !hasOptional ? '<p class="no-arguments">No arguments</p>' : ''}
        </div>
      </details>`;
  }

  function updateCount(showing: number, total: number): void {
    const tagCount = getElementById('tagCount');
    tagCount.textContent = showing === total ? `${total} tags` : `${showing} / ${total} tags`;
  }
}

// Initialize on page load
initDynamicTextApp();
