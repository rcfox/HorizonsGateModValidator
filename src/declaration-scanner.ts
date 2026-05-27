/**
 * Scans mod-file source for `-- #validator declare <name> = <value>` directives.
 *
 * Recognition rules:
 * - The directive must immediately follow the FIRST `--` on a line (allowing whitespace).
 *   If `--` appears earlier in the line as a normal comment, any `#validator declare` later
 *   on that line is comment content and is ignored.
 * - The value extends from after `=` until the next `--` on the line (which starts a
 *   trailing normal comment) or end-of-line.
 * - The variable name follows `\w+` (matching @G parsing in formula-parser.ts).
 *
 * Examples:
 *   -- #validator declare myvar = max:3                            → myvar = "max:3"
 *   -- #validator declare myvar = max:3 -- trailing comment        → myvar = "max:3"
 *   ID=foo; -- #validator declare myvar = max:3                    → myvar = "max:3"
 *   -- prior comment -- #validator declare myvar = max:3           → IGNORED
 *
 * Resulting map is consumed by formula-validator.ts to substitute `@G<name>` before
 * parsing, matching the runtime substitution in Tactics/Formula.cs:70-95.
 *
 * Duplicate declarations: the last declaration of a variable wins (matching how the C#
 * runtime's repeated `Replace` would shake out — only the final binding is observable).
 * Each earlier declaration is reported as a shadowed-declaration warning so the user
 * notices a stale duplicate instead of silently relying on the wrong value.
 */

import { ValidationMessage, ValidationErrorCode } from './types.js';

const directiveAfterDashes = /^\s*#validator\s+declare\s+(\w+)\s*=\s*(.*?)(?:\s*--.*)?$/;

interface Occurrence {
  value: string;
  line: number; // 1-indexed
  startColumn: number; // 0-indexed column of the `--`
}

export interface ScanResult {
  map: ReadonlyMap<string, string>;
  messages: ValidationMessage[];
}

export function scanDeclarations(source: string, filePath: string): ScanResult {
  const occurrences = new Map<string, Occurrence[]>();

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const idx = line.indexOf('--');
    if (idx === -1) continue;
    const m = line.substring(idx + 2).match(directiveAfterDashes);
    if (!m) continue;
    const name = m[1]!;
    const value = m[2]!.trim();
    if (value.length === 0) continue;
    const list = occurrences.get(name) ?? [];
    list.push({ value, line: i + 1, startColumn: idx });
    occurrences.set(name, list);
  }

  const map = new Map<string, string>();
  const messages: ValidationMessage[] = [];

  for (const [name, list] of occurrences) {
    const winner = list[list.length - 1]!;
    map.set(name, winner.value);

    // Warn on every earlier occurrence; point each warning at the active (winning) line.
    for (let j = 0; j < list.length - 1; j++) {
      const shadowed = list[j]!;
      messages.push({
        severity: 'warning',
        message: `Declaration of '${name}' is shadowed by a later declaration on line ${winner.line}; only the last declaration is used.`,
        filePath,
        line: shadowed.line,
        errorCode: ValidationErrorCode.DECLARATION_SHADOWED,
        errorCodeContext: { varName: name, activeLine: winner.line },
      });
    }
  }

  return { map, messages };
}
