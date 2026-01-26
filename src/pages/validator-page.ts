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
  convertTaskParamToFriendlyName,
} from './shared-utils.js';
import type {
  ValidationResult,
  ValidationMessage,
  Correction,
  ObjectDisplayInfo,
  ObjectGroup,
  ParsedObject,
} from '../types.js';
import { SEVERITY_ORDER } from '../types.js';
import JSZip from 'jszip';

// Global ModValidator from bundle
declare global {
  interface Window {
    ModValidator: {
      ModValidator: new () => {
        validate: (content: string, filePath: string) => ValidationResult;
        getKnownObjectTypes: () => string[];
        getCrossFileValidationMessages: () => ValidationMessage[];
        clearCache: () => void;
        removeFromCache: (filePath: string) => void;
        getParsedObjectsCache: () => Map<string, ParsedObject[]>;
        resolveFunctionalAlias: (typeName: string) => string;
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

  // View mode for multi-file validation results
  type ResultsViewMode = 'all' | 'current';
  let resultsViewMode: ResultsViewMode = 'all';

  // Correction data storage (for XSS safety - avoid putting user data in HTML attributes)
  const correctionsMap = new Map<string, Correction>();
  let correctionIdCounter = 0;
  const generateCorrectionId = (): string => `correction-${correctionIdCounter++}`;

  // Message data storage (for XSS safety - avoid putting file paths in HTML attributes)
  const messagesMap = new Map<string, ValidationMessage>();
  let messageIdCounter = 0;
  const generateMessageId = (): string => `message-${messageIdCounter++}`;

  // Tab state for results panel
  let currentTab: 'messages' | 'objects' = 'messages';
  let objectsRendered = false; // Lazy rendering flag

  // Object viewer data storage (for XSS safety)
  const objectsDataMap = new Map<string, ObjectDisplayInfo>();
  let objectGroups: ObjectGroup[] = []; // Cache of all groups
  const visibleItemsPerGroup = new Map<string, number>(); // Track visible count per group
  let objectSearchTerm = ''; // Current search term
  const ITEMS_PER_PAGE = 100; // Show 100 items at a time

  // DOM elements
  const modInput = getElementByIdAs('modInput', HTMLTextAreaElement);
  const validateBtn = getElementByIdAs('validateBtn', HTMLButtonElement);
  const clearBtn = getElementByIdAs('clearBtn', HTMLButtonElement);
  const loadSampleBtn = getElementByIdAs('loadSampleBtn', HTMLButtonElement);
  const resultsContainer = getElementByIdAs('results', HTMLDivElement);
  const validationStatus = getElementByIdAs('validationStatus', HTMLDivElement);
  const lineNumbers = getElementByIdAs('lineNumbers', HTMLDivElement);

  // Create status buttons for multi-file mode (replace single status when in multi-file mode)
  const statusButtonsContainer = document.createElement('div');
  statusButtonsContainer.className = 'status-buttons-container';
  statusButtonsContainer.style.display = 'none'; // Hidden until multi-file mode

  const allFilesStatus = document.createElement('div');
  allFilesStatus.className = 'status status-button active';
  allFilesStatus.title = 'Show validation messages from all files';

  const currentFileStatus = document.createElement('div');
  currentFileStatus.className = 'status status-button';
  currentFileStatus.title = 'Show validation messages from current file only';

  // Add buttons to container
  statusButtonsContainer.appendChild(allFilesStatus);
  statusButtonsContainer.appendChild(currentFileStatus);

  // Insert container next to the original status
  const resultsHeader = validationStatus.parentElement;
  if (resultsHeader) {
    validationStatus.after(statusButtonsContainer);
  }

  // New elements for file tree
  const fileTreeContainer = getElementByIdAs('fileTree', HTMLDivElement);
  const fileTreeContent = getElementByIdAs('fileTreeContent', HTMLDivElement);
  const uploadFilesBtn = getElementByIdAs('uploadFilesBtn', HTMLButtonElement);
  const uploadDirBtn = getElementByIdAs('uploadDirBtn', HTMLButtonElement);
  const fileInput = getElementByIdAs('fileInput', HTMLInputElement);
  const dirInput = getElementByIdAs('dirInput', HTMLInputElement);
  const downloadZipBtn = getElementByIdAs('downloadZipBtn', HTMLButtonElement);
  const mainContainer = getElementByIdAs('main', HTMLElement);

  // Hide validate button (auto-validation handles this)
  validateBtn.style.display = 'none';

  // Event listeners
  clearBtn.addEventListener('click', handleClear);
  loadSampleBtn.addEventListener('click', handleLoadSample);
  uploadFilesBtn.addEventListener('click', () => fileInput.click());
  uploadDirBtn.addEventListener('click', () => dirInput.click());
  fileInput.addEventListener('change', handleFileInputChange);
  dirInput.addEventListener('change', handleFileInputChange);
  downloadZipBtn.addEventListener('click', handleDownloadZip);
  allFilesStatus.addEventListener('click', () => switchViewMode('all'));
  currentFileStatus.addEventListener('click', () => switchViewMode('current'));

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

  // Inject tab structure
  injectTabStructure();

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

    // Clear validator cache when loading new files
    clearValidatorCache();

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
      clearValidatorCache();
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

    // Show status buttons in multi-file mode, hide single status
    validationStatus.style.display = 'none';
    statusButtonsContainer.style.display = 'flex';

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

  /**
   * Get the severity class for a file based on its validation results
   * (including cross-file messages like duplicate IDs)
   */
  function getFileSeverityClass(fileNode: FileNodeTextFile): string {
    if (!fileNode.validationResult) {
      return 'file-unvalidated';
    }

    const { errors, warnings, hints, info } = fileNode.validationResult;

    // ValidationResult already includes cross-file messages
    if (errors.length > 0) return 'file-error';
    if (warnings.length > 0) return 'file-warning';
    if (hints.length > 0) return 'file-hint';
    if (info.length > 0) return 'file-info';
    return 'file-valid';
  }

  /**
   * Update file tree severity classes after validation
   */
  function updateFileTreeSeverityClasses(): void {
    if (!fileManager) return;

    for (const [path, fileNode] of fileManager.files) {
      if (fileNode.type === 'text-file') {
        const fileElement = fileTreeContent.querySelector(`[data-path="${CSS.escape(path)}"]`);
        if (fileElement) {
          // Remove all severity classes
          fileElement.classList.remove('file-error', 'file-warning', 'file-info', 'file-valid', 'file-unvalidated');
          // Add current severity class
          fileElement.classList.add(getFileSeverityClass(fileNode));
        }
      }
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
          // Add initial severity class
          itemDiv.classList.add(getFileSeverityClass(child));
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

    // Scroll the file tree to center the selected file
    const selectedItem = treeItemMap.get(path);
    if (selectedItem) {
      const itemRect = selectedItem.getBoundingClientRect();
      const containerRect = fileTreeContent.getBoundingClientRect();

      // Calculate the position to scroll to center the item
      const itemCenter = itemRect.top + itemRect.height / 2;
      const containerCenter = containerRect.top + containerRect.height / 2;
      const scrollOffset = itemCenter - containerCenter;

      // Smooth scroll the file tree content
      fileTreeContent.scrollBy({
        top: scrollOffset,
        behavior: 'smooth',
      });
    }

    // Update status buttons when switching files
    updateStatusButtons();

    // If in "current file" view mode, refresh to show the newly selected file's messages
    if (resultsViewMode === 'current') {
      refreshResultsDisplay();
    }
  }

  /**
   * Remove cross-file messages from a ValidationResult (returns new object)
   */
  function removeCrossFileMessages(result: ValidationResult): ValidationResult {
    return {
      errors: result.errors.filter(m => !m.isCrossFile),
      warnings: result.warnings.filter(m => !m.isCrossFile),
      hints: result.hints.filter(m => !m.isCrossFile),
      info: result.info.filter(m => !m.isCrossFile),
    };
  }

  /**
   * Merge cross-file messages into a file's ValidationResult (returns new object)
   */
  function mergeCrossFileMessages(
    result: ValidationResult,
    filePath: string,
    allCrossFileMessages: ValidationMessage[]
  ): ValidationResult {
    // Filter cross-file messages relevant to this file
    const relevantMessages = allCrossFileMessages.filter(
      msg => msg.filePath === filePath || msg.corrections?.some(c => c.filePath === filePath)
    );

    // Separate by severity
    const crossFileErrors = relevantMessages.filter(m => m.severity === 'error');
    const crossFileWarnings = relevantMessages.filter(m => m.severity === 'warning');
    const crossFileHints = relevantMessages.filter(m => m.severity === 'hint');
    const crossFileInfo = relevantMessages.filter(m => m.severity === 'info');

    return {
      errors: [...result.errors, ...crossFileErrors],
      warnings: [...result.warnings, ...crossFileWarnings],
      hints: [...result.hints, ...crossFileHints],
      info: [...result.info, ...crossFileInfo],
    };
  }

  function validateAllFiles(): void {
    if (!fileManager) return;

    const textFiles = Array.from(fileManager.files.values()).filter(
      (f): f is FileNodeTextFile => f.type === 'text-file'
    );

    // Validate all files (per-file validation only)
    for (const fileNode of textFiles) {
      if (fileNode.content) {
        fileNode.validationResult = validator.validate(fileNode.content, fileNode.path);
      }
    }

    // Get cross-file validation messages (e.g., duplicate IDs across files)
    const crossFileMessages = validator.getCrossFileValidationMessages();

    // Merge cross-file messages into each file's ValidationResult
    for (const fileNode of textFiles) {
      if (fileNode.validationResult) {
        fileNode.validationResult = mergeCrossFileMessages(fileNode.validationResult, fileNode.path, crossFileMessages);
      }
    }

    // Display aggregated results
    displayAggregatedResults(textFiles);

    // Update file tree colors based on validation results
    updateFileTreeSeverityClasses();

    // Refresh object viewer
    refreshObjectViewer();
  }

  function displayAggregatedResults(textFiles: FileNodeTextFile[]): void {
    // Clear old data to prevent memory leaks
    correctionsMap.clear();
    messagesMap.clear();

    // Aggregate all messages from all files (ValidationResult already includes cross-file messages)
    const allMessages: ValidationMessage[] = [];

    for (const fileNode of textFiles) {
      if (fileNode.validationResult) {
        const result = fileNode.validationResult;
        allMessages.push(...result.errors, ...result.warnings, ...result.hints, ...result.info);
      }
    }

    // Deduplicate cross-file messages (they appear once per affected file)
    const seenCrossFileMessages = new Set<string>();
    const deduplicatedMessages = allMessages.filter(msg => {
      if (!msg.isCrossFile) {
        return true; // Keep all non-cross-file messages
      }

      // Use JSON.stringify for a unique key
      const key = JSON.stringify(msg);

      if (seenCrossFileMessages.has(key)) {
        return false; // Duplicate, filter it out
      }

      seenCrossFileMessages.add(key);
      return true; // First occurrence, keep it
    });

    // Display messages
    if (deduplicatedMessages.length === 0) {
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

    // Helper to extract duplicate ID info from message
    const getDuplicateIdInfo = (msg: ValidationMessage): { id: string; type: string } | null => {
      // Match pattern: ID 'foo' for ItemType
      const match = msg.message.match(/^ID '([^']+)' for (\w+)/);
      if (match && match[1] && match[2]) {
        return { id: match[1], type: match[2] };
      }
      return null;
    };

    // Pre-scan to find duplicate ID groups and their highest severity
    const duplicateIdGroups = new Map<string, ValidationMessage[]>();
    const groupHighestSeverity = new Map<string, number>();

    for (const msg of deduplicatedMessages) {
      const dupInfo = getDuplicateIdInfo(msg);
      if (dupInfo) {
        const key = `${dupInfo.type}:${dupInfo.id}`;
        if (!duplicateIdGroups.has(key)) {
          duplicateIdGroups.set(key, []);
          groupHighestSeverity.set(key, SEVERITY_ORDER[msg.severity]);
        } else {
          // Update highest severity for this group
          const currentHighest = groupHighestSeverity.get(key)!;
          const msgSeverity = SEVERITY_ORDER[msg.severity];
          if (msgSeverity < currentHighest) {
            groupHighestSeverity.set(key, msgSeverity);
          }
        }
        duplicateIdGroups.get(key)!.push(msg);
      }
    }

    // Find which groups have multiple messages (need grouping)
    const groupsNeedingGrouping = new Set<string>();
    for (const [key, messages] of duplicateIdGroups) {
      if (messages.length > 1) {
        groupsNeedingGrouping.add(key);
      }
    }

    /**
     * Compare two messages for duplicate ID grouping
     * Returns a comparison result or null if not applicable
     */
    const compareDuplicateIdGroups = (a: ValidationMessage, b: ValidationMessage): number | null => {
      const aDupInfo = getDuplicateIdInfo(a);
      const bDupInfo = getDuplicateIdInfo(b);

      const aKey = aDupInfo ? `${aDupInfo.type}:${aDupInfo.id}` : null;
      const bKey = bDupInfo ? `${bDupInfo.type}:${bDupInfo.id}` : null;

      const aInGroup = aKey && groupsNeedingGrouping.has(aKey);
      const bInGroup = bKey && groupsNeedingGrouping.has(bKey);

      // Neither are in groups - not applicable
      if (!aInGroup && !bInGroup) {
        return null;
      }

      // Both are in duplicate ID groups
      if (aInGroup && bInGroup && aDupInfo && bDupInfo) {
        // Same group - sort by severity within group
        if (aKey === bKey) {
          return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        }
        // Different groups - sort by group's highest severity
        const aGroupSeverity = groupHighestSeverity.get(aKey!)!;
        const bGroupSeverity = groupHighestSeverity.get(bKey!)!;
        if (aGroupSeverity !== bGroupSeverity) {
          return aGroupSeverity - bGroupSeverity;
        }
        // Same group severity - sort by type then ID
        const typeDiff = aDupInfo.type.localeCompare(bDupInfo.type);
        if (typeDiff !== 0) return typeDiff;
        return aDupInfo.id.localeCompare(bDupInfo.id);
      }

      // One is in a group, one isn't - compare group's highest severity with message severity
      if (aInGroup && !bInGroup) {
        const aGroupSeverity = groupHighestSeverity.get(aKey!)!;
        const severityDiff = aGroupSeverity - SEVERITY_ORDER[b.severity];
        if (severityDiff !== 0) return severityDiff;
        // Same severity - group comes before non-group
        return -1;
      }
      if (!aInGroup && bInGroup) {
        const bGroupSeverity = groupHighestSeverity.get(bKey!)!;
        const severityDiff = SEVERITY_ORDER[a.severity] - bGroupSeverity;
        if (severityDiff !== 0) return severityDiff;
        // Same severity - group comes before non-group
        return 1;
      }

      return null;
    };

    // Sort messages with special handling for duplicate ID message groups
    deduplicatedMessages.sort((a, b) => {
      // Try duplicate ID group sorting first
      const groupCompare = compareDuplicateIdGroups(a, b);
      if (groupCompare !== null) {
        return groupCompare;
      }

      // Fall back to normal sorting
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      const fileDiff = a.filePath.localeCompare(b.filePath);
      if (fileDiff !== 0) return fileDiff;
      return (a.line || 0) - (b.line || 0);
    });

    const html = deduplicatedMessages.map(msg => createMessageHTML(msg)).join('');
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

  /**
   * Update status buttons based on validation results
   */
  function updateStatusButtons(): void {
    if (!fileManager) return;

    const textFiles = Array.from(fileManager.files.values()).filter(
      (f): f is FileNodeTextFile => f.type === 'text-file'
    );

    // Aggregate totals for all files (ValidationResult already includes cross-file messages)
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalHints = 0;
    let totalInfo = 0;

    for (const fileNode of textFiles) {
      if (fileNode.validationResult) {
        totalErrors += fileNode.validationResult.errors.length;
        totalWarnings += fileNode.validationResult.warnings.length;
        totalHints += fileNode.validationResult.hints.length;
        totalInfo += fileNode.validationResult.info.length;
      }
    }

    // Count files with issues (ValidationResult already includes cross-file messages)
    const filesWithErrors = textFiles.filter(f => (f.validationResult?.errors.length || 0) > 0).length;
    const filesWithWarnings = textFiles.filter(f => (f.validationResult?.warnings.length || 0) > 0).length;
    const filesWithHints = textFiles.filter(f => (f.validationResult?.hints.length || 0) > 0).length;

    const s = (count: number): string => {
      return count !== 1 ? 's' : '';
    };

    // Update "all files" status button
    allFilesStatus.classList.remove('success', 'error', 'warning');
    if (totalErrors > 0) {
      allFilesStatus.textContent = `✗ ${totalErrors} Error${s(totalErrors)} across ${filesWithErrors} file${s(filesWithErrors)}`;
      allFilesStatus.classList.add('error');
    } else if (totalWarnings > 0) {
      allFilesStatus.textContent = `⚠ ${totalWarnings} Warning${s(totalWarnings)} across ${filesWithWarnings} file${s(filesWithWarnings)}`;
      allFilesStatus.classList.add('warning');
    } else if (totalHints > 0) {
      allFilesStatus.textContent = `💡 ${totalHints} Hint${s(totalHints)} across ${filesWithHints} file${s(filesWithHints)}`;
      allFilesStatus.classList.add('success');
    } else if (totalInfo > 0) {
      allFilesStatus.textContent = `ℹ ${totalInfo} Info message${s(totalInfo)} across ${textFiles.length} file${s(textFiles.length)}`;
      allFilesStatus.classList.add('success');
    } else {
      allFilesStatus.textContent = `✓ All ${textFiles.length} file${s(textFiles.length)} valid`;
      allFilesStatus.classList.add('success');
    }

    // Update "current file" status button
    if (fileManager.currentFilePath) {
      const currentFile = fileManager.files.get(fileManager.currentFilePath);
      if (currentFile?.type === 'text-file' && currentFile.validationResult) {
        // ValidationResult already includes cross-file messages
        const currentErrors = currentFile.validationResult.errors.length;
        const currentWarnings = currentFile.validationResult.warnings.length;
        const currentHints = currentFile.validationResult.hints.length;
        const currentInfo = currentFile.validationResult.info.length;

        currentFileStatus.classList.remove('success', 'error', 'warning');
        if (currentErrors > 0) {
          currentFileStatus.textContent = `✗ ${currentErrors} Error${s(currentErrors)} in this file`;
          currentFileStatus.classList.add('error');
        } else if (currentWarnings > 0) {
          currentFileStatus.textContent = `⚠ ${currentWarnings} Warning${s(currentWarnings)} in this file`;
          currentFileStatus.classList.add('warning');
        } else if (currentHints > 0) {
          currentFileStatus.textContent = `💡 ${currentHints} Hint${s(currentHints)} in this file`;
          currentFileStatus.classList.add('success');
        } else if (currentInfo > 0) {
          currentFileStatus.textContent = `ℹ ${currentInfo} Info message${s(currentInfo)} in this file`;
          currentFileStatus.classList.add('success');
        } else {
          currentFileStatus.textContent = `✓ This file valid`;
          currentFileStatus.classList.add('success');
        }
      }
    }
  }

  /**
   * Refresh the results display based on current view mode
   */
  function refreshResultsDisplay(): void {
    if (!fileManager) return;

    const textFiles = Array.from(fileManager.files.values()).filter(
      (f): f is FileNodeTextFile => f.type === 'text-file'
    );

    // Always update status buttons
    updateStatusButtons();

    if (resultsViewMode === 'all') {
      // Show all files
      displayAggregatedResults(textFiles);
    } else {
      // Show current file only
      if (fileManager.currentFilePath) {
        const currentFile = fileManager.files.get(fileManager.currentFilePath);
        if (currentFile?.type === 'text-file' && currentFile.validationResult) {
          displayResults(currentFile.validationResult);
        }
      }
    }
  }

  /**
   * Switch between showing all files and current file only
   */
  function switchViewMode(mode: ResultsViewMode): void {
    if (!fileManager) return;

    // Update mode
    resultsViewMode = mode;

    // Update active state
    if (mode === 'all') {
      allFilesStatus.classList.add('active');
      currentFileStatus.classList.remove('active');
    } else {
      allFilesStatus.classList.remove('active');
      currentFileStatus.classList.add('active');
    }

    // Refresh display
    refreshResultsDisplay();
  }

  function handleValidate(): void {
    const content = modInput.value;

    // Run validation (even if empty - this clears the cache properly)
    setTimeout(() => {
      const filePath = fileManager?.currentFilePath || 'untitled.txt';
      const result = validator.validate(content, filePath);

      if (fileManager) {
        // Multi-file mode: update cached result and re-run cross-file validation
        const currentFile = fileManager.files.get(fileManager.currentFilePath!);
        if (currentFile?.type === 'text-file') {
          currentFile.validationResult = result;
        }

        // Remove old cross-file messages from all files
        const textFiles = Array.from(fileManager.files.values()).filter(
          (f): f is FileNodeTextFile => f.type === 'text-file'
        );
        for (const fileNode of textFiles) {
          if (fileNode.validationResult) {
            fileNode.validationResult = removeCrossFileMessages(fileNode.validationResult);
          }
        }

        // Get new cross-file validation messages
        const crossFileMessages = validator.getCrossFileValidationMessages();

        // Merge new cross-file messages into all files
        for (const fileNode of textFiles) {
          if (fileNode.validationResult) {
            fileNode.validationResult = mergeCrossFileMessages(
              fileNode.validationResult,
              fileNode.path,
              crossFileMessages
            );
          }
        }

        // Refresh display and file tree
        refreshResultsDisplay();
        updateFileTreeSeverityClasses();

        // Refresh object viewer
        refreshObjectViewer();
      } else {
        // Single-file mode: get cross-file messages and merge
        if (!content.trim()) {
          // Show placeholder for empty content
          resultsContainer.innerHTML = '<p class="placeholder">No content to validate.</p>';
          validationStatus.textContent = '';
          validationStatus.className = 'status';
        } else {
          // Show validation results
          const crossFileMessages = validator.getCrossFileValidationMessages();
          const resultWithCrossFile = mergeCrossFileMessages(result, filePath, crossFileMessages);
          displayResults(resultWithCrossFile);
        }

        // Refresh object viewer (even if empty - clears the viewer)
        refreshObjectViewer();
      }
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

      // Hide status buttons and show original status, reset view mode
      validationStatus.style.display = '';
      statusButtonsContainer.style.display = 'none';
      resultsViewMode = 'all';
      allFilesStatus.classList.add('active');
      currentFileStatus.classList.remove('active');

      // Reset tab state
      currentTab = 'messages';
      objectSearchTerm = '';

      // Clear validator cache and refresh object viewer
      clearValidatorCache();

      // Switch to messages tab in UI
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === 'messages');
      });
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === 'messages');
      });

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
      clearValidatorCache();

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

  /**
   * Inject tab structure into the results section
   */
  function injectTabStructure(): void {
    // Only inject once
    if (resultsContainer.parentElement?.querySelector('.results-tabs')) {
      return;
    }

    // Create tab buttons
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'results-tabs';

    const messagesTab = document.createElement('button');
    messagesTab.className = 'tab-button active';
    messagesTab.dataset['tab'] = 'messages';
    messagesTab.textContent = 'Messages';

    const objectsTab = document.createElement('button');
    objectsTab.className = 'tab-button';
    objectsTab.dataset['tab'] = 'objects';
    objectsTab.textContent = 'Objects';

    tabsContainer.appendChild(messagesTab);
    tabsContainer.appendChild(objectsTab);

    // Create tab content wrapper
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';

    // Wrap existing results container (keep original, don't clone)
    const messagesPanel = document.createElement('div');
    messagesPanel.className = 'tab-panel active';
    messagesPanel.dataset['panel'] = 'messages';
    messagesPanel.id = 'messages-panel';

    // Create objects panel
    const objectsPanel = document.createElement('div');
    objectsPanel.className = 'tab-panel';
    objectsPanel.dataset['panel'] = 'objects';
    objectsPanel.innerHTML = '<p class="placeholder">No objects found.</p>';

    // Get parent before moving resultsContainer
    const parent = resultsContainer.parentElement;
    if (parent) {
      // Insert tabs
      parent.insertBefore(tabsContainer, resultsContainer);

      // Move resultsContainer into messages panel
      messagesPanel.appendChild(resultsContainer);

      // Add panels to tab content
      tabContent.appendChild(messagesPanel);
      tabContent.appendChild(objectsPanel);

      // Insert tab content after tabs
      parent.insertBefore(tabContent, tabsContainer.nextSibling);
    }

    // Set up tab click handlers
    messagesTab.addEventListener('click', () => switchTab('messages'));
    objectsTab.addEventListener('click', () => switchTab('objects'));
  }

  /**
   * Switch between Messages and Objects tabs
   */
  function switchTab(tabId: 'messages' | 'objects'): void {
    currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.getAttribute('data-panel') === tabId);
    });

    // Lazy render objects tab on first view
    if (tabId === 'objects' && !objectsRendered) {
      renderObjectsTab();
      objectsRendered = true;
    }
  }

  /**
   * Group parsed objects by their normalized type
   */
  function groupObjectsByType(parsedObjectsCache: Map<string, ParsedObject[]>): ObjectGroup[] {
    const groups = new Map<string, ObjectDisplayInfo[]>();

    for (const [filePath, objects] of parsedObjectsCache) {
      for (const obj of objects) {
        const id = obj.properties.get('ID')?.value || null;
        const normalizedType = validator.resolveFunctionalAlias(obj.type);
        const uniqueKey = `${filePath}:${obj.typeStartLine}:${obj.typeStartColumn}`;

        const displayInfo: ObjectDisplayInfo = {
          type: obj.type,
          normalizedType,
          id,
          filePath,
          position: {
            typeStartLine: obj.typeStartLine,
            typeStartColumn: obj.typeStartColumn,
            typeEndColumn: obj.typeEndColumn,
          },
          uniqueKey,
        };

        if (!groups.has(normalizedType)) {
          groups.set(normalizedType, []);
        }
        groups.get(normalizedType)!.push(displayInfo);
      }
    }

    // Sort groups by type name
    const sortedGroups: ObjectGroup[] = [];
    const sortedTypes = Array.from(groups.keys()).sort();

    for (const typeName of sortedTypes) {
      const objects = groups.get(typeName)!;

      // Sort objects within group
      objects.sort((a, b) => {
        // Objects with IDs first
        if (a.id && !b.id) return -1;
        if (!a.id && b.id) return 1;

        // Then by ID alphabetically
        if (a.id && b.id) return a.id.localeCompare(b.id);

        // Then by file path and line number
        const fileDiff = a.filePath.localeCompare(b.filePath);
        if (fileDiff !== 0) return fileDiff;

        return a.position.typeStartLine - b.position.typeStartLine;
      });

      sortedGroups.push({
        typeName,
        count: objects.length,
        objects,
      });
    }

    return sortedGroups;
  }

  /**
   * Filter objects based on search term
   */
  function matchesSearch(obj: ObjectDisplayInfo, parsedObj: ParsedObject, searchTerm: string): boolean {
    if (!searchTerm) return true;

    const lowerSearch = searchTerm.toLowerCase();

    // Match against type
    if (obj.type.toLowerCase().includes(lowerSearch)) return true;
    if (obj.normalizedType.toLowerCase().includes(lowerSearch)) return true;

    // Match against ID
    if (obj.id?.toLowerCase().includes(lowerSearch)) return true;

    // Match against any property name or value
    for (const [propName, propInfo] of parsedObj.properties) {
      if (propName.toLowerCase().includes(lowerSearch)) return true;
      if (propInfo.value.toLowerCase().includes(lowerSearch)) return true;
    }

    return false;
  }

  /**
   * Render items for a specific group (lazy rendering)
   */
  function renderGroupItems(group: ObjectGroup, itemsContainer: HTMLElement, parsedObjects: ParsedObject[]): void {
    // Build lookup map for accessing full parsed objects (needed for display)
    const parsedObjMap = new Map<string, ParsedObject>();
    for (const obj of parsedObjects) {
      const key = `${obj.filePath}:${obj.typeStartLine}`;
      parsedObjMap.set(key, obj);
    }

    // Filter by search term (skip if no search)
    let filteredObjects: ObjectDisplayInfo[];

    if (objectSearchTerm) {
      filteredObjects = group.objects.filter(obj => {
        const key = `${obj.filePath}:${obj.position.typeStartLine}`;
        const parsedObj = parsedObjMap.get(key);
        return parsedObj ? matchesSearch(obj, parsedObj, objectSearchTerm) : false;
      });

      if (filteredObjects.length === 0) {
        itemsContainer.innerHTML = '<p class="placeholder" style="padding: 8px;">No matching objects</p>';
        return;
      }
    } else {
      // No search - use all objects directly
      filteredObjects = group.objects;
    }

    // Get visible count (default to ITEMS_PER_PAGE if not set)
    const visibleCount = visibleItemsPerGroup.get(group.typeName) || ITEMS_PER_PAGE;
    const visibleObjects = filteredObjects.slice(0, visibleCount);
    const hasMore = filteredObjects.length > visibleCount;

    // Render items
    const objectsHtml = visibleObjects
      .map(obj => {
        objectsDataMap.set(obj.uniqueKey, obj);

        return `
          <div class="object-item clickable" data-object-key="${escapeHtml(obj.uniqueKey)}">
            <span class="object-id"></span>
            <span class="object-location"></span>
          </div>
        `;
      })
      .join('');

    let showMoreHtml = '';
    if (hasMore) {
      const remaining = filteredObjects.length - visibleCount;
      const nextBatch = Math.min(remaining, ITEMS_PER_PAGE);
      showMoreHtml = `<button class="show-more-btn" data-group="${escapeHtml(group.typeName)}">Show ${nextBatch} more...</button>`;
    }

    itemsContainer.innerHTML = objectsHtml + showMoreHtml;

    // Populate text content for XSS safety
    const objectItems = itemsContainer.querySelectorAll('.object-item[data-object-key]');
    objectItems.forEach(item => {
      const objectKey = item.getAttribute('data-object-key');
      if (objectKey) {
        const obj = objectsDataMap.get(objectKey);
        if (obj) {
          const idSpan = item.querySelector('.object-id');
          const locationSpan = item.querySelector('.object-location');

          if (idSpan) {
            if (obj.id) {
              idSpan.textContent = obj.id;
            } else {
              // Show first 3 properties for objects without ID
              const key = `${obj.filePath}:${obj.position.typeStartLine}`;
              const parsedObj = parsedObjMap.get(key);
              if (parsedObj && parsedObj.properties.size > 0) {
                const propEntries = Array.from(parsedObj.properties.entries()).slice(0, 3);
                const propStrings = propEntries.map(([name, info]) => `${name}=${info.value}`);
                idSpan.textContent = propStrings.join('; ');
              } else {
                idSpan.textContent = '(no properties)';
              }
            }
          }
          if (locationSpan) {
            locationSpan.textContent = `${obj.filePath}:${obj.position.typeStartLine}`;
          }
        }
      }
    });
  }

  /**
   * Refresh the object viewer (called whenever validation cache changes)
   */
  function refreshObjectViewer(): void {
    // Reset state
    objectsRendered = false;
    objectsDataMap.clear();
    objectGroups = [];
    visibleItemsPerGroup.clear();

    // If on Objects tab, re-render
    if (currentTab === 'objects') {
      renderObjectsTab();
    }
  }

  /**
   * Clear the validator cache and refresh the object viewer.
   * INVARIANT: This function must be called whenever validator.clearCache() is called
   * to keep the object viewer UI synchronized with the validator's internal state.
   */
  function clearValidatorCache(): void {
    validator.clearCache();
    refreshObjectViewer();
  }

  /**
   * Show "No objects found" placeholder
   */
  function showNoObjectsPlaceholder(): void {
    const objectsPanel = document.querySelector('[data-panel="objects"]');
    if (!objectsPanel) return;

    objectsPanel.innerHTML = '<p class="placeholder">No objects found.</p>';
  }

  /**
   * Filter and count object groups based on search term
   */
  function filterObjectGroups(allParsedObjects: ParsedObject[]): Array<{ group: ObjectGroup; matchCount: number }> {
    if (objectSearchTerm) {
      // Build lookup map for performance
      const parsedObjMap = new Map<string, ParsedObject>();
      for (const obj of allParsedObjects) {
        const key = `${obj.filePath}:${obj.typeStartLine}`;
        parsedObjMap.set(key, obj);
      }

      return objectGroups
        .map(group => {
          const matchingObjects = group.objects.filter(obj => {
            const key = `${obj.filePath}:${obj.position.typeStartLine}`;
            const parsedObj = parsedObjMap.get(key);
            return parsedObj ? matchesSearch(obj, parsedObj, objectSearchTerm) : false;
          });

          return { group, matchCount: matchingObjects.length };
        })
        .filter(g => g.matchCount > 0);
    } else {
      // No search - show all groups
      return objectGroups.map(group => ({ group, matchCount: group.count }));
    }
  }

  /**
   * Create and set up the groups container with lazy rendering
   */
  function createGroupsContainer(
    groupsWithMatches: Array<{ group: ObjectGroup; matchCount: number }>,
    allParsedObjects: ParsedObject[]
  ): HTMLElement {
    const groupsContainer = document.createElement('div');
    groupsContainer.className = 'object-groups-container';

    const groupsHtml = groupsWithMatches
      .map(({ group, matchCount }) => {
        const countDisplay = objectSearchTerm ? `(${matchCount} / ${group.count})` : `(${group.count})`;

        return `
          <details class="object-group" data-group-name="${escapeHtml(group.typeName)}">
            <summary class="object-group-header">${escapeHtml(group.typeName)} ${countDisplay}</summary>
            <div class="object-group-items" data-group="${escapeHtml(group.typeName)}">
              <p class="placeholder" style="padding: 8px;">Loading...</p>
            </div>
          </details>
        `;
      })
      .join('');

    groupsContainer.innerHTML = groupsHtml;

    // Set up lazy rendering for groups
    groupsContainer.querySelectorAll('.object-group').forEach(details => {
      let rendered = false;
      details.addEventListener('toggle', () => {
        const detailsElement = assertInstanceOf(details, HTMLDetailsElement, 'Details element');
        if (detailsElement.open && !rendered) {
          const groupName = details.getAttribute('data-group-name');
          const group = objectGroups.find(g => g.typeName === groupName);
          const itemsContainer = querySelectorAs('.object-group-items', HTMLElement, details);

          if (group && itemsContainer) {
            renderGroupItems(group, itemsContainer, allParsedObjects);
            rendered = true;
          }
        }
      });
    });

    // Handle "Show more" clicks
    groupsContainer.addEventListener('click', e => {
      const target = assertInstanceOf(e.target, HTMLElement, 'Click target');
      if (target.classList.contains('show-more-btn')) {
        const groupName = target.getAttribute('data-group');
        const group = objectGroups.find(g => g.typeName === groupName);
        const itemsContainer = target.closest('.object-group-items');
        if (group && itemsContainer && groupName) {
          const currentCount = visibleItemsPerGroup.get(groupName) || ITEMS_PER_PAGE;
          visibleItemsPerGroup.set(groupName, currentCount + ITEMS_PER_PAGE);
          renderGroupItems(group, assertInstanceOf(itemsContainer, HTMLElement, 'Items container'), allParsedObjects);
        }
      }
    });

    return groupsContainer;
  }

  /**
   * Update just the object groups (called when search term changes)
   */
  function updateObjectsGroups(): void {
    const objectsPanel = document.querySelector('[data-panel="objects"]');
    if (!objectsPanel) return;

    // Remove old groups container
    objectsPanel.querySelector('.object-groups-container')?.remove();

    // Get all parsed objects
    const parsedObjectsCache = validator.getParsedObjectsCache();
    const allParsedObjects = Array.from(parsedObjectsCache.values()).flat();

    // Filter and create groups
    const groupsWithMatches = filterObjectGroups(allParsedObjects);
    const groupsContainer = createGroupsContainer(groupsWithMatches, allParsedObjects);
    objectsPanel.appendChild(groupsContainer);
  }

  /**
   * Render the objects tab
   */
  function renderObjectsTab(): void {
    const objectsPanel = document.querySelector('[data-panel="objects"]');
    if (!objectsPanel) return;

    // Clear old data and panel
    objectsDataMap.clear();
    objectsPanel.innerHTML = '';

    // Group objects from cache
    const parsedObjectsCache = validator.getParsedObjectsCache();
    objectGroups = groupObjectsByType(parsedObjectsCache);

    if (objectGroups.length === 0) {
      showNoObjectsPlaceholder();
      return;
    }

    // Create search controls
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'object-viewer-controls';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'objectSearch';
    searchInput.className = 'object-search';
    searchInput.placeholder = 'Search objects...';
    searchInput.value = objectSearchTerm;

    controlsContainer.appendChild(searchInput);
    objectsPanel.appendChild(controlsContainer);

    // Set up search handler
    let searchTimeout: number | undefined;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        objectSearchTerm = searchInput.value;
        visibleItemsPerGroup.clear();
        updateObjectsGroups();
      }, 300);
    });

    // Render groups
    updateObjectsGroups();
  }

  /**
   * Navigate to an object's definition
   */
  function navigateToObject(displayInfo: ObjectDisplayInfo): void {
    // Switch file if needed (multi-file mode only)
    if (fileManager && displayInfo.filePath !== fileManager.currentFilePath) {
      selectFile(displayInfo.filePath);
    }

    // Scroll to object type line and select it
    scrollToLine(displayInfo.position.typeStartLine, {
      startLine: displayInfo.position.typeStartLine,
      startColumn: displayInfo.position.typeStartColumn,
      endLine: displayInfo.position.typeStartLine,
      endColumn: displayInfo.position.typeEndColumn,
    });
  }

  function displayResults(result: ValidationResult): void {
    // Clear old data to prevent memory leaks
    correctionsMap.clear();
    messagesMap.clear();

    // Update status (cross-file messages already included in result)
    const hasMessages =
      result.errors.length > 0 || result.warnings.length > 0 || result.hints.length > 0 || result.info.length > 0;

    if (!hasMessages) {
      validationStatus.textContent = '✓ Valid';
      validationStatus.className = 'status success';
    } else if (result.errors.length > 0) {
      validationStatus.textContent = `✗ ${result.errors.length} Error${result.errors.length !== 1 ? 's' : ''}`;
      validationStatus.className = 'status error';
    } else if (result.warnings.length > 0) {
      validationStatus.textContent = `⚠ ${result.warnings.length} Warning${result.warnings.length !== 1 ? 's' : ''}`;
      validationStatus.className = 'status warning';
    } else if (result.hints.length > 0) {
      validationStatus.textContent = `💡 ${result.hints.length} Hint${result.hints.length !== 1 ? 's' : ''}`;
      validationStatus.className = 'status success';
    } else {
      validationStatus.textContent = `ℹ ${result.info.length} Info message${result.info.length !== 1 ? 's' : ''}`;
      validationStatus.className = 'status success';
    }

    // Display all messages (cross-file messages already included)
    const messages = [...result.errors, ...result.warnings, ...result.hints, ...result.info];

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

      if (msg.suggestion && msg.suggestion.trim().length > 0) {
        if (msg.suggestionIsAction) {
          // Single correction with suggestion: make the suggestion text itself clickable
          const correction = assertDefined(msg.corrections[0], 'First correction should exist');
          const correctionId = generateCorrectionId();
          correctionsMap.set(correctionId, correction);
          const suggestionLink = `<span class="correction-link" data-correction-id="${correctionId}">${escapeHtml(msg.suggestion)}</span>`;
          correctionsHTML = `<div class="message-corrections">${corrIcon} ${suggestionLink}</div>`;
        } else {
          // Multiple corrections with suggestion: show suggestion text followed by inline links
          const correctionLinks = msg.corrections
            .map(correction => {
              const correctionId = generateCorrectionId();
              correctionsMap.set(correctionId, correction);
              const displayText = correction.displayText || correction.replacementText;
              return `<span class="correction-link" data-correction-id="${correctionId}">${escapeHtml(displayText)}</span>`;
            })
            .join(', ');
          correctionsHTML = `<div class="message-corrections">${corrIcon} ${escapeHtml(msg.suggestion)} ${correctionLinks}</div>`;
        }
      } else {
        // No suggestion text: show "Did you mean:" with inline links
        const correctionLinks = msg.corrections
          .map(correction => {
            const correctionId = generateCorrectionId();
            correctionsMap.set(correctionId, correction);
            const displayText = correction.displayText || correction.replacementText;
            return `<span class="correction-link" data-correction-id="${correctionId}">${escapeHtml(displayText)}</span>`;
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

    let taskReferenceHTML = '';
    if (msg.taskReference) {
      taskReferenceHTML = `<div class="message-corrections">📖 See task reference: <span class="correction-link task-reference-link" data-task="${escapeHtml(msg.taskReference)}">${escapeHtml(msg.taskReference)}</span></div>`;
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

    // Convert task parameter names to friendly names for task-related messages
    const displayMessage = msg.taskReference ? convertTaskParamToFriendlyName(msg.message) : msg.message;
    const displayContext = msg.taskReference && msg.context ? convertTaskParamToFriendlyName(msg.context) : msg.context;

    return `
        <div class="message ${msg.severity} ${cursorClass}" data-message-id="${messageId}">
            <div class="message-header">
                <span class="message-icon">${icon}</span>
                <span>${displayMessage}</span>
            </div>
            ${msg.line ? `<div class="message-line-info">${filePathHTML}<span class="message-line-number">${line}</span></div>` : ''}
            ${displayContext ? `<div class="message-context">${escapeHtml(displayContext)}</div>` : ''}
            ${correctionsHTML}
            ${formulaReferenceHTML}
            ${taskReferenceHTML}
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
      case 'hint':
        return '💡';
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

  // Handle clicks on objects and messages
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;

    // Check if clicked on an object item
    const objectItem = target.closest('.object-item.clickable');
    if (objectItem) {
      e.stopPropagation();
      const uniqueKey = objectItem.getAttribute('data-object-key');
      if (uniqueKey) {
        const displayInfo = objectsDataMap.get(uniqueKey);
        if (displayInfo) {
          navigateToObject(displayInfo);
        }
      }
      return;
    }

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

    // Check if clicked on a task reference link
    const taskReferenceLink = target.closest('.task-reference-link');
    if (taskReferenceLink) {
      e.stopPropagation();
      const task = taskReferenceLink.getAttribute('data-task');
      if (task) {
        window.open(`tasks.html?task=${task}`, '_blank');
      }
      return;
    }

    // Check if clicked on a correction link
    const correctionLink = target.closest('.correction-link:not(.formula-reference-link):not(.task-reference-link)');
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
