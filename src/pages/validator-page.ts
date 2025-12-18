/**
 * Browser application for mod validator
 * Uses the bundled validator from validator.bundle.js
 */

import {
  initTheme,
  escapeHtml,
  getElementByIdAs,
  assertInstanceOf,
  querySelectorAs,
  assertDefined,
} from './shared-utils.js';
import type { ValidationResult, ValidationMessage, Correction } from '../types.js';
import JSZip from 'jszip';

// Global ModValidator from bundle
declare global {
  interface Window {
    ModValidator: {
      ModValidator: new () => {
        validate: (content: string, filePath: string) => ValidationResult;
        getKnownObjectTypes: () => string[];
      };
    };
  }
}

// File tree types - discriminated union on 'type' field
interface FileNodeTextFile {
  type: 'text-file';
  name: string;
  path: string;
  content: string; // Empty string initially, loaded asynchronously
  validationResult: ValidationResult | null; // null until validated
}

interface FileNodeBinaryFile {
  type: 'binary-file';
  name: string;
  path: string;
  file: File; // Original File object for download
}

interface FileNodeDirectory {
  type: 'directory';
  name: string;
  path: string;
  childrenMap: Map<string, FileNode>; // Maintains insertion/sort order
}

type FileNode = FileNodeTextFile | FileNodeBinaryFile | FileNodeDirectory;

interface FileManager {
  rootName: string;
  files: Map<string, FileNode>; // Map of path to FileNode for quick lookup
  currentFilePath: string | null;
}

// Reasonable limit for mod directory structures
const MAX_DIRECTORY_DEPTH = 32;

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

function filesToMap(files: File[]): Map<string, File> {
  const fileMap = new Map<string, File>();
  for (const file of files) {
    // Use webkitRelativePath if available (directory uploads), otherwise use name (single file uploads)
    const path = file.webkitRelativePath || file.name;
    fileMap.set(path, file);
  }
  return fileMap;
}

function buildFileTree(fileMap: Map<string, File>): FileNodeDirectory {
  const root: FileNodeDirectory = {
    name: 'root',
    path: '',
    type: 'directory',
    childrenMap: new Map(),
  };

  for (const [filePath, file] of fileMap) {
    const parts = filePath.split('/');
    let current: FileNodeDirectory = root;

    // Build directory structure
    for (let i = 0; i < parts.length - 1; i++) {
      const partName = parts[i];
      if (!partName) continue;

      // Use childrenMap for O(1) lookup
      let child = current.childrenMap.get(partName);
      if (!child) {
        const newDir: FileNodeDirectory = {
          name: partName,
          path: parts.slice(0, i + 1).join('/'),
          type: 'directory',
          childrenMap: new Map(),
        };
        current.childrenMap.set(partName, newDir);
        child = newDir;
      }

      // Type assertion: we know directories only contain directories until the last part
      if (child.type === 'directory') {
        current = child;
      }
    }

    // Add file
    const fileName = assertDefined(parts[parts.length - 1], 'File path should have at least one component');

    const isText = fileName.toLowerCase().endsWith('.txt');

    const fileNode: FileNode = isText
      ? {
          type: 'text-file',
          name: fileName,
          path: filePath,
          content: '', // Will be loaded asynchronously
          validationResult: null, // Not validated yet
        }
      : {
          type: 'binary-file',
          name: fileName,
          path: filePath,
          file: file, // Store original file for download
        };

    current.childrenMap.set(fileName, fileNode);
  }

  // Sort children: directories first, then files, alphabetically
  function sortChildren(node: FileNodeDirectory): void {
    // Convert to array, sort, then rebuild map to maintain sorted order
    const childArray = Array.from(node.childrenMap.values());
    childArray.sort((a, b) => {
      // Directories first, then files (text and binary treated equally)
      const aIsDir = a.type === 'directory';
      const bIsDir = b.type === 'directory';
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Rebuild map with sorted insertion order
    node.childrenMap.clear();
    for (const child of childArray) {
      node.childrenMap.set(child.name, child);
      // Recursively sort children if this is a directory
      if (child.type === 'directory') {
        sortChildren(child);
      }
    }
  }
  sortChildren(root);

  return root;
}

function flattenFileTree(root: FileNodeDirectory): Map<string, FileNode> {
  const map = new Map<string, FileNode>();

  function traverse(node: FileNode): void {
    if (node.path) {
      map.set(node.path, node);
    }
    if (node.type === 'directory') {
      node.childrenMap.forEach(traverse);
    }
  }

  traverse(root);
  return map;
}

function findFirstFileByDepth(root: FileNodeDirectory): string | null {
  // Find first text file at root level, then alphabetically
  const textFiles: FileNodeTextFile[] = [];

  function findTextFiles(node: FileNode, depth: number): void {
    if (node.type === 'text-file') {
      textFiles.push(node);
    }
    if (node.type === 'directory' && depth < MAX_DIRECTORY_DEPTH) {
      // Limit depth to prevent infinite loops
      node.childrenMap.forEach(child => findTextFiles(child, depth + 1));
    }
  }

  findTextFiles(root, 0);

  // Sort by path depth (fewer slashes = shallower), then alphabetically
  textFiles.sort((a, b) => {
    const depthA = a.path.split('/').length;
    const depthB = b.path.split('/').length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.path.localeCompare(b.path);
  });

  return textFiles[0]?.path || null;
}

// Track if the app has been initialized to prevent duplicate listeners
let isInitialized = false;
let dragDropController: AbortController | null = null;

export function cleanupValidatorApp(): void {
  dragDropController?.abort();
  dragDropController = null;
  isInitialized = false;
}

export function initValidatorApp(): void {
  // Check if we're on the validator page
  if (!document.getElementById('modInput')) return;

  // Prevent duplicate initialization
  if (isInitialized) {
    console.warn('Validator app already initialized');
    return;
  }
  isInitialized = true;

  // Theme management
  initTheme('mod-validator-theme');

  const validator = new window.ModValidator.ModValidator();

  // File manager state
  let fileManager: FileManager | null = null;
  let fileTree: FileNodeDirectory | null = null;

  // Correction data storage (for XSS safety - avoid putting user data in HTML attributes)
  const correctionsMap = new Map<string, Correction>();
  let correctionIdCounter = 0;
  const generateCorrectionId = (): string => `correction-${correctionIdCounter++}`;

  // Message data storage (for XSS safety - avoid putting file paths in HTML attributes)
  const messagesMap = new Map<string, ValidationMessage>();
  let messageIdCounter = 0;
  const generateMessageId = (): string => `message-${messageIdCounter++}`;

  // DOM elements
  const modInput = getElementByIdAs('modInput', HTMLTextAreaElement);
  const validateBtn = getElementByIdAs('validateBtn', HTMLButtonElement);
  const clearBtn = getElementByIdAs('clearBtn', HTMLButtonElement);
  const loadSampleBtn = getElementByIdAs('loadSampleBtn', HTMLButtonElement);
  const resultsContainer = getElementByIdAs('results', HTMLDivElement);
  const validationStatus = getElementByIdAs('validationStatus', HTMLDivElement);
  const lineNumbers = getElementByIdAs('lineNumbers', HTMLDivElement);

  // New elements for file tree
  const fileTreeContainer = getElementByIdAs('fileTree', HTMLDivElement);
  const fileTreeContent = getElementByIdAs('fileTreeContent', HTMLDivElement);
  const uploadFilesBtn = getElementByIdAs('uploadFilesBtn', HTMLButtonElement);
  const uploadDirBtn = getElementByIdAs('uploadDirBtn', HTMLButtonElement);
  const fileInput = getElementByIdAs('fileInput', HTMLInputElement);
  const dirInput = getElementByIdAs('dirInput', HTMLInputElement);
  const downloadZipBtn = getElementByIdAs('downloadZipBtn', HTMLButtonElement);
  const mainContainer = getElementByIdAs('main', HTMLElement);

  // Event listeners
  validateBtn.addEventListener('click', handleValidate);
  clearBtn.addEventListener('click', handleClear);
  loadSampleBtn.addEventListener('click', handleLoadSample);
  uploadFilesBtn.addEventListener('click', () => fileInput.click());
  uploadDirBtn.addEventListener('click', () => dirInput.click());
  fileInput.addEventListener('change', handleFileInputChange);
  dirInput.addEventListener('change', handleFileInputChange);
  downloadZipBtn.addEventListener('click', handleDownloadZip);

  // Handle upload dropdown with delay
  const uploadDropdown = querySelectorAs('.upload-dropdown', HTMLElement);
  const uploadMenu = querySelectorAs('.upload-menu', HTMLElement);
  let hideMenuTimeout: number | undefined;

  const showMenu = () => {
    clearTimeout(hideMenuTimeout);
    uploadMenu.style.display = 'block';
  };

  const hideMenuWithDelay = () => {
    hideMenuTimeout = window.setTimeout(() => {
      uploadMenu.style.display = 'none';
    }, 500);
  };

  uploadDropdown.addEventListener('mouseenter', showMenu);
  uploadDropdown.addEventListener('mouseleave', hideMenuWithDelay);
  uploadMenu.addEventListener('mouseenter', showMenu);
  uploadMenu.addEventListener('mouseleave', hideMenuWithDelay);

  // Sync line numbers scroll with textarea scroll
  modInput.addEventListener('scroll', () => {
    lineNumbers.scrollTop = modInput.scrollTop;
  });

  // Auto-validate on input (debounced)
  let validateTimeout: number | undefined;
  modInput.addEventListener('input', () => {
    updateLineNumbers();
    clearTimeout(validateTimeout);
    validateTimeout = window.setTimeout(handleValidate, 1000);
  });

  // Initialize line numbers
  updateLineNumbers();

  // Resize handles
  let resizeHandle1: HTMLElement | null = null;
  let resizeHandle2: HTMLElement | null = null;
  let resizeListeners: { move: (e: MouseEvent) => void; up: () => void } | null = null;

  // Resize constants - derived from CSS custom properties
  function getResizeConstants() {
    const styles = getComputedStyle(document.documentElement);

    // Create a temporary element for robust CSS value parsing
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    document.body.appendChild(tempDiv);

    // Helper to parse length values (px, em, rem, etc.) to pixels
    const parseLengthToPixels = (propertyName: string): number => {
      tempDiv.style.width = `var(${propertyName})`;
      return parseFloat(getComputedStyle(tempDiv).width);
    };

    // Helper to parse percentage values (returns 0-1 range)
    const parsePercentage = (propertyName: string): number => {
      const value = styles.getPropertyValue(propertyName).trim();
      if (!value.includes('%')) {
        throw new Error(`Expected percentage value for ${propertyName}, got: ${value}`);
      }
      return parseFloat(value) / 100;
    };

    const gridGap = parseLengthToPixels('--grid-gap');
    const constants = {
      TOTAL_GAP_WIDTH: gridGap * 2, // 2 gaps
      MIN_TREE_WIDTH: parseLengthToPixels('--min-tree-width'),
      MAX_TREE_WIDTH_PERCENT: parsePercentage('--max-tree-width-percent'),
      MIN_EDITOR_WIDTH_PERCENT: parsePercentage('--min-editor-width-percent'),
      MIN_SPLIT_PERCENT: parsePercentage('--min-split-percent'),
      MAX_SPLIT_PERCENT: parsePercentage('--max-split-percent'),
    };

    // Clean up
    document.body.removeChild(tempDiv);

    return constants;
  }

  const RESIZE_CONSTANTS = getResizeConstants();

  function createResizeHandles(): void {
    // Remove existing handles
    resizeHandle1?.remove();
    resizeHandle2?.remove();

    // Clean up old listeners if they exist
    if (resizeListeners) {
      document.removeEventListener('mousemove', resizeListeners.move);
      document.removeEventListener('mouseup', resizeListeners.up);
      resizeListeners = null;
    }

    if (!fileManager) return;

    // Create resize handle between tree and editor
    resizeHandle1 = document.createElement('div');
    resizeHandle1.className = 'resize-handle';
    resizeHandle1.id = 'resize-handle-1';

    // Create resize handle between editor and results
    resizeHandle2 = document.createElement('div');
    resizeHandle2.className = 'resize-handle';
    resizeHandle2.id = 'resize-handle-2';

    mainContainer.appendChild(resizeHandle1);
    mainContainer.appendChild(resizeHandle2);

    // Position the handles
    updateResizeHandlePositions();

    // Add resize listeners
    let isResizing = false;
    let currentHandle: HTMLElement | null = null;
    let startX = 0;
    let startWidths: number[] = [];

    const startResize = (e: MouseEvent, handle: HTMLElement) => {
      isResizing = true;
      currentHandle = handle;
      startX = e.clientX;
      handle.classList.add('active');

      // Get actual computed widths in pixels from rendered elements
      const children = Array.from(mainContainer.children).filter(
        child =>
          child.classList.contains('file-tree-section') ||
          child.classList.contains('editor-section') ||
          child.classList.contains('results-section')
      );
      startWidths = children.map(child => child.getBoundingClientRect().width);

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Add listeners for this resize operation
      resizeListeners = { move: doResize, up: stopResize };
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
    };

    const doResize = (e: MouseEvent) => {
      if (!isResizing || !currentHandle) return;

      const deltaX = e.clientX - startX;
      const containerWidth = mainContainer.offsetWidth;

      // Grid gaps (2 gaps × 20px each = 40px total)
      const totalGapWidth = RESIZE_CONSTANTS.TOTAL_GAP_WIDTH;

      if (currentHandle === resizeHandle1) {
        // Resize tree, keep results the same, adjust only editor
        const treeWidth = assertDefined(startWidths[0], 'First column width should be defined') + deltaX;
        const resultsWidth = assertDefined(startWidths[2], 'Third column width should be defined');

        // Clamp tree width
        const minTreeWidth = RESIZE_CONSTANTS.MIN_TREE_WIDTH;
        const maxTreeWidth = containerWidth * RESIZE_CONSTANTS.MAX_TREE_WIDTH_PERCENT;
        const clampedTreeWidth = Math.max(minTreeWidth, Math.min(maxTreeWidth, treeWidth));

        // Keep results the same size, adjust only editor
        const remainingWidth = containerWidth - clampedTreeWidth - totalGapWidth;
        const newResultsWidth = resultsWidth;
        const newEditorWidth = remainingWidth - newResultsWidth;

        // Make sure editor doesn't get too small (at least 30% of remaining space)
        const minEditorWidth = remainingWidth * RESIZE_CONSTANTS.MIN_EDITOR_WIDTH_PERCENT;
        const adjustedEditorWidth = Math.max(newEditorWidth, minEditorWidth);
        const adjustedResultsWidth = remainingWidth - adjustedEditorWidth;

        // Convert to percentages of container width
        const treePercent = (clampedTreeWidth / containerWidth) * 100;
        const editorPercent = (adjustedEditorWidth / containerWidth) * 100;
        const resultsPercent = (adjustedResultsWidth / containerWidth) * 100;

        mainContainer.style.gridTemplateColumns = `${treePercent}% ${editorPercent}% ${resultsPercent}%`;
      } else if (currentHandle === resizeHandle2) {
        // Resize editor/results, preserve tree width
        const treeWidth = assertDefined(startWidths[0], 'First column width should be defined');
        const editorWidth = assertDefined(startWidths[1], 'Second column width should be defined') + deltaX;

        // Calculate remaining space for editor and results (subtract tree and gaps)
        const remainingWidth = containerWidth - treeWidth - totalGapWidth;

        // Calculate editor as fraction of remaining space
        const editorOfRemaining = editorWidth / remainingWidth;

        // Clamp between 0.3 and 0.7
        const clampedEditorOfRemaining = Math.max(
          RESIZE_CONSTANTS.MIN_SPLIT_PERCENT,
          Math.min(RESIZE_CONSTANTS.MAX_SPLIT_PERCENT, editorOfRemaining)
        );

        // Calculate pixel widths
        const newEditorWidth = clampedEditorOfRemaining * remainingWidth;
        const newResultsWidth = remainingWidth - newEditorWidth;

        // Convert to percentages of container width
        const treePercent = (treeWidth / containerWidth) * 100;
        const editorPercent = (newEditorWidth / containerWidth) * 100;
        const resultsPercent = (newResultsWidth / containerWidth) * 100;

        mainContainer.style.gridTemplateColumns = `${treePercent}% ${editorPercent}% ${resultsPercent}%`;
      }

      updateResizeHandlePositions();
    };

    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        currentHandle?.classList.remove('active');
        currentHandle = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Remove listeners after resize completes
        if (resizeListeners) {
          document.removeEventListener('mousemove', resizeListeners.move);
          document.removeEventListener('mouseup', resizeListeners.up);
          resizeListeners = null;
        }
      }
    };

    if (resizeHandle1 && resizeHandle2) {
      // Capture handles in non-null variables for the closures
      const handle1 = resizeHandle1;
      const handle2 = resizeHandle2;

      handle1.addEventListener('mousedown', e => startResize(e, handle1));
      handle2.addEventListener('mousedown', e => startResize(e, handle2));
    }
  }

  function updateResizeHandlePositions(): void {
    if (!resizeHandle1 || !resizeHandle2) return;

    const fileTreeRect = fileTreeContainer.getBoundingClientRect();
    const editorRect = document.querySelector('.editor-section')?.getBoundingClientRect();
    const mainRect = mainContainer.getBoundingClientRect();

    if (fileTreeRect && mainRect) {
      const handle1Left = fileTreeRect.right - mainRect.left - 4;
      resizeHandle1.style.left = `${handle1Left}px`;
    }

    if (editorRect && mainRect) {
      const handle2Left = editorRect.right - mainRect.left - 4;
      resizeHandle2.style.left = `${handle2Left}px`;
    }
  }

  // Drag and drop support with AbortController for cleanup
  dragDropController = new AbortController();
  let dragCounter = 0;

  document.addEventListener(
    'dragenter',
    e => {
      e.preventDefault();
      dragCounter++;
      showDragOverlay();
    },
    { signal: dragDropController.signal }
  );

  document.addEventListener(
    'dragleave',
    e => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        hideDragOverlay();
      }
    },
    { signal: dragDropController.signal }
  );

  document.addEventListener(
    'dragover',
    e => {
      e.preventDefault();
    },
    { signal: dragDropController.signal }
  );

  document.addEventListener(
    'drop',
    async e => {
      e.preventDefault();
      dragCounter = 0;
      hideDragOverlay();

      const items = Array.from(e.dataTransfer?.items || []);
      const fileMap = new Map<string, File>();

      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            await collectFiles(entry, fileMap);
          }
        }
      }

      if (fileMap.size > 0) {
        await handleFilesUpload(fileMap);
      }
    },
    { signal: dragDropController.signal }
  );

  async function collectFiles(entry: FileSystemEntry, fileMap: Map<string, File>): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      await new Promise<void>(resolve => {
        fileEntry.file(file => {
          // Use entry.fullPath (without leading /) as the map key
          const path = entry.fullPath.slice(1);
          fileMap.set(path, file);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();

      // Read all entries (may require multiple calls due to browser batching)
      const readAllEntries = async (): Promise<FileSystemEntry[]> => {
        const allEntries: FileSystemEntry[] = [];
        let batch: FileSystemEntry[];

        do {
          batch = await new Promise<FileSystemEntry[]>(resolve => {
            reader.readEntries(resolve);
          });
          allEntries.push(...batch);
        } while (batch.length > 0); // Keep reading until empty

        return allEntries;
      };

      const allEntries = await readAllEntries();
      for (const childEntry of allEntries) {
        await collectFiles(childEntry, fileMap);
      }
    }
  }

  function showDragOverlay(): void {
    let overlay = document.getElementById('dragOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dragOverlay';
      overlay.className = 'drag-overlay';

      const content = document.createElement('div');
      content.className = 'drag-overlay-content';
      content.textContent = 'Drop files or folders here';
      overlay.appendChild(content);

      document.body.appendChild(overlay);
    }
  }

  function hideDragOverlay(): void {
    const overlay = document.getElementById('dragOverlay');
    if (overlay) {
      overlay.remove();
    }
  }

  async function handleFileInputChange(e: Event): Promise<void> {
    const input = assertInstanceOf(e.target, HTMLInputElement);
    if (input.files && input.files.length > 0) {
      const filesArray = Array.from(input.files);
      const fileMap = filesToMap(filesArray);
      await handleFilesUpload(fileMap);
    }
    // Reset input so the same files can be selected again
    input.value = '';
  }

  async function handleFilesUpload(fileMap: Map<string, File>): Promise<void> {
    // Check for empty upload
    if (fileMap.size === 0) {
      alert('No files were uploaded. Please select files or folders to upload.');
      return;
    }

    // Confirm if replacing existing files
    if (fileManager) {
      const proceed = confirm('This will replace all currently loaded files. Do you want to proceed?');
      if (!proceed) return;
    }

    // Warn if too many files
    if (fileMap.size > 100) {
      const proceed = confirm(
        `You are about to upload ${fileMap.size} files. This may take a moment and could slow down the validator. Do you want to proceed?`
      );
      if (!proceed) return;
    }

    // Build file tree
    fileTree = buildFileTree(fileMap);

    // Determine root name from first file's path
    const firstPath = assertDefined(fileMap.keys().next().value, 'File map should not be empty');
    const parts = firstPath.split('/');
    fileManager = {
      rootName: parts.length > 1 ? assertDefined(parts[0], 'File path should have root directory') : 'mod-files',
      files: flattenFileTree(fileTree),
      currentFilePath: null,
    };

    // Load text file contents
    const textFiles = Array.from(fileManager.files.values()).filter(
      (f): f is FileNodeTextFile => f.type === 'text-file'
    );

    // Check if any text files were found
    if (textFiles.length === 0) {
      const totalFiles = fileManager.files.size;
      const message =
        totalFiles > 0
          ? `No .txt files found in the uploaded files. Found ${totalFiles} binary file(s). Please upload files containing mod code.`
          : 'No .txt files found in the uploaded files. Please upload files containing mod code.';
      alert(message);
      // Reset state
      fileManager = null;
      fileTree = null;
      return;
    }

    // fileMap already has O(1) lookups with paths as keys

    // Process in batches to avoid memory exhaustion with large file sets
    const BATCH_SIZE = 10;
    const failures: string[] = [];
    for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
      const batch = textFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async fileNode => {
          const file = fileMap.get(fileNode.path);
          if (file) {
            try {
              fileNode.content = await file.text();
            } catch (error) {
              console.error(`Failed to read file ${fileNode.path}:`, error);
              failures.push(fileNode.path);
              fileNode.content = '-- This file failed to load.';
            }
          }
        })
      );
    }

    // Notify user if any files failed to load
    if (failures.length > 0) {
      alert(`Warning: ${failures.length} file(s) failed to load:\n${failures.join('\n')}`);
    }

    // Show file tree
    fileTreeContainer.style.display = 'flex';
    mainContainer.classList.add('with-file-tree');
    downloadZipBtn.style.display = 'inline-block';

    // Update buttons
    clearBtn.textContent = 'Close All';
    loadSampleBtn.style.display = 'none';

    // Render file tree
    renderFileTree();

    // Create resize handles
    createResizeHandles();

    // Validate all text files on upload (before selecting a file to show aggregated results)
    validateAllFiles();

    // Select first file by depth (doesn't overwrite aggregated results)
    const firstFilePath = findFirstFileByDepth(fileTree);
    if (firstFilePath) {
      selectFile(firstFilePath);
    }
  }

  function renderFileTree(): void {
    if (!fileTree || !fileManager) return;

    // Clear existing content and its event listeners
    fileTreeContent.replaceChildren();
    renderFileNode(fileTree, fileTreeContent, 0);
  }

  function renderFileNode(node: FileNodeDirectory, container: HTMLElement, depth: number): void {
    // Render directory and its children
    for (const child of node.childrenMap.values()) {
      const itemDiv = document.createElement('div');

      if (child.type === 'directory') {
        itemDiv.className = 'file-tree-item directory collapsed';
        itemDiv.dataset['path'] = child.path; // Store full path for accurate matching

        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        iconSpan.textContent = '▸';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = child.name; // No escaping needed with textContent

        itemDiv.appendChild(iconSpan);
        itemDiv.appendChild(nameSpan);

        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'file-tree-children';
        childrenDiv.style.display = 'none';

        itemDiv.addEventListener('click', e => {
          e.stopPropagation();
          const icon = itemDiv.querySelector('.icon');
          if (itemDiv.classList.contains('collapsed')) {
            itemDiv.classList.remove('collapsed');
            if (icon) icon.textContent = '▾';
            childrenDiv.style.display = 'block';
          } else {
            itemDiv.classList.add('collapsed');
            if (icon) icon.textContent = '▸';
            childrenDiv.style.display = 'none';
          }
        });

        container.appendChild(itemDiv);
        container.appendChild(childrenDiv);
        renderFileNode(child, childrenDiv, depth + 1);
      } else {
        // File (text or binary)
        const icon = child.type === 'text-file' ? '📄' : '📎';
        itemDiv.className = 'file-tree-item';
        itemDiv.dataset['path'] = child.path;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        iconSpan.textContent = icon;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = child.name; // No escaping needed with textContent

        itemDiv.appendChild(iconSpan);
        itemDiv.appendChild(nameSpan);

        if (child.type === 'text-file') {
          const filePath = child.path;
          itemDiv.addEventListener('click', () => selectFile(filePath));
        } else {
          itemDiv.style.opacity = '0.6';
          itemDiv.style.cursor = 'default';
        }

        container.appendChild(itemDiv);
      }
    }
  }

  function selectFile(path: string): void {
    if (!fileManager) return;

    // Save current file content if there's a current file
    if (fileManager.currentFilePath) {
      const currentFile = fileManager.files.get(fileManager.currentFilePath);
      if (currentFile?.type === 'text-file') {
        currentFile.content = modInput.value;
      }
    }

    // Load new file
    const fileNode = fileManager.files.get(path);
    if (!fileNode || fileNode.type !== 'text-file') return;

    fileManager.currentFilePath = path;
    modInput.value = fileNode.content;
    updateLineNumbers();

    // Build maps for O(1) lookups instead of O(n) iteration
    const allDirItems = document.querySelectorAll('.file-tree-item.directory');
    const allTreeItems = document.querySelectorAll('.file-tree-item');

    const dirItemMap = new Map<string, Element>();
    allDirItems.forEach(item => {
      const itemPath = item.getAttribute('data-path');
      if (itemPath) dirItemMap.set(itemPath, item);
    });

    const treeItemMap = new Map<string, Element>();
    allTreeItems.forEach(item => {
      const itemPath = item.getAttribute('data-path');
      if (itemPath) treeItemMap.set(itemPath, item);
    });

    // Expand parent directories to show the selected file
    const pathParts = path.split('/');
    for (let i = 1; i < pathParts.length; i++) {
      const partialPath = pathParts.slice(0, i).join('/');
      const dirItem = dirItemMap.get(partialPath);
      if (dirItem) {
        dirItem.classList.remove('collapsed');
        const icon = dirItem.querySelector('.icon');
        if (icon) icon.textContent = '▾';
        const nextSibling = dirItem.nextElementSibling;
        if (nextSibling?.classList.contains('file-tree-children')) {
          assertInstanceOf(nextSibling, HTMLElement, 'File tree children container').style.display = 'block';
        }
      }
    }

    // Update active state in tree
    treeItemMap.forEach((item, itemPath) => {
      if (itemPath === path) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function validateAllFiles(): void {
    if (!fileManager) return;

    const textFiles = Array.from(fileManager.files.values()).filter(
      (f): f is FileNodeTextFile => f.type === 'text-file'
    );

    // Validate all files and cache results
    for (const fileNode of textFiles) {
      if (fileNode.content) {
        fileNode.validationResult = validator.validate(fileNode.content, fileNode.path);
      }
    }

    // Display aggregated results
    displayAggregatedResults(textFiles);
  }

  function displayAggregatedResults(textFiles: FileNodeTextFile[]): void {
    // Clear old data to prevent memory leaks
    correctionsMap.clear();
    messagesMap.clear();

    // Aggregate all messages from all files
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfo = 0;
    const allMessages: ValidationMessage[] = [];

    for (const fileNode of textFiles) {
      if (fileNode.validationResult) {
        const result = fileNode.validationResult;
        totalErrors += result.errors.length;
        totalWarnings += result.warnings.length;
        totalInfo += result.info.length;
        allMessages.push(...result.errors, ...result.warnings, ...result.info);
      }
    }

    // Update status
    const filesWithErrors = textFiles.filter(f => f.validationResult && f.validationResult.errors.length > 0).length;
    if (totalErrors === 0) {
      validationStatus.textContent = `✓ All ${textFiles.length} file(s) valid`;
      validationStatus.className = 'status success';
    } else {
      validationStatus.textContent = `✗ ${totalErrors} Error${totalErrors !== 1 ? 's' : ''} across ${filesWithErrors} file${filesWithErrors !== 1 ? 's' : ''}`;
      validationStatus.className = 'status error';
    }

    // Display messages
    if (allMessages.length === 0) {
      resultsContainer.innerHTML = `
            <div class="message success">
                <div class="message-header">
                    <span class="message-icon">✓</span>
                    <span>No issues found!</span>
                </div>
                <div class="message-text">All ${textFiles.length} file(s) appear to be valid.</div>
            </div>
        `;
      return;
    }

    // Sort messages: errors first, then warnings, then info; within each, sort by file path then line
    allMessages.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      const fileDiff = a.filePath.localeCompare(b.filePath);
      if (fileDiff !== 0) return fileDiff;
      return (a.line || 0) - (b.line || 0);
    });

    const html = allMessages.map(msg => createMessageHTML(msg)).join('');
    resultsContainer.innerHTML = html;

    // Populate file paths using textContent for XSS safety
    populateMessageFilePaths();
  }

  async function handleDownloadZip(): Promise<void> {
    if (!fileManager || !fileTree) return;

    try {
      const zip = new JSZip();
      const failures: string[] = [];

      // Add all files to zip
      for (const [path, fileNode] of fileManager.files) {
        try {
          if (fileNode.type === 'text-file') {
            // Save current file if it's the active one
            if (path === fileManager.currentFilePath) {
              fileNode.content = modInput.value;
            }
            // Add text file content
            zip.file(path, fileNode.content);
          } else if (fileNode.type === 'binary-file') {
            // Add non-text files
            zip.file(path, fileNode.file);
          }
        } catch (error) {
          console.error(`Failed to add file ${path} to ZIP:`, error);
          failures.push(path);
        }
      }

      // Warn about failures but continue
      if (failures.length > 0) {
        const proceed = confirm(
          `Warning: ${failures.length} file(s) could not be added to the ZIP:\n${failures.join('\n')}\n\nContinue with remaining files?`
        );
        if (!proceed) return;
      }

      // Generate zip with compression
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      });

      // Validate blob was created successfully
      if (!blob || blob.size === 0) {
        throw new Error('Generated ZIP file is empty');
      }

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileManager.rootName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate ZIP:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to create ZIP file: ${errorMessage}\n\nThe file set may be too large or corrupted.`);
    }
  }

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
      const filePath = fileManager?.currentFilePath || 'untitled.txt';
      const result = validator.validate(content, filePath);

      // Cache result if in multi-file mode
      if (fileManager?.currentFilePath) {
        const currentFile = fileManager.files.get(fileManager.currentFilePath);
        if (currentFile?.type === 'text-file') {
          currentFile.validationResult = result;
        }
      }

      // In multi-file mode, display aggregated results from all files
      if (fileManager) {
        const textFiles = Array.from(fileManager.files.values()).filter(
          (f): f is FileNodeTextFile => f.type === 'text-file'
        );
        displayAggregatedResults(textFiles);
      } else {
        // Single-file mode: display results for just this file
        displayResults(result);
      }

      // Remove loading state
      validateBtn.classList.remove('loading');
      validateBtn.textContent = 'Validate';
    }, 100);
  }

  function handleClear(): void {
    if (fileManager) {
      // Confirm before closing all files
      const proceed = confirm(
        'This will close all loaded files. Any unsaved changes will be lost. Do you want to proceed?'
      );
      if (!proceed) return;

      // Close all files
      fileManager = null;
      fileTree = null;
      fileTreeContainer.style.display = 'none';
      mainContainer.classList.remove('with-file-tree');
      mainContainer.style.gridTemplateColumns = ''; // Reset grid columns
      downloadZipBtn.style.display = 'none';
      clearBtn.textContent = 'Clear';
      loadSampleBtn.style.display = 'inline-block';

      // Remove resize handles
      resizeHandle1?.remove();
      resizeHandle2?.remove();
      resizeHandle1 = null;
      resizeHandle2 = null;

      modInput.value = '';
      updateLineNumbers();
      resultsContainer.innerHTML =
        '<p class="placeholder">No validation results yet. Paste your mod code and click "Validate".</p>';
      validationStatus.textContent = '';
      validationStatus.className = 'status';
    } else {
      // Single file mode - just clear
      modInput.value = '';
      updateLineNumbers();
      resultsContainer.innerHTML =
        '<p class="placeholder">No validation results yet. Paste your mod code and click "Validate".</p>';
      validationStatus.textContent = '';
      validationStatus.className = 'status';
    }
  }

  function handleLoadSample(): void {
    modInput.value = SAMPLE_MOD;
    updateLineNumbers();
    handleValidate();
  }

  function displayResults(result: ValidationResult): void {
    // Clear old data to prevent memory leaks
    correctionsMap.clear();
    messagesMap.clear();

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

    const html = messages.map(msg => createMessageHTML(msg)).join('');
    resultsContainer.innerHTML = html;

    // Populate file paths using textContent for XSS safety
    populateMessageFilePaths();
  }

  function createMessageHTML(msg: ValidationMessage): string {
    const icon = getIcon(msg.severity);
    const cursorClass = msg.line ? 'clickable' : '';

    // Store message in map and generate ID for XSS-safe retrieval
    const messageId = generateMessageId();
    messagesMap.set(messageId, msg);

    // Create corrections HTML if available
    let correctionsHTML = '';
    if (msg.corrections && msg.corrections.length > 0) {
      const corrIcon = msg.correctionIcon || '💡';

      // If there's a custom suggestion text, make the entire suggestion clickable
      // Otherwise, show "Did you mean:" with each correction's replacementText as links
      if (msg.suggestion && msg.suggestion.trim().length > 0) {
        // Make the suggestion text itself clickable (for fixes like "Add a semicolon")
        const correction = assertDefined(msg.corrections[0], 'First correction should exist');
        const correctionId = generateCorrectionId();
        correctionsMap.set(correctionId, correction);
        const suggestionLink = `<span class="correction-link" data-correction-id="${correctionId}">${escapeHtml(msg.suggestion)}</span>`;
        correctionsHTML = `<div class="message-corrections">${corrIcon} ${suggestionLink}</div>`;
      } else {
        // Show each correction's replacement text as separate links (for typos)
        const correctionLinks = msg.corrections
          .map(correction => {
            const correctionId = generateCorrectionId();
            correctionsMap.set(correctionId, correction);
            return `<span class="correction-link" data-correction-id="${correctionId}">${escapeHtml(correction.replacementText)}</span>`;
          })
          .join(', ');
        correctionsHTML = `<div class="message-corrections">${corrIcon} Did you mean: ${correctionLinks}?</div>`;
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

    // Show file path in multi-file mode
    const showFilePath = fileManager !== null;
    const filePathHTML = showFilePath ? `<span class="message-file-path"></span>:` : '';
    const line = showFilePath ? msg.line : `Line ${msg.line}`;

    return `
        <div class="message ${msg.severity} ${cursorClass}" data-message-id="${messageId}">
            <div class="message-header">
                <span class="message-icon">${icon}</span>
                <span>${msg.message}</span>
            </div>
            ${msg.line ? `<div class="message-line-info">${filePathHTML}<span class="message-line-number">${line}</span></div>` : ''}
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

  /**
   * After creating message HTML, populate file paths using textContent for XSS safety
   */
  function populateMessageFilePaths(): void {
    const messageElements = resultsContainer.querySelectorAll('.message[data-message-id]');
    messageElements.forEach(el => {
      const messageId = el.getAttribute('data-message-id');
      if (messageId) {
        const msg = messagesMap.get(messageId);
        if (msg) {
          const filePathSpan = el.querySelector('.message-file-path');
          if (filePathSpan) {
            filePathSpan.textContent = msg.filePath;
          }
        }
      }
    });
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
      .map(num => `<div>${num}</div>`)
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
        const line = assertDefined(
          lines[i],
          `Line ${i} is undefined when calculating position for startLine ${startLine}`
        );
        absoluteStart += line.length + 1; // +1 for newline
      }
      absoluteStart += startColumn;

      let absoluteEnd = 0;
      for (let i = 0; i < endLine - 1; i++) {
        const line = assertDefined(lines[i], `Line ${i} is undefined when calculating position for endLine ${endLine}`);
        absoluteEnd += line.length + 1;
      }
      absoluteEnd += endColumn;

      modInput.setSelectionRange(absoluteStart, absoluteEnd);
    } else {
      // Fallback: select the entire line
      let charPosition = 0;
      for (let i = 0; i < lineNumber - 1; i++) {
        const line = assertDefined(
          lines[i],
          `Line ${i} is undefined when calculating position for lineNumber ${lineNumber}`
        );
        charPosition += line.length + 1; // +1 for newline
      }
      const lineLength = lines[lineNumber - 1]?.length || 0;
      modInput.setSelectionRange(charPosition, charPosition + lineLength);
    }

    // After setSelectionRange causes auto-scroll, override with centered position
    // Calculate the position of the target line, centering it in the viewport
    const linePosition = (lineNumber - 1) * lineHeight;
    const halfViewportHeight = modInput.clientHeight / 2;
    const halfLineHeight = lineHeight / 2;
    const targetScrollTop = linePosition - halfViewportHeight + halfLineHeight;

    // Set scroll position on the textarea itself (not the wrapper)
    modInput.scrollTop = targetScrollTop;
  }

  /**
   * Replace text in textarea using execCommand to make it undoable with Ctrl+Z
   */
  function replaceTextUndoable(
    textarea: HTMLTextAreaElement,
    start: number,
    end: number,
    replacement: string
  ): boolean {
    // Focus the textarea
    textarea.focus();

    // Select the text to replace
    textarea.setSelectionRange(start, end);

    const current = textarea.value.slice(start, end);
    if (current === replacement) {
      return false;
    }

    // Replace using execCommand to make it undoable
    // Note: execCommand is deprecated but still the only way to get undo/redo support
    document.execCommand('insertText', false, replacement);

    // Select the inserted text to show what was changed
    textarea.setSelectionRange(start, start + replacement.length);

    return true;
  }

  function applyCorrection(correction: Correction): void {
    const { startLine, startColumn, endLine, endColumn, replacementText, filePath } = correction;

    // Switch to correct file if in multi-file mode and different file
    if (fileManager && filePath && filePath !== fileManager.currentFilePath) {
      selectFile(filePath);
    }

    const lines = modInput.value.split('\n');

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
      const line = assertDefined(lines[i], `Line ${i} is undefined when applying correction at startLine ${startLine}`);
      absoluteStart += line.length + 1; // +1 for newline
    }
    absoluteStart += startColumn;

    let absoluteEnd = 0;
    for (let i = 0; i < endLine - 1; i++) {
      const line = assertDefined(lines[i], `Line ${i} is undefined when applying correction at endLine ${endLine}`);
      absoluteEnd += line.length + 1;
    }
    absoluteEnd += endColumn;

    // Replace text (undoably)
    const didReplace = replaceTextUndoable(modInput, absoluteStart, absoluteEnd, replacementText);

    if (didReplace) {
      // Update and re-validate
      updateLineNumbers();
      handleValidate();
    }

    // Scroll to and select the corrected text
    scrollToLine(startLine, {
      startLine: startLine,
      startColumn: startColumn,
      endLine: startLine, // Corrections are always single-line
      endColumn: startColumn + replacementText.length,
    });
  }

  // Handle clicks on messages to jump to line
  resultsContainer.addEventListener('click', e => {
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
      const correctionId = correctionLink.getAttribute('data-correction-id');

      if (correctionId) {
        const correction = correctionsMap.get(correctionId);
        if (correction) {
          applyCorrection(correction);
        }
      }
      return;
    }

    // Otherwise handle message click to jump to line
    const messageElement = target.closest('.message.clickable');
    if (messageElement) {
      const messageId = messageElement.getAttribute('data-message-id');
      if (messageId) {
        const msg = messagesMap.get(messageId);
        if (msg && msg.line) {
          // Switch to correct file if in multi-file mode and different file
          if (fileManager && msg.filePath && msg.filePath !== fileManager.currentFilePath) {
            selectFile(msg.filePath);
          }
          scrollToLine(msg.line);
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

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupValidatorApp);
