#!/usr/bin/env node
/**
 * Formula AST Visualizer
 *
 * Parses a formula and outputs either:
 * - JSON representation of the AST (for test creation)
 * - DOT graph representation (for graphviz visualization)
 *
 * Usage:
 *   node dist/formula-visualizer.js "c:HP*2+5"
 *   node dist/formula-visualizer.js --format json "c:HP*2+5"
 *   node dist/formula-visualizer.js --format dot "c:HP*2+5" | dot -Tpng -o ast.png
 */

import { parseFormula, type ASTNode } from './formula-parser.js';

/**
 * Escapes special characters for DOT label strings
 * DOT requires backslashes and quotes to be escaped in labels
 */
function escapeDotLabel(text: string | number): string {
  return String(text)
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/"/g, '\\"'); // Then escape quotes
}

/**
 * TypeScript exhaustiveness check helper
 * Throws an error for unhandled cases in discriminated unions
 */
function assertExhaustive(value: never): never {
  throw new Error(`Unknown node type: ${JSON.stringify(value)}`);
}

/**
 * Converts an AST to DOT graph format for graphviz
 */
function astToDot(ast: ASTNode): string {
  let nodeCounter = 0;
  const lines: string[] = ['digraph AST {', '  node [shape=box];'];

  function addNode(node: ASTNode): number {
    const id = nodeCounter++;

    switch (node.type) {
      case 'literal': {
        const value = escapeDotLabel(node.value);
        lines.push(`  n${id} [label="literal\\n${value}"];`);
        break;
      }

      case 'variable': {
        const name = escapeDotLabel(node.name);
        lines.push(`  n${id} [label="variable\\n${name}"];`);
        break;
      }

      case 'global': {
        const name = escapeDotLabel(node.name);
        lines.push(`  n${id} [label="global\\n${name}"];`);
        break;
      }

      case 'function': {
        const argsStr = node.args
          .map(arg => {
            if (arg.type === 'string') {
              const value = escapeDotLabel(arg.value);
              return `\\"${value}\\"`;
            } else {
              // functionStyle arg
              const paramsStr = arg.params
                .map(p => (p.type === 'literal' ? escapeDotLabel(p.value) : '...'))
                .join(',');
              const name = escapeDotLabel(arg.name);
              return `${name}(${paramsStr})`;
            }
          })
          .join(', ');
        const funcName = escapeDotLabel(node.name);
        lines.push(`  n${id} [label="function\\n${funcName}: ${argsStr}"];`);
        if (node.body) {
          const bodyId = addNode(node.body);
          lines.push(`  n${id} -> n${bodyId} [label="body"];`);
        }
        break;
      }

      case 'mathFunction': {
        const name = escapeDotLabel(node.name);
        lines.push(`  n${id} [label="mathFunction\\n${name}"];`);
        if (node.argument) {
          const argId = addNode(node.argument);
          lines.push(`  n${id} -> n${argId} [label="arg"];`);
        }
        break;
      }

      case 'binaryOp': {
        const operator = escapeDotLabel(node.operator);
        lines.push(`  n${id} [label="binaryOp\\n${operator}"];`);
        const leftId = addNode(node.left);
        const rightId = addNode(node.right);
        lines.push(`  n${id} -> n${leftId} [label="left"];`);
        lines.push(`  n${id} -> n${rightId} [label="right"];`);
        break;
      }

      case 'unaryOp': {
        const operator = escapeDotLabel(node.operator);
        lines.push(`  n${id} [label="unaryOp\\n${operator}"];`);
        const operandId = addNode(node.operand);
        lines.push(`  n${id} -> n${operandId} [label="operand"];`);
        break;
      }

      default:
        assertExhaustive(node);
    }

    return id;
  }

  addNode(ast);
  lines.push('}');

  return lines.join('\n');
}

/**
 * Converts an AST to formatted JSON
 */
function astToJson(ast: ASTNode): string {
  return JSON.stringify(ast, null, 2);
}

/**
 * Manually parse arguments, treating unknown flags as part of the formula
 */
function parseArgs(argv: string[]): { format: 'json' | 'dot'; formula: string; showHelp: boolean; showVersion: boolean } {
  let format: 'json' | 'dot' = 'json';
  const formulaParts: string[] = [];
  let showHelp = false;
  let showVersion = false;

  // Skip node and script name
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!; // Safe because i < args.length

    if (arg === '-h' || arg === '--help') {
      showHelp = true;
    } else if (arg === '-V' || arg === '--version') {
      showVersion = true;
    } else if (arg === '-f' || arg === '--format') {
      // Next arg is the format value
      i++;
      if (i >= args.length) {
        throw new Error('Option -f/--format requires an argument');
      }
      const formatValue = args[i]!; // Safe because we checked i < args.length
      if (formatValue !== 'json' && formatValue !== 'dot') {
        throw new Error(`Invalid format '${formatValue}'. Must be 'json' or 'dot'.`);
      }
      format = formatValue;
    } else {
      // Everything else is part of the formula
      formulaParts.push(arg);
    }
  }

  return {
    format,
    formula: formulaParts.join(' '),
    showHelp,
    showVersion,
  };
}

/**
 * Main program
 */
function main(): void {
  try {
    const { format, formula, showHelp, showVersion } = parseArgs(process.argv);

    if (showHelp) {
      console.log('Usage: formula-visualizer [options] <formula>');
      console.log();
      console.log('Parse formulas and visualize AST structure');
      console.log();
      console.log('Arguments:');
      console.log('  formula              Formula to parse (anything not recognized as an option)');
      console.log();
      console.log('Options:');
      console.log('  -f, --format <type>  Output format: json or dot (default: "json")');
      console.log('  -V, --version        Output the version number');
      console.log('  -h, --help           Display help for command');
      console.log();
      console.log('Examples:');
      console.log('  formula-visualizer "c:HP+5"');
      console.log('  formula-visualizer -1+2          (formulas starting with - work!)');
      console.log('  formula-visualizer -f dot "c:HP*2" | dot -Tpng -o ast.png');
      process.exit(0);
    }

    if (showVersion) {
      console.log('1.0.0');
      process.exit(0);
    }

    if (!formula) {
      console.error('Error: No formula provided.');
      console.error();
      console.error('Usage: formula-visualizer [options] <formula>');
      console.error();
      console.error('Run with --help for more information.');
      process.exit(1);
    }

    // Parse the formula
    const ast = parseFormula(formula);

    // Generate output based on format
    const output = format === 'json' ? astToJson(ast) : astToDot(ast);

    // Write to stdout
    console.log(output);
    process.exit(0);
  } catch (error) {
    // Parse errors or other exceptions
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${String(error)}`);
    }
    process.exit(1);
  }
}

main();
