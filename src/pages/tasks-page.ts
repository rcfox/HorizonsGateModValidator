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
  querySelectorAs,
  querySelectorAllAs,
} from './shared-utils.js';
import type { TasksData, TaskMetadata } from '../types.js';
import rawTasksData from '../tasks.json';

const tasksData = rawTasksData as TasksData;

// Convert array notation to user-friendly variable names
function convertToFriendlyNames(text: string): string {
  return (
    text
      // tileCoords with property access (must come first, most specific)
      .replace(/tileCoords\[(\d+)\]\.X/g, (_match, num) => {
        const n = parseInt(num);
        return n === 0 ? 'xValue' : `xValue${n + 1}`;
      })
      .replace(/tileCoords\[(\d+)\]\.Y/g, (_match, num) => {
        const n = parseInt(num);
        return n === 0 ? 'yValue' : `yValue${n + 1}`;
      })

      // tileCoords general (any index or no index)
      .replace(/tileCoords\[\d+\]/g, '(xValue, yValue)')
      .replace(/tileCoords/g, '(xValue, yValue)')

      // strings (specific indexes first, then general)
      .replace(/strings\[0\]/g, 'sValue')
      .replace(/strings\[1\]/g, 'sValue2')
      .replace(/strings\[(\d+)\]/g, (_match, num) => {
        const n = parseInt(num);
        return n === 0 ? 'sValue' : `sValue${n + 1}`;
      })

      // floats
      .replace(/floats\[0\]/g, 'fValue')
      .replace(/floats\[1\]/g, 'fValue2')
      .replace(/floats\[(\d+)\]/g, (_match, num) => {
        const n = parseInt(num);
        return n === 0 ? 'fValue' : `fValue${n + 1}`;
      })

      // bools
      .replace(/bools\[0\]/g, 'bValue1')
      .replace(/bools\[1\]/g, 'bValue2')
      .replace(/bools\[(\d+)\]/g, (_match, num) => `bValue${parseInt(num) + 1}`)
  );
}

// Convert task data to use friendly names
function convertTaskData(tasks: TaskMetadata[]): TaskMetadata[] {
  return tasks.map(task => ({
    ...task,
    name: convertToFriendlyNames(task.name),
    description: convertToFriendlyNames(task.description),
    required: task.required.map(arg => ({
      name: convertToFriendlyNames(arg.name),
      description: convertToFriendlyNames(arg.description),
    })),
    optional: task.optional.map(arg => ({
      name: convertToFriendlyNames(arg.name),
      description: convertToFriendlyNames(arg.description),
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
    const matchingTask = convertedTasks.find(task => task.name.toLowerCase() === taskParam.toLowerCase());

    if (matchingTask) {
      const taskElement = querySelectorAs(`.task-item[data-task-name="${matchingTask.name}"]`, HTMLDetailsElement);

      if (taskElement) {
        taskElement.open = true;

        setTimeout(() => {
          taskElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          taskElement.classList.add('task-highlight');
          setTimeout(() => taskElement.classList.remove('task-highlight'), 2000);
        }, 100);
      }
    }
  }

  function searchTask(task: TaskMetadata, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();
    if (task.name.toLowerCase().includes(term)) return true;
    if (task.description.toLowerCase().includes(term)) return true;

    if (
      task.required.some(arg => arg.name.toLowerCase().includes(term) || arg.description.toLowerCase().includes(term))
    ) {
      return true;
    }

    if (
      task.optional.some(arg => arg.name.toLowerCase().includes(term) || arg.description.toLowerCase().includes(term))
    ) {
      return true;
    }

    return false;
  }

  function renderTasks(tasks: TaskMetadata[], highlightMatch: (text: string) => string): void {
    const tasksList = getElementById('tasksList');

    if (tasks.length === 0) {
      tasksList.innerHTML = '<p class="placeholder">No tasks match your search.</p>';
      return;
    }

    // Save current open state of all tasks
    const openStates = new Map<string, boolean>();
    querySelectorAllAs('.task-item', HTMLDetailsElement, tasksList).forEach(item => {
      const taskName = item.getAttribute('data-task-name');
      if (taskName) {
        openStates.set(taskName, item.open);
      }
    });

    tasksList.innerHTML = tasks.map(task => renderTask(task, highlightMatch)).join('');

    // Restore open state
    querySelectorAllAs('.task-item', HTMLDetailsElement, tasksList).forEach(item => {
      const taskName = item.getAttribute('data-task-name');
      if (taskName && openStates.has(taskName)) {
        item.open = openStates.get(taskName)!;
      }
    });
  }

  function renderTask(task: TaskMetadata, highlight: (text: string) => string): string {
    const hasRequired = task.required && task.required.length > 0;
    const hasOptional = task.optional && task.optional.length > 0;
    const taskUrl = `${window.location.origin}${window.location.pathname}?task=${encodeURIComponent(task.name)}`;
    const issueTitle = encodeURIComponent(`[Task Documentation] Issue with "${task.name}" task`);
    const issueBody = encodeURIComponent(
      `**Task Name:** \`${task.name}\`\n\n**Issue Description:**\n<!-- Describe what's wrong or unclear about this task's documentation -->\n\n\n**Expected:**\n<!-- What should the documentation say? -->\n\n\n<!-- Please provide as much detail as possible -->`
    );
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;

    return `
      <details class="task-item" data-task-name="${task.name}">
        <summary class="task-summary">
          <span class="task-name">${highlight(task.name)}</span>
          <span class="task-brief">${highlight(task.description)}</span>
        </summary>
        <div class="task-details">
          <div class="task-header-row">
            <div class="task-description">${highlight(task.description)}</div>
            <button class="copy-link-btn" data-url="${taskUrl}" title="Copy link to this task">🔗</button>
          </div>

          ${
            hasRequired
              ? `
            <div class="task-arguments">
              <h4 class="arguments-header required">Required Arguments</h4>
              <ul class="arguments-list">
                ${task.required
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
                ${task.optional
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
  }

  function updateCount(showing: number, total: number): void {
    const taskCount = getElementById('taskCount');
    taskCount.textContent = showing === total ? `${total} tasks` : `${showing} / ${total} tasks`;
  }
}

// Initialize on page load
initTasksApp();
