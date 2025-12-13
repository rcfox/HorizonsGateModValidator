/**
 * Lexer for mod files
 * Tokenizes mod file content for parsing
 */

import { Token, TokenType } from './types.js';

export class ModLexer {
  private source: string;
  private tokens: Token[] = [];
  private current = 0;
  private line = 1;
  private column = 1;
  private inValueMode = false; // Track if we're scanning a property value

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.current = 0;
    this.line = 1;
    this.column = 1;
    this.inValueMode = false;

    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.addToken(TokenType.EOF, '');
    return this.tokens;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    const char = this.source[this.current];
    if (!char) {
      throw new Error('Advanced to invalid char');
    }
    this.current++;
    this.column++;
    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) {
      return '\0';
    }
    const char = this.source[this.current];
    if (!char) {
      throw new Error('Peeked at invalid char');
    }
    return char;
  }

  private scanToken(): void {
    const char = this.advance();

    switch (char) {
      case '[':
        this.addToken(TokenType.LEFT_BRACKET, char);
        this.inValueMode = false; // New object declaration ends any value mode
        break;
      case ']':
        this.addToken(TokenType.RIGHT_BRACKET, char);
        break;
      case '=':
        this.addToken(TokenType.EQUALS, char);
        this.inValueMode = true; // Start scanning property value
        break;
      case ';':
        this.addToken(TokenType.SEMICOLON, char);
        this.inValueMode = false; // End of property value
        break;
      case '\n':
        this.addToken(TokenType.NEWLINE, char);
        this.line++;
        this.column = 1;
        break;
      case '\r':
        // Handle Windows line endings
        if (this.peek() === '\n') {
          this.advance();
        }
        this.addToken(TokenType.NEWLINE, '\n');
        this.line++;
        this.column = 1;
        break;
      case ' ':
      case '\t':
        // Skip whitespace
        break;
      case '-':
        // Check for comment (--), but only when NOT inside a property value
        if (this.peek() === '-' && !this.inValueMode) {
          this.scanComment();
        } else {
          // Part of a value (negative number, formula operator, or text containing --)
          this.scanValue();
        }
        break;
      default:
        // Scan identifier or value
        if (this.isAlphaNumeric(char) || char === '!' || char === '_') {
          this.scanIdentifierOrValue();
        } else {
          // Could be part of a complex value (formula, etc.)
          this.scanValue();
        }
        break;
    }
  }

  private scanComment(): void {
    const start = this.current - 1;
    // Consume the rest of the line
    while (this.peek() !== '\n' && !this.isAtEnd()) {
      this.advance();
    }
    const value = this.source.substring(start, this.current);
    this.addToken(TokenType.COMMENT, value);
  }

  private scanIdentifierOrValue(): void {
    const start = this.current - 1;

    // Continue until we hit a delimiter
    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      this.advance();
    }

    const value = this.source.substring(start, this.current);
    this.addToken(TokenType.IDENTIFIER, value);
  }

  private scanValue(): void {
    const start = this.current - 1;

    // Scan until semicolon or newline (values can contain spaces in formulas)
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ';' || char === '\n') {
        break;
      }
      this.advance();
    }

    const value = this.source.substring(start, this.current).trim();
    if (value.length > 0) {
      this.addToken(TokenType.STRING_VALUE, value);
    }
  }

  private isIdentifierChar(char: string): boolean {
    return this.isAlphaNumeric(char) || char === '_' || char === '+' || char === '!';
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9]/.test(char);
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column - value.length - 1, // -1 to convert from 1-indexed to 0-indexed
    });
  }
}
