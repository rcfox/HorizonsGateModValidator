import tasksData from './tasks.json';

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

// Tasks functionality
interface TaskArgument {
  name: string;
  description: string;
}

interface Task {
  name: string;
  description: string;
  required: TaskArgument[];
  optional: TaskArgument[];
}

interface TasksData {
  gameVersion: string;
  tasks: Task[];
}

// Convert array notation to user-friendly variable names
function convertToFriendlyNames(text: string): string {
  return text
    // tileCoords with property access (must come first, most specific)
    .replace(/tileCoords\[(\d+)\]\.X/g, (match, num) => {
      const n = parseInt(num);
      return n === 0 ? 'xValue' : `xValue${n + 1}`;
    })
    .replace(/tileCoords\[(\d+)\]\.Y/g, (match, num) => {
      const n = parseInt(num);
      return n === 0 ? 'yValue' : `yValue${n + 1}`;
    })

    // tileCoords general (any index or no index)
    .replace(/tileCoords\[\d+\]/g, '(xValue, yValue)')
    .replace(/tileCoords/g, '(xValue, yValue)')

    // strings (specific indexes first, then general)
    .replace(/strings\[0\]/g, 'sValue')
    .replace(/strings\[1\]/g, 'sValue2')
    .replace(/strings\[(\d+)\]/g, (match, num) => {
      const n = parseInt(num);
      return n === 0 ? 'sValue' : `sValue${n + 1}`;
    })

    // floats
    .replace(/floats\[0\]/g, 'fValue')
    .replace(/floats\[1\]/g, 'fValue2')
    .replace(/floats\[(\d+)\]/g, (match, num) => {
      const n = parseInt(num);
      return n === 0 ? 'fValue' : `fValue${n + 1}`;
    })

    // bools
    .replace(/bools\[0\]/g, 'bValue1')
    .replace(/bools\[1\]/g, 'bValue2')
    .replace(/bools\[(\d+)\]/g, (match, num) => `bValue${parseInt(num) + 1}`);
}

// Convert task data to use friendly names
function convertTaskData(tasks: Task[]): Task[] {
  return tasks.map(task => ({
    ...task,
    name: convertToFriendlyNames(task.name),
    description: convertToFriendlyNames(task.description),
    required: task.required.map(arg => ({
      name: convertToFriendlyNames(arg.name),
      description: convertToFriendlyNames(arg.description)
    })),
    optional: task.optional.map(arg => ({
      name: convertToFriendlyNames(arg.name),
      description: convertToFriendlyNames(arg.description)
    }))
  }));
}

const convertedTasks = convertTaskData(tasksData.tasks);
let filteredTasks: Task[] = convertedTasks;
let searchTerm = '';
let highlightEnabled = localStorage.getItem('highlightEnabled') !== 'false'; // Default to true unless explicitly disabled

// Render tasks to the DOM
function renderTasks(tasks: Task[]) {
  const tasksList = document.getElementById('tasksList')!;

  if (tasks.length === 0) {
    tasksList.innerHTML = '<p class="placeholder">No tasks match your search.</p>';
    return;
  }

  // Save current open state of all tasks
  const openStates = new Map<string, boolean>();
  tasksList.querySelectorAll('.task-item').forEach(item => {
    const taskName = item.getAttribute('data-task-name');
    if (taskName) {
      openStates.set(taskName, (item as HTMLDetailsElement).open);
    }
  });

  tasksList.innerHTML = tasks.map(task => {
    const hasRequired = task.required && task.required.length > 0;
    const hasOptional = task.optional && task.optional.length > 0;

    const issueTitle = encodeURIComponent(`[Task Documentation] Issue with "${task.name}" task`);
    const issueBody = encodeURIComponent(`**Task Name:** \`${task.name}\`

**Issue Description:**
<!-- Describe what's wrong or unclear about this task's documentation -->


**Expected:**
<!-- What should the documentation say? -->


<!-- Please provide as much detail as possible -->`);
    const issueUrl = `https://github.com/rcfox/HorizonsGateModValidator/issues/new?title=${issueTitle}&body=${issueBody}`;

    return `
      <details class="task-item" data-task-name="${escapeHtml(task.name)}">
        <summary class="task-summary">
          <span class="task-name">${highlightMatch(task.name)}</span>
          <span class="task-brief">${highlightMatch(task.description)}</span>
        </summary>
        <div class="task-details">
          <div class="task-header-row">
            <div class="task-description">
              ${highlightMatch(task.description)}
            </div>
            <a href="${issueUrl}" target="_blank" class="report-issue-link" title="Report issue with this task">⚠️ Report Issue</a>
          </div>

          ${hasRequired ? `
            <div class="task-arguments">
              <h4 class="arguments-header required">Required Arguments</h4>
              <ul class="arguments-list">
                ${task.required.map(arg => `
                  <li class="argument-item">
                    <code class="argument-name">${highlightMatch(arg.name)}</code>
                    <span class="argument-description">${highlightMatch(arg.description)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${hasOptional ? `
            <div class="task-arguments">
              <h4 class="arguments-header optional">Optional Arguments</h4>
              <ul class="arguments-list">
                ${task.optional.map(arg => `
                  <li class="argument-item">
                    <code class="argument-name">${highlightMatch(arg.name)}</code>
                    <span class="argument-description">${highlightMatch(arg.description)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${!hasRequired && !hasOptional ? `
            <p class="no-arguments">No arguments</p>
          ` : ''}

          <div class="task-disclaimer">
            Due to the number of tasks, these descriptions were initially generated using AI. Report any mistakes here: <a href="${issueUrl}" target="_blank" class="disclaimer-report-link">Report Issue</a>
          </div>
        </div>
      </details>
    `;
  }).join('');

  // Restore open state
  tasksList.querySelectorAll('.task-item').forEach(item => {
    const taskName = item.getAttribute('data-task-name');
    if (taskName && openStates.has(taskName)) {
      (item as HTMLDetailsElement).open = openStates.get(taskName)!;
    }
  });
}

// Search functionality
function searchTasks(query: string) {
  searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    filteredTasks = convertedTasks;
    renderTasks(filteredTasks);
    updateTaskCount(filteredTasks.length, convertedTasks.length);
    return;
  }

  filteredTasks = convertedTasks.filter(task => {
    // Search in task name
    if (task.name.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Search in description
    if (task.description.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Search in required arguments
    if (task.required && task.required.some(arg =>
      arg.name.toLowerCase().includes(searchTerm) ||
      arg.description.toLowerCase().includes(searchTerm)
    )) {
      return true;
    }

    // Search in optional arguments
    if (task.optional && task.optional.some(arg =>
      arg.name.toLowerCase().includes(searchTerm) ||
      arg.description.toLowerCase().includes(searchTerm)
    )) {
      return true;
    }

    return false;
  });

  renderTasks(filteredTasks);
  updateTaskCount(filteredTasks.length, convertedTasks.length);
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

// Update task count display
function updateTaskCount(showing: number, total: number) {
  const taskCount = document.getElementById('taskCount')!;
  if (showing === total) {
    taskCount.textContent = `${total} tasks`;
  } else {
    taskCount.textContent = `${showing} / ${total} tasks`;
  }
}

// Expand/collapse all functionality
function expandAll() {
  document.querySelectorAll('.task-item').forEach(details => {
    (details as HTMLDetailsElement).open = true;
  });
}

function collapseAll() {
  document.querySelectorAll('.task-item').forEach(details => {
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
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => {
    searchTasks((e.target as HTMLInputElement).value);
  }, 300);

  // Show/hide clear button
  clearSearch.style.display = (e.target as HTMLInputElement).value ? 'block' : 'none';
});

clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  clearSearch.style.display = 'none';
  searchTasks('');
  searchInput.focus();
});

expandAllBtn.addEventListener('click', expandAll);
collapseAllBtn.addEventListener('click', collapseAll);

highlightToggle.addEventListener('change', (e) => {
  highlightEnabled = (e.target as HTMLInputElement).checked;
  localStorage.setItem('highlightEnabled', highlightEnabled.toString());
  renderTasks(filteredTasks);
});

// Keyboard shortcut for search (Ctrl+F or Cmd+F)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// Initialize
highlightToggle.checked = highlightEnabled;
renderTasks(filteredTasks);
updateTaskCount(filteredTasks.length, convertedTasks.length);

// Display game version
const gameVersionElement = document.getElementById('gameVersion')!;
gameVersionElement.textContent = `Up to date for v${tasksData.gameVersion}`;
