#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const INPUT_FILE = '../Tactics/Task.cs';
const OUTPUT_DIR = './ExecuteTaskSplit';

// Read the entire file
const fileContent = fs.readFileSync(INPUT_FILE, 'utf8');
const lines = fileContent.split('\n');

// Find the executeTask function
let functionStart = -1;
let switchStart = -1;
let preambleEnd = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('public bool executeTask(TileCoord topLeftTC, TileCoord btmRightTC)')) {
        functionStart = i;
    }
    if (functionStart !== -1 && lines[i].trim().startsWith('switch (type)')) {
        switchStart = i;
        preambleEnd = i - 1;
        break;
    }
}

if (functionStart === -1 || switchStart === -1) {
    console.error('Could not find executeTask function or switch statement');
    process.exit(1);
}

console.log(`Found function at line ${functionStart + 1}`);
console.log(`Found switch at line ${switchStart + 1}`);

// Extract preamble (lines between function start and switch)
const preambleLines = lines.slice(functionStart + 1, switchStart);

// Parse the switch statement
class CaseInfo {
    constructor(caseNames, startLine) {
        this.caseNames = caseNames; // Array of TaskType names (for fall-through)
        this.startLine = startLine;
        this.endLine = -1;
        this.bodyLines = [];
    }
}

const cases = [];
let currentCase = null;
let braceDepth = 0;
let switchBraceDepth = -1; // The brace depth when we enter the switch
let i = switchStart;

// Find the opening brace of the switch (it's on the next line after switch statement)
while (i < lines.length && !lines[i].includes('{')) {
    i++;
}
// Now i points to the line with {
// We'll start processing from the next line, and the switch body is at depth 1
i++; // Move to first line inside switch
braceDepth = 1; // We're now inside the switch
switchBraceDepth = 1;

// Track nested structures for smart break detection
class StructureTracker {
    constructor() {
        this.stack = []; // Stack of {type: 'for'|'while'|'foreach'|'switch'|'if', depth: number}
    }

    push(type, depth) {
        this.stack.push({type, depth});
    }

    popIfAtDepth(depth) {
        // Pop all structures that were at a deeper depth
        while (this.stack.length > 0 && this.stack[this.stack.length - 1].depth > depth) {
            this.stack.pop();
        }
    }

    isInLoop() {
        return this.stack.some(s => s.type === 'for' || s.type === 'while' || s.type === 'foreach');
    }

    isInNestedSwitch() {
        return this.stack.some(s => s.type === 'switch');
    }
}

const structureTracker = new StructureTracker();
let caseBodyDepth = -1; // The brace depth at the start of a case body

while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track brace depth BEFORE processing the line
    const prevBraceDepth = braceDepth;
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    braceDepth += openBraces - closeBraces;

    // Update structure tracker after changing depth
    if (closeBraces > 0) {
        structureTracker.popIfAtDepth(braceDepth);
    }

    // Check if we've exited the switch statement
    if (braceDepth < switchBraceDepth) {
        // Finalize the last case
        if (currentCase) {
            currentCase.endLine = i - 1;
            cases.push(currentCase);
        }
        break;
    }

    // Detect new structures (for, while, foreach, switch)
    if (trimmed.startsWith('for (') || trimmed.startsWith('for(')) {
        structureTracker.push('for', braceDepth);
    } else if (trimmed.startsWith('while (') || trimmed.startsWith('while(')) {
        structureTracker.push('while', braceDepth);
    } else if (trimmed.startsWith('foreach (') || trimmed.startsWith('foreach(')) {
        structureTracker.push('foreach', braceDepth);
    } else if (trimmed.startsWith('switch (') || trimmed.startsWith('switch(')) {
        structureTracker.push('switch', braceDepth);
    }

    // Check for case statement
    if (trimmed.startsWith('case TaskType.')) {
        // Extract the case name
        const match = trimmed.match(/case TaskType\.(\w+):/);
        if (match) {
            const caseName = match[1];

            // Check if this is a fall-through (next line is also a case)
            if (currentCase === null) {
                // Start a new case
                currentCase = new CaseInfo([caseName], i);
                caseBodyDepth = prevBraceDepth; // Use depth before processing this line
            } else {
                // Check if the previous case had any body lines
                if (currentCase.bodyLines.length === 0) {
                    // This is a fall-through case, add to current
                    currentCase.caseNames.push(caseName);
                    currentCase.startLine = Math.min(currentCase.startLine, i);
                } else {
                    // Previous case had body, so this is a new case
                    // Finalize the previous case
                    currentCase.endLine = i - 1;
                    cases.push(currentCase);

                    // Start a new case
                    currentCase = new CaseInfo([caseName], i);
                    caseBodyDepth = prevBraceDepth; // Use depth before processing this line
                    structureTracker.stack = []; // Reset structure tracker
                }
            }
        }
    } else if (currentCase) {
        // We're inside a case body

        // Check for case terminator: break or return at the case body depth
        const isBreak = trimmed === 'break;' || trimmed.startsWith('break;');
        const isReturn = trimmed.startsWith('return ');

        if ((isBreak || isReturn) && prevBraceDepth === caseBodyDepth) {
            // Check if we're inside a loop or nested switch
            if (!structureTracker.isInLoop() && !structureTracker.isInNestedSwitch()) {
                // This is the case terminator
                currentCase.bodyLines.push(line);
                currentCase.endLine = i;
                cases.push(currentCase);
                currentCase = null;
                caseBodyDepth = -1;
                structureTracker.stack = []; // Reset structure tracker
                i++;
                continue;
            }
        }

        // Add line to current case body
        currentCase.bodyLines.push(line);
    }

    i++;
}

console.log(`Found ${cases.length} cases`);

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate a file for each case
for (const caseInfo of cases) {
    // For each case name (handle fall-through by creating duplicate functions)
    for (const caseName of caseInfo.caseNames) {
        const fileName = `executeTask_${caseName}.cs`;
        const filePath = path.join(OUTPUT_DIR, fileName);

        const fileLines = [];

        // Add header comment
        fileLines.push(`// Generated from Task.cs - executeTask function`);
        fileLines.push(`// Original case: ${caseInfo.caseNames.join(', ')}`);
        fileLines.push(`// Lines ${caseInfo.startLine + 1}-${caseInfo.endLine + 1}`);
        fileLines.push('');

        // Add function signature
        fileLines.push(`public bool executeTask_${caseName}(TileCoord topLeftTC, TileCoord btmRightTC)`);
        fileLines.push('{');

        // Add preamble
        fileLines.push(...preambleLines);

        // Add switch statement with only this case
        fileLines.push('\tswitch (type)');
        fileLines.push('\t{');
        fileLines.push(`\tcase TaskType.${caseName}:`);

        // Add case body (but skip the case line itself from bodyLines)
        let addingBody = false;
        for (const bodyLine of caseInfo.bodyLines) {
            const trimmedBody = bodyLine.trim();
            // Skip case statements (they're already added above)
            if (trimmedBody.startsWith('case TaskType.')) {
                continue;
            }
            addingBody = true;
            fileLines.push(bodyLine);
        }

        // Close switch and function
        fileLines.push('\t}');
        fileLines.push('\treturn true;');
        fileLines.push('}');

        // Write file
        fs.writeFileSync(filePath, fileLines.join('\n'));
        console.log(`Created: ${fileName}`);
    }
}

console.log(`\nDone! Generated ${cases.reduce((sum, c) => sum + c.caseNames.length, 0)} files in ${OUTPUT_DIR}`);

// Create Task_base.cs - the original file without executeTask
console.log('\nCreating Task_base.cs...');

// Find the end of executeTask function by tracking braces from functionStart
let executeFunctionEnd = -1;
let funcBraceDepth = 0;
let funcFoundStart = false;

for (let j = functionStart; j < lines.length; j++) {
    const line = lines[j];
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    funcBraceDepth += openBraces - closeBraces;

    if (openBraces > 0 && !funcFoundStart) {
        funcFoundStart = true;
    }

    if (funcFoundStart && funcBraceDepth === 0) {
        executeFunctionEnd = j;
        break;
    }
}

if (executeFunctionEnd === -1) {
    console.error('Could not find end of executeTask function');
} else {
    console.log(`executeTask function spans lines ${functionStart + 1}-${executeFunctionEnd + 1}`);

    // Create Task_base.cs with all lines except executeTask
    const taskBaseLines = [
        ...lines.slice(0, functionStart),
        ...lines.slice(executeFunctionEnd + 1)
    ];

    const taskBasePath = path.join(OUTPUT_DIR, 'Task_base.cs');
    fs.writeFileSync(taskBasePath, taskBaseLines.join('\n'));
    console.log(`Created Task_base.cs (${taskBaseLines.length} lines, removed ${lines.length - taskBaseLines.length} lines)`);
}
