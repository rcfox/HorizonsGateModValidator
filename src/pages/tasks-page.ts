/**
 * Tasks reference page
 * Uses shared utilities for common functionality
 */

import {
  initTheme,
  setupSearch,
  setupExpandCollapse,
  setupCopyButtons,
  getElementById,
  querySelectorAllAs,
  convertTaskParamToFriendlyName,
} from './shared-utils.js';
import type { TasksData, TaskMetadata, TaskUseCase } from '../types.js';
import rawTasksData from '../tasks.json';
import rawTasksDataPrev from '../tasks_prev.json';

const tasksData = rawTasksData as TasksData;
const tasksDataPrev = rawTasksDataPrev as TasksData;

// Convert task data to use friendly names
function convertTaskData(tasks: TaskMetadata[]): TaskMetadata[] {
  return tasks.map(task => ({
    ...task,
    name: convertTaskParamToFriendlyName(task.name),
    uses: task.uses.map(useCase => ({
      description: convertTaskParamToFriendlyName(useCase.description),
      required: useCase.required.map(arg => ({
        name: convertTaskParamToFriendlyName(arg.name),
        description: convertTaskParamToFriendlyName(arg.description),
      })),
      optional: useCase.optional.map(arg => ({
        name: convertTaskParamToFriendlyName(arg.name),
        description: convertTaskParamToFriendlyName(arg.description),
      })),
    })),
  }));
}

const convertedPrevTasks = convertTaskData(tasksDataPrev.tasks);
const prevTaskByAlias = new Map<string, TaskMetadata>();
for (const task of convertedPrevTasks) {
  prevTaskByAlias.set(task.name.toLowerCase(), task);
  if (task.aliases) {
    for (const alias of task.aliases) {
      prevTaskByAlias.set(alias.toLowerCase(), task);
    }
  }
}

function findPrevTask(task: TaskMetadata): TaskMetadata | undefined {
  const candidates = [task.name, ...(task.aliases ?? [])];
  for (const id of candidates) {
    const prev = prevTaskByAlias.get(id.toLowerCase());
    if (prev) return prev;
  }
  return undefined;
}

export function initTasksApp(): void {
  // Check if we're on the tasks page
  if (!document.getElementById('tasksList')) return;

  // Theme management
  initTheme();

  // Convert task data
  const convertedTasks = convertTaskData(tasksData.tasks);
  let filteredTasks = convertedTasks;

  // Setup search
  const search = setupSearch({
    searchInputId: 'searchInput',
    clearButtonId: 'clearSearch',
    highlightToggleId: 'highlightToggle',
    onSearch: searchTerm => {
      filteredTasks = searchTerm ? convertedTasks.filter(task => searchTask(task, searchTerm)) : convertedTasks;
      renderTasks(filteredTasks, search.highlightMatch);
      updateCount(filteredTasks.length, convertedTasks.length);
    },
  });

  // Setup expand/collapse
  setupExpandCollapse('.task-item', 'expandAll', 'collapseAll');

  // Setup copy buttons
  setupCopyButtons('#tasksList');

  // Setup version tabs (event delegation, survives re-renders)
  setupVersionTabs();

  // Initial render
  renderTasks(filteredTasks, search.highlightMatch);
  updateCount(filteredTasks.length, convertedTasks.length);

  // Display game version
  const gameVersionElement = getElementById('gameVersion');
  gameVersionElement.textContent = `Up to date for v${tasksData.gameVersion}`;

  // Handle deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const taskParam = urlParams.get('task');
  if (taskParam) {
    // Try to find by name first, then check aliases
    let matchingTask = convertedTasks.find(task => task.name.toLowerCase() === taskParam.toLowerCase());

    // If not found by name, check if taskParam is an alias
    if (!matchingTask) {
      matchingTask = convertedTasks.find(task =>
        task.aliases && task.aliases.some(alias => alias.toLowerCase() === taskParam.toLowerCase())
      );
    }

    if (matchingTask) {
      // Open all use cases for this task
      const taskElements = querySelectorAllAs(`.task-item[data-task-name="${matchingTask.name}"]`, HTMLDetailsElement);

      if (taskElements.length > 0) {
        taskElements.forEach(el => {
          el.open = true;
        });

        setTimeout(() => {
          taskElements[0]!.scrollIntoView({ behavior: 'smooth', block: 'start' });
          taskElements.forEach(el => {
            el.classList.add('task-highlight');
            setTimeout(() => el.classList.remove('task-highlight'), 2000);
          });
        }, 100);
      }
    }
  }

  function searchTask(task: TaskMetadata, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();
    if (task.name.toLowerCase().includes(term)) return true;

    // Search aliases
    if (task.aliases && task.aliases.some(a => a.toLowerCase().includes(term))) return true;

    // Search official description
    if (task.officialDescription && task.officialDescription.toLowerCase().includes(term)) return true;

    // Search within use cases
    return task.uses.some(useCase => {
      if (useCase.description.toLowerCase().includes(term)) return true;

      if (
        useCase.required.some(arg => arg.name.toLowerCase().includes(term) || arg.description.toLowerCase().includes(term))
      ) {
        return true;
      }

      if (
        useCase.optional.some(arg => arg.name.toLowerCase().includes(term) || arg.description.toLowerCase().includes(term))
      ) {
        return true;
      }

      return false;
    });
  }

  function renderTasks(tasks: TaskMetadata[], highlightMatch: (text: string) => string): void {
    const tasksList = getElementById('tasksList');

    if (tasks.length === 0) {
      tasksList.innerHTML = '<p class="placeholder">No tasks match your search.</p>';
      return;
    }

    // Save current open state of all task use cases
    const openStates = new Map<string, boolean>();
    querySelectorAllAs('.task-item', HTMLDetailsElement, tasksList).forEach(item => {
      const taskKey = item.getAttribute('data-task-key');
      if (taskKey) {
        openStates.set(taskKey, item.open);
      }
    });

    tasksList.innerHTML = tasks.map(task => renderTask(task, highlightMatch)).join('');

    // Restore open state
    querySelectorAllAs('.task-item', HTMLDetailsElement, tasksList).forEach(item => {
      const taskKey = item.getAttribute('data-task-key');
      if (taskKey && openStates.has(taskKey)) {
        item.open = openStates.get(taskKey)!;
      }
    });
  }

  function renderUseCaseBody(useCase: TaskUseCase, highlight: (text: string) => string): string {
    const hasRequired = useCase.required && useCase.required.length > 0;
    const hasOptional = useCase.optional && useCase.optional.length > 0;

    return `
          <div class="task-description">${highlight(useCase.description)}</div>

          ${
            hasRequired
              ? `
            <div class="task-arguments">
              <h4 class="arguments-header required">Required Arguments</h4>
              <ul class="arguments-list">
                ${useCase.required
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
            <div class="task-arguments">
              <h4 class="arguments-header optional">Optional Arguments</h4>
              <ul class="arguments-list">
                ${useCase.optional
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

          ${!hasRequired && !hasOptional ? '<p class="no-arguments">No arguments</p>' : ''}`;
  }

  function renderTask(task: TaskMetadata, highlight: (text: string) => string): string {
    const taskUrl = `${window.location.origin}${window.location.pathname}?task=${encodeURIComponent(task.name)}`;
    const issueTitle = encodeURIComponent(`[Task Documentation] Issue with "${task.name}" task`);
    const issueBody = encodeURIComponent(
      `**Task Name:** \`${task.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this task's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;
    const hasAliases = task.aliases && task.aliases.length > 0;
    const isDoNotUse = task.officialDescription?.includes('DO NOT USE') ?? false;
    const prevTask = findPrevTask(task);

    const nameIcons = `${
      task.consoleCommand
        ? '<span class="task-name-icon task-icon-console" title="Console Command" aria-label="Console Command">🖥️</span>'
        : ''
    }${
      isDoNotUse
        ? '<span class="task-name-icon task-icon-warning" title="Do not use" aria-label="Do not use">❌</span>'
        : ''
    }`;

    return task.uses
      .map((useCase, useIndex) => {
        const taskKey = `${task.name}-use-${useIndex}`;

        const currentBody = `
          ${renderUseCaseBody(useCase, highlight)}

          ${
            task.officialDescription
              ? `
          <div class="task-official-description">
            <h4 class="info-header">Official Description</h4>
            <div class="info-content">${highlight(task.officialDescription)}</div>
          </div>`
              : ''
          }`;

        const prevBody = prevTask
          ? prevTask.uses.map(u => renderUseCaseBody(u, highlight)).join('<hr class="version-use-separator" />')
          : '';

        return `
      <details class="task-item" data-task-name="${task.name}" data-task-key="${taskKey}">
        <summary class="task-summary">
          <span class="task-name">${highlight(task.name)}${nameIcons}</span>
          <span class="task-brief">${highlight(useCase.description)}</span>
        </summary>
        <div class="task-details">
          <div class="task-header-row">
            ${
              prevTask
                ? `<div class="version-tabs" role="tablist">
                    <button type="button" class="version-tab active" data-version="current" role="tab">v${tasksData.gameVersion}</button>
                    <button type="button" class="version-tab" data-version="prev" role="tab">v${tasksDataPrev.gameVersion}</button>
                  </div>`
                : '<div class="version-tabs-spacer"></div>'
            }
            <button class="copy-name-btn" data-name="${task.name}" title="Copy name">📋</button>
            <button class="copy-link-btn" data-url="${taskUrl}" title="Copy link to this task">🔗</button>
          </div>

          ${
            hasAliases
              ? `
          <div class="task-info-sections">
            <div class="info-section">
              <h4 class="info-header">Aliases</h4>
              <div class="info-content">
                <code class="info-code">${task.aliases.map(a => highlight(a)).join(', ')}</code>
              </div>
            </div>
          </div>`
              : ''
          }

          <div class="version-content active" data-version="current">
            ${currentBody}
          </div>
          ${
            prevTask
              ? `<div class="version-content" data-version="prev">
                  ${prevBody}
                </div>`
              : ''
          }

          <div class="task-disclaimer">
            Due to the number of tasks, these descriptions were initially generated using AI. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>`;
      })
      .join('');
  }

  function setupVersionTabs(): void {
    const tasksList = getElementById('tasksList');
    tasksList.addEventListener('click', e => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tab = target.closest('.version-tab');
      if (!tab) return;
      e.preventDefault();
      e.stopPropagation();
      const details = tab.closest('.task-details');
      if (!details) return;
      const version = tab.getAttribute('data-version');
      details.querySelectorAll('.version-tab').forEach(t => t.classList.toggle('active', t === tab));
      details
        .querySelectorAll('.version-content')
        .forEach(c => c.classList.toggle('active', c.getAttribute('data-version') === version));
    });
  }

  function updateCount(showing: number, total: number): void {
    const taskCount = getElementById('taskCount');
    taskCount.textContent = showing === total ? `${total} tasks` : `${showing} / ${total} tasks`;
  }
}

// Initialize on page load
initTasksApp();
