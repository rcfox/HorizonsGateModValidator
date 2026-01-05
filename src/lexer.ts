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
        // Skip whitespace unless we're in value mode
        if (this.inValueMode) {
          // Check if whitespace is followed by IDENTIFIER= (new property)
          let lookahead = this.current;
          // Skip additional whitespace
          while (lookahead < this.source.length && this.isWhitespace(this.source[lookahead])) {
            lookahead++;
          }
          // Check if we have an identifier starting here
          if (lookahead < this.source.length && this.isAlphaNumeric(this.source[lookahead])) {
            while (lookahead < this.source.length && this.isIdentifierChar(this.source[lookahead])) {
              lookahead++;
            }
            // Check if it's followed by =
            if (lookahead < this.source.length && this.source[lookahead] === '=') {
              // This is a new property! Exit value mode and skip the whitespace
              this.inValueMode = false;
              break; // Don't call scanValue(), just skip the whitespace
            }
          }
          // Not a new property, whitespace is part of the value
          this.scanValue();
        }
        // Otherwise skip whitespace
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
    // If we're in value mode, check if this looks like a new property first
    if (this.inValueMode) {
      // Look ahead to see if this is IDENTIFIER= pattern (new property)
      let lookahead = this.current;

      // Scan the potential identifier
      while (lookahead < this.source.length && this.isIdentifierChar(this.source[lookahead])) {
        lookahead++;
      }

      // Check if it's followed by =
      if (lookahead < this.source.length && this.source[lookahead] === '=') {
        // This is a new property! Exit value mode and scan as identifier
        this.inValueMode = false;
        // Continue below to scan as identifier
      } else {
        // Not a new property, scan as value
        this.scanValue();
        return;
      }
    }

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

    // Scan until semicolon, newline, or a pattern that looks like a new property (IDENTIFIER=)
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ';' || char === '\n') {
        break;
      }

      // Check if we're about to hit a new property (whitespace followed by IDENTIFIER=)
      if (this.isWhitespace(char)) {
        // Look ahead to see if this whitespace is followed by IDENTIFIER=
        let lookahead = this.current + 1;
        // Skip whitespace
        while (lookahead < this.source.length && this.isWhitespace(this.source[lookahead])) {
          lookahead++;
        }
        // Check if we have an identifier starting here
        if (lookahead < this.source.length && this.isAlphaNumeric(this.source[lookahead])) {
          // Scan the identifier
          while (lookahead < this.source.length && this.isIdentifierChar(this.source[lookahead])) {
            lookahead++;
          }
          // Check if it's followed by =
          if (lookahead < this.source.length && this.source[lookahead] === '=') {
            // This is a new property! Stop scanning the value here and exit value mode
            this.inValueMode = false;
            break;
          }
        }
      }

      this.advance();
    }

    const value = this.source.substring(start, this.current);
    if (value.length > 0) {
      this.addToken(TokenType.STRING_VALUE, value);
    }
  }

  private isWhitespace(char: string | undefined): char is string {
    return char === ' ' || char === '\t';
  }

  private isIdentifierChar(char: string | undefined): char is string {
    return this.isAlphaNumeric(char) || char === '_' || char === '+' || char === '!';
  }

  private isAlphaNumeric(char: string | undefined): char is string {
    if (!char) {
      return false;
    }
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
