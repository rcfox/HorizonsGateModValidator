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
import type { TasksData, TaskMetadata } from '../types.js';
import rawTasksData from '../tasks.json';

const tasksData = rawTasksData as TasksData;

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

  function renderTask(task: TaskMetadata, highlight: (text: string) => string): string {
    const taskUrl = `${window.location.origin}${window.location.pathname}?task=${encodeURIComponent(task.name)}`;
    const issueTitle = encodeURIComponent(`[Task Documentation] Issue with "${task.name}" task`);
    const issueBody = encodeURIComponent(
      `**Task Name:** \`${task.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this task's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;
    const hasAliases = task.aliases && task.aliases.length > 0;

    return task.uses
      .map((useCase, useIndex) => {
        const taskKey = `${task.name}-use-${useIndex}`;
        const hasRequired = useCase.required && useCase.required.length > 0;
        const hasOptional = useCase.optional && useCase.optional.length > 0;

        return `
      <details class="task-item" data-task-name="${task.name}" data-task-key="${taskKey}">
        <summary class="task-summary">
          <span class="task-name">${highlight(task.name)}</span>
          <span class="task-brief">${highlight(useCase.description)}</span>
        </summary>
        <div class="task-details">
          <div class="task-header-row">
            <div class="task-description">${highlight(useCase.description)}</div>
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

          ${!hasRequired && !hasOptional ? '<p class="no-arguments">No arguments</p>' : ''}

          <div class="task-disclaimer">
            Due to the number of tasks, these descriptions were initially generated using AI. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>`;
      })
      .join('');
  }

  function updateCount(showing: number, total: number): void {
    const taskCount = getElementById('taskCount');
    taskCount.textContent = showing === total ? `${total} tasks` : `${showing} / ${total} tasks`;
  }
}

// Initialize on page load
initTasksApp();
