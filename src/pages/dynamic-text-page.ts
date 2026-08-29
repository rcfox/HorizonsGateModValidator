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
  querySelectorAllAs,
} from './shared-utils.js';
import {
  DYNAMIC_TEXT_PRIMITIVE_TYPES,
  DYNAMIC_TEXT_RESOURCE_TYPES,
  type DynamicTextArgument,
  type DynamicTextArgumentType,
  type DynamicTextCommand,
  type DynamicTextData,
  type DynamicTextEntry,
  type DynamicTextTag,
  type DynamicTextUseCase,
} from '../types.js';
import rawDynamicTextData from '../dynamic-text.json';

const dynamicTextData = rawDynamicTextData as DynamicTextData;

const PRIMITIVE_TYPES: ReadonlySet<string> = new Set(DYNAMIC_TEXT_PRIMITIVE_TYPES);
const RESOURCE_TYPES: ReadonlySet<string> = new Set(DYNAMIC_TEXT_RESOURCE_TYPES);

/**
 * How an argument's type is styled: parsed value, built-in game resource, or a
 * reference to a mod-defined object or enum.
 */
function argumentTypeClass(type: DynamicTextArgumentType): string {
  if (PRIMITIVE_TYPES.has(type)) return 'type-primitive';
  if (RESOURCE_TYPES.has(type)) return 'type-resource';
  return 'type-reference';
}

function argumentTypeTitle(type: DynamicTextArgumentType): string {
  if (PRIMITIVE_TYPES.has(type)) return `Value type: ${type}`;
  if (RESOURCE_TYPES.has(type)) return `Name of a built-in game resource: ${type}`;
  return `ID of a ${type}`;
}

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

  const gameVersionElement = document.getElementById('gameVersion');
  if (gameVersionElement) {
    gameVersionElement.textContent = `Up to date for v${dynamicTextData.gameVersion}`;
  }

  // Handle deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const tagParam = urlParams.get('tag');
  if (tagParam) {
    const matchingTag = sortedTags.find(
      tag =>
        tag.name.toLowerCase() === tagParam.toLowerCase() ||
        tag.aliases.some(a => a.toLowerCase() === tagParam.toLowerCase())
    );

    if (matchingTag) {
      // A tag with several use cases is rendered as one entry per use case
      const tagElements = querySelectorAllAs(`.tag-item[data-tag-name="${matchingTag.name}"]`, HTMLDetailsElement);

      if (tagElements.length > 0) {
        tagElements.forEach(el => {
          el.open = true;
        });

        setTimeout(() => {
          tagElements[0]!.scrollIntoView({ behavior: 'smooth', block: 'start' });
          tagElements.forEach(el => {
            el.classList.add('tag-highlight');
            setTimeout(() => el.classList.remove('tag-highlight'), 2000);
          });
        }, 100);
      }
    }
  }

  function searchArgument(arg: DynamicTextArgument, term: string): boolean {
    return (
      arg.name.toLowerCase().includes(term) ||
      arg.type.toLowerCase().includes(term) ||
      arg.description.toLowerCase().includes(term)
    );
  }

  function searchUseCase(useCase: DynamicTextUseCase, term: string): boolean {
    if (useCase.description.toLowerCase().includes(term)) return true;
    if (useCase.required.some(arg => searchArgument(arg, term))) return true;
    if (useCase.optional.some(arg => searchArgument(arg, term))) return true;
    return false;
  }

  function searchTag(tag: DynamicTextTag, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();

    // Search in tag name
    if (tag.name.toLowerCase().includes(term)) return true;

    // Search in aliases
    if (tag.aliases && tag.aliases.some(a => a.toLowerCase().includes(term))) return true;

    // Search in each use case: description, arguments and argument types
    if (tag.uses.some(useCase => searchUseCase(useCase, term))) return true;

    // Search in subcommands (commands field)
    if (tag.commands) {
      return tag.commands.some(
        subcommand =>
          subcommand.name.toLowerCase().includes(term) ||
          subcommand.aliases.some(a => a.toLowerCase().includes(term)) ||
          subcommand.uses.some(useCase => searchUseCase(useCase, term))
      );
    }

    return false;
  }

  function renderTags(tags: DynamicTextTag[], highlightMatch: (text: string) => string): void {
    const tagsList = getElementById('tagsList');

    if (tags.length === 0) {
      tagsList.innerHTML = '<p class="placeholder">No tags match your search.</p>';
      return;
    }

    // Save current open state of all tags
    const openStates = new Map<string, boolean>();
    querySelectorAllAs('.tag-item', HTMLDetailsElement, tagsList).forEach(item => {
      const tagKey = item.getAttribute('data-tag-key');
      if (tagKey) {
        openStates.set(tagKey, item.open);
      }
    });

    tagsList.innerHTML = tags.map(tag => renderTag(tag, highlightMatch)).join('');

    // Restore open state
    querySelectorAllAs('.tag-item', HTMLDetailsElement, tagsList).forEach(item => {
      const tagKey = item.getAttribute('data-tag-key');
      if (tagKey && openStates.has(tagKey)) {
        item.open = openStates.get(tagKey)!;
      }
    });
  }

  function renderArguments(
    args: DynamicTextArgument[],
    kind: 'required' | 'optional',
    highlight: (text: string) => string
  ): string {
    if (args.length === 0) return '';

    const heading = kind === 'required' ? 'Required Arguments' : 'Optional Arguments';

    return `
          <div class="tag-arguments">
            <h4 class="arguments-header ${kind}">${heading}</h4>
            <ul class="arguments-list">
              ${args
                .map(
                  arg => `
                <li class="argument-item">
                  <div class="argument-heading">
                    <code class="argument-name">${highlight(arg.name)}</code>
                    <code class="argument-type ${argumentTypeClass(arg.type)}" title="${argumentTypeTitle(arg.type)}">${highlight(arg.type)}</code>
                  </div>
                  <span class="argument-description">${highlight(arg.description)}</span>
                </li>`
                )
                .join('')}
            </ul>
          </div>`;
  }

  /**
   * The description and argument lists for a single use case.
   */
  function renderUseCaseBody(
    useCase: DynamicTextUseCase,
    descriptionClass: string,
    highlight: (text: string) => string
  ): string {
    const hasArguments = useCase.required.length > 0 || useCase.optional.length > 0;

    return `
          <div class="${descriptionClass}">${highlight(useCase.description)}</div>

          ${renderArguments(useCase.required, 'required', highlight)}
          ${renderArguments(useCase.optional, 'optional', highlight)}

          ${hasArguments ? '' : '<p class="no-arguments">No arguments</p>'}`;
  }

  /**
   * A use case counter, shown only when an entry has more than one, so that the
   * repeated entries in the list can be told apart.
   */
  function renderUseCaseBadge(entry: DynamicTextEntry, useIndex: number): string {
    if (entry.uses.length < 2) return '';
    return `<span class="use-case-badge" title="Use case ${useIndex + 1} of ${entry.uses.length}">${useIndex + 1}/${entry.uses.length}</span>`;
  }

  function renderAliases(aliases: string[], highlight: (text: string) => string): string {
    if (aliases.length === 0) return '';

    return `
          <div class="tag-info-sections">
            <div class="info-section">
              <h4 class="info-header">Aliases</h4>
              <div class="info-content">
                <code class="info-code">${aliases.map(a => highlight(a)).join(', ')}</code>
              </div>
            </div>
          </div>`;
  }

  /**
   * A tag is rendered as one collapsible entry per use case, since each use case
   * accepts a different set of arguments.
   */
  function renderTag(tag: DynamicTextTag, highlight: (text: string) => string): string {
    const hasCommands = tag.commands !== undefined && tag.commands.length > 0;
    const tagUrl = `${window.location.origin}${window.location.pathname}?tag=${encodeURIComponent(tag.name)}`;
    const issueTitle = encodeURIComponent(`[Dynamic Text Documentation] Issue with "${tag.name}" tag`);
    const issueBody = encodeURIComponent(
      `**Tag Name:** \`${tag.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this tag's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;

    return tag.uses
      .map(
        (useCase, useIndex) => `
      <details class="tag-item" data-tag-name="${tag.name}" data-tag-key="${tag.name}-use-${useIndex}">
        <summary class="tag-summary">
          <span class="tag-name">${highlight(tag.name)}${renderUseCaseBadge(tag, useIndex)}</span>
          <span class="tag-brief">${highlight(useCase.description)}</span>
        </summary>
        <div class="tag-details">
          <div class="tag-header-row">
            <div class="tag-header-spacer"></div>
            <button class="copy-name-btn" data-name="&lt;${tag.name}=&gt;" title="Copy name">📋</button>
            <button class="copy-link-btn" data-url="${tagUrl}" title="Copy link to this tag">🔗</button>
          </div>

          ${renderAliases(tag.aliases, highlight)}

          ${renderUseCaseBody(useCase, 'tag-description', highlight)}

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

          <div class="tag-disclaimer">
            Due to the number of tags, these descriptions were initially generated using AI. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>`
      )
      .join('');
  }

  /**
   * A subcommand is rendered as one nested collapsible entry per use case, for
   * the same reason as a tag.
   */
  function renderSubcommand(subcommand: DynamicTextCommand, highlight: (text: string) => string): string {
    return subcommand.uses
      .map(
        (useCase, useIndex) => `
      <details class="subcommand-item" data-subcommand-name="${subcommand.name}" data-subcommand-key="${subcommand.name}-use-${useIndex}">
        <summary class="subcommand-summary">
          <span class="subcommand-name">${highlight(subcommand.name)}${renderUseCaseBadge(subcommand, useIndex)}</span>
          <span class="subcommand-brief">${highlight(useCase.description)}</span>
        </summary>
        <div class="subcommand-details">
          ${renderAliases(subcommand.aliases, highlight)}

          ${renderUseCaseBody(useCase, 'subcommand-description', highlight)}
        </div>
      </details>`
      )
      .join('');
  }

  function updateCount(showing: number, total: number): void {
    const tagCount = getElementById('tagCount');
    tagCount.textContent = showing === total ? `${total} tags` : `${showing} / ${total} tags`;
  }
}

// Initialize on page load
initDynamicTextApp();
