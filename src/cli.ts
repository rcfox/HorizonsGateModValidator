#!/usr/bin/env node

/**
 * Command-line interface for mod validator
 */

import { Command } from 'commander';
import { ModValidator } from './validator.js';
import { ValidationMessage, ValidationResult, ValidationSeverity, VALIDATION_SEVERITIES } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

interface CLIOptions {
  recursive?: boolean;
  format?: 'gcc' | 'json';
  errorLevel?: ValidationSeverity;
}

interface FileResult {
  filePath: string;
  result?: ValidationResult;
  error?: string;
}

class ModValidatorCLI {
  private validator = new ModValidator();
  private filesProcessed = 0;
  private filesWithErrors = 0;
  private totalErrors = 0;
  private totalWarnings = 0;
  private totalHints = 0;
  private totalInfo = 0;
  private printedMessages = 0;
  private fileResults: FileResult[] = [];

  /**
   * Process a single file
   */
  private processFile(filePath: string): FileResult {
    this.filesProcessed++;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = this.validator.validate(content, filePath);

      if (result.errors.length > 0) {
        this.filesWithErrors++;
      }

      this.totalErrors += result.errors.length;
      this.totalWarnings += result.warnings.length;
      this.totalHints += result.hints.length;
      this.totalInfo += result.info.length;

      return { filePath, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { filePath, error: errorMessage };
    }
  }

  /**
   * Find files in a directory
   */
  private findFiles(dirPath: string, recursive: boolean): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (recursive) {
            files.push(...this.findFiles(fullPath, recursive));
          }
        } else if (entry.isFile() && entry.name.endsWith('.txt')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.fileResults.push({ filePath: dirPath, error: errorMessage });
    }

    return files;
  }

  /**
   * Collect all files to process from arguments
   */
  private collectFiles(paths: string[], recursive: boolean): string[] {
    const files: string[] = [];

    for (const inputPath of paths) {
      try {
        const stats = fs.statSync(inputPath);

        if (stats.isFile()) {
          // Accept any file if explicitly specified
          files.push(inputPath);
        } else if (stats.isDirectory()) {
          files.push(...this.findFiles(inputPath, recursive));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.fileResults.push({ filePath: inputPath, error: errorMessage });
      }
    }

    return files;
  }

  /**
   * Filter messages based on minimum severity level
   */
  private filterMessages(messages: ValidationMessage[], minLevel: ValidationSeverity): ValidationMessage[] {
    const levelOrder: Record<ValidationSeverity, number> = {
      error: 0,
      warning: 1,
      hint: 2,
      info: 3,
    };

    const minLevelValue = levelOrder[minLevel];
    return messages.filter((msg) => levelOrder[msg.severity] <= minLevelValue);
  }

  /**
   * Format a validation message in GCC style
   */
  private formatGCCMessage(filePath: string, msg: ValidationMessage): string {
    const location = msg.line ? `${filePath}:${msg.line}` : filePath;
    let output = `${location}: ${msg.severity}: ${msg.message}`;

    // if (msg.context) {
    //   output += `\n  ${msg.context}`;
    // }

    if (msg.corrections && msg.corrections.length > 0 && !msg.suggestion) {
      const suggestionPrefix = 'Did you mean';
      const suggestions = msg.corrections.map((c) => `'${c.replacementText}'`).join(', ');
      output += ` (${suggestionPrefix}: ${suggestions}?)`;
    }

    return output;
  }

  /**
   * Output results in GCC format
   */
  private outputGCC(fileResults: FileResult[], minLevel: ValidationSeverity): void {
    for (const fileResult of fileResults) {
      if (fileResult.error) {
        console.error(`${fileResult.filePath}: error: ${fileResult.error}`);
        this.printedMessages++;
        continue;
      }

      if (!fileResult.result) {
        continue;
      }

      const { result } = fileResult;
      const allMessages = [...result.errors, ...result.warnings, ...result.hints, ...result.info];
      const filteredMessages = this.filterMessages(allMessages, minLevel);

      // Output filtered messages
      for (const msg of filteredMessages) {
        console.log(this.formatGCCMessage(fileResult.filePath, msg));
        this.printedMessages++;
      }
    }

    // Print summary
    console.log('');
    console.log(`${this.filesProcessed} file(s) checked, ${this.filesWithErrors} file(s) with errors`);
    console.log(
      `${this.totalErrors} error(s), ${this.totalWarnings} warning(s), ${this.totalHints} hint(s), ${this.totalInfo} info message(s)`
    );
  }

  /**
   * Convert validation message to JSON-friendly format
   */
  private messageToJSON(filePath: string, msg: ValidationMessage) {
    return {
      file: filePath,
      line: msg.line,
      severity: msg.severity,
      message: msg.message,
      context: msg.context,
      suggestion: msg.suggestion,
      corrections: msg.corrections,
    };
  }

  /**
   * Output results in JSON format
   */
  private outputJSON(fileResults: FileResult[], minLevel: ValidationSeverity): void {
    const output = {
      summary: {
        filesProcessed: this.filesProcessed,
        filesWithErrors: this.filesWithErrors,
        totalErrors: this.totalErrors,
        totalWarnings: this.totalWarnings,
        totalHints: this.totalHints,
        totalInfo: this.totalInfo,
      },
      files: fileResults.map((fileResult) => {
        if (fileResult.error) {
          this.printedMessages++;
          return {
            file: fileResult.filePath,
            error: fileResult.error,
          };
        }

        if (!fileResult.result) {
          return {
            file: fileResult.filePath,
            messages: [],
          };
        }

        const { result } = fileResult;
        const allMessages = [...result.errors, ...result.warnings, ...result.hints, ...result.info];
        const filteredMessages = this.filterMessages(allMessages, minLevel);
        this.printedMessages += filteredMessages.length;

        return {
          file: fileResult.filePath,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
          hintCount: result.hints.length,
          infoCount: result.info.length,
          messages: filteredMessages.map((msg) => this.messageToJSON(fileResult.filePath, msg)),
        };
      }),
    };

    console.log(JSON.stringify(output, null, 2));
  }

  /**
   * Run the CLI
   */
  run(argv: string[]): void {
    const program = new Command();

    program
      .name('mod-validator')
      .description('Validate Horizon\'s Gate mod files')
      .version('1.0.0')
      .argument('<paths...>', 'file or directory paths to validate')
      .option('-r, --recursive', 'recursively process directories', false)
      .option('-f, --format <type>', 'output format (gcc or json)', 'gcc')
      .option('-e, --error-level <level>', `minimum severity level to display (${VALIDATION_SEVERITIES.join(', ')})`, 'info')
      .action((paths: string[], options: CLIOptions) => {
        // Validate format option
        if (options.format && !['gcc', 'json'].includes(options.format)) {
          console.error(`Error: Invalid format '${options.format}'. Must be 'gcc' or 'json'.`);
          process.exit(1);
        }

        // Validate error-level option
        if (options.errorLevel && !VALIDATION_SEVERITIES.includes(options.errorLevel as any)) {
          console.error(`Error: Invalid error level '${options.errorLevel}'. Must be one of: ${VALIDATION_SEVERITIES.join(', ')}.`);
          process.exit(1);
        }

        const format = (options.format || 'gcc') as 'gcc' | 'json';
        const recursive = options.recursive || false;
        const errorLevel = (options.errorLevel || 'info') as ValidationSeverity;

        // Collect all files to process
        const files = this.collectFiles(paths, recursive);

        if (files.length === 0 && this.fileResults.length === 0) {
          console.error('No files found to validate');
          process.exit(1);
        }

        // Process each file
        for (const file of files) {
          this.fileResults.push(this.processFile(file));
        }

        // Output results
        if (format === 'json') {
          this.outputJSON(this.fileResults, errorLevel);
        } else {
          this.outputGCC(this.fileResults, errorLevel);
        }

        // Exit with error code if any messages were printed
        process.exit(this.printedMessages > 0 ? 1 : 0);
      });

    program.parse(argv);
  }
}

// Run CLI if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new ModValidatorCLI();
  cli.run(process.argv);
}

export { ModValidatorCLI };
