/**
 * Parser for mod files
 * Converts tokens into structured object representations
 */

import { Token, TokenType, ParsedObject, PropertyInfo, ValidationMessage } from './types.js';
import { ModLexer } from './lexer.js';

export class ModParser {
  private tokens: Token[] = [];
  private current = 0;
  private objects: ParsedObject[] = [];
  private errors: ValidationMessage[] = [];

  constructor(private source: string) {}

  /**
   * Parse the source into objects
   */
  parse(): { objects: ParsedObject[]; errors: ValidationMessage[] } {
    // Tokenize
    const lexer = new ModLexer(this.source);
    this.tokens = lexer.tokenize();

    this.current = 0;
    this.objects = [];
    this.errors = [];

    // Parse objects
    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();

      if (this.isAtEnd()) break;

      // Look for object definition [ObjectType]
      if (this.check(TokenType.LEFT_BRACKET)) {
        const obj = this.parseObject();
        if (obj) {
          this.objects.push(obj);
        }
      } else {
        // Unexpected token outside of object definition
        const token = this.peek();
        this.addError(
          'Unexpected token outside object definition',
          token.line,
          `Found ${token.value}, expected [ObjectType]`
        );
        this.advance(); // Skip the problematic token
      }
    }

    return { objects: this.objects, errors: this.errors };
  }

  private parseObject(): ParsedObject | null {
    const startToken = this.advance(); // consume '['
    const startLine = startToken.line;

    // Get object type name
    if (!this.check(TokenType.IDENTIFIER)) {
      this.addError(
        'Expected object type name after [',
        this.peek().line,
        `Found ${this.peek().value}`
      );
      return null;
    }

    const typeToken = this.advance();
    const objectType = typeToken.value;

    // Expect closing bracket
    if (!this.check(TokenType.RIGHT_BRACKET)) {
      this.addError(
        'Expected ] after object type name',
        this.peek().line,
        `Found ${this.peek().value} in [${objectType}]`
      );
      // Try to recover by finding the next ]
      while (!this.isAtEnd() && !this.check(TokenType.RIGHT_BRACKET)) {
        this.advance();
      }
    }

    if (this.check(TokenType.RIGHT_BRACKET)) {
      this.advance(); // consume ']'
    }

    // Parse properties until next object or EOF
    const properties = this.parseProperties();
    const endLine = this.previous().line;

    return {
      type: objectType,
      properties,
      startLine,
      endLine,
    };
  }

  private parseProperties(): Map<string, PropertyInfo> {
    const properties = new Map<string, PropertyInfo>();

    this.skipWhitespaceAndComments();

    while (!this.isAtEnd() && !this.check(TokenType.LEFT_BRACKET)) {
      this.skipWhitespaceAndComments();

      if (this.isAtEnd() || this.check(TokenType.LEFT_BRACKET)) {
        break;
      }

      // Parse property assignment: key = value;
      const property = this.parseProperty();
      if (property) {
        const { key, info } = property;

        // Handle duplicate keys by appending '+' (like the C# code does)
        let finalKey = key;
        while (properties.has(finalKey)) {
          finalKey += '+';
        }

        properties.set(finalKey, info);
      }

      this.skipWhitespaceAndComments();
    }

    return properties;
  }

  private parseProperty(): { key: string; info: PropertyInfo } | null {
    const propertyLine = this.peek().line;

    // Get property name (identifier)
    if (!this.check(TokenType.IDENTIFIER)) {
      // Skip this line if it's not a valid property
      this.skipToNextLine();
      return null;
    }

    const nameToken = this.advance();
    let propertyName = nameToken.value;

    // Check for equals sign
    if (!this.check(TokenType.EQUALS)) {
      this.addError(
        `Expected = after property name '${propertyName}'`,
        propertyLine,
        `Found ${this.peek().value}`
      );
      this.skipToNextLine();
      return null;
    }

    this.advance(); // consume '='

    // Get value - can be identifier or string value
    let value = '';

    // Collect all tokens until semicolon, handling multi-line values
    const valueParts: string[] = [];
    let foundSemicolon = false;

    while (!this.isAtEnd() && !this.check(TokenType.LEFT_BRACKET)) {
      if (this.check(TokenType.SEMICOLON)) {
        foundSemicolon = true;
        this.advance(); // consume ';'
        break;
      }

      if (this.check(TokenType.COMMENT)) {
        break; // Stop at comments
      }

      // Check if we hit a newline
      if (this.check(TokenType.NEWLINE)) {
        this.advance(); // consume newline

        // Skip any additional whitespace/comments
        while (!this.isAtEnd() && (this.check(TokenType.NEWLINE) || this.check(TokenType.COMMENT))) {
          this.advance();
        }

        // Check if the next line starts a new property (KEY=VALUE) or object
        if (this.isAtEnd() || this.check(TokenType.LEFT_BRACKET)) {
          break;
        }

        // Look ahead to see if this is KEY=VALUE pattern
        if (this.check(TokenType.IDENTIFIER)) {
          const lookahead = this.current + 1;
          if (lookahead < this.tokens.length && this.tokens[lookahead].type === TokenType.EQUALS) {
            // This is a new property, stop here
            break;
          }
          // Otherwise, this is a continuation line - keep collecting
        }

        continue; // Continue to next token
      }

      const token = this.advance();
      if (token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING_VALUE) {
        valueParts.push(token.value);
      } else if (token.type === TokenType.EQUALS) {
        // This might be part of a formula like "is:1:value"
        valueParts.push('=');
      }
    }

    value = valueParts.join('').trim();

    // Check for semicolon
    if (!foundSemicolon && value.length > 0) {
      // Look ahead to see if the next tokens form a KEY=VALUE pattern or [ObjectType]
      // This helps us determine if a semicolon is truly missing
      const shouldHaveSemicolon = this.shouldWarnAboutMissingSemicolon(value);

      if (shouldHaveSemicolon) {
        this.addError(
          `Property '${propertyName} = ${value}' does not end with semicolon`,
          propertyLine,
          'Add ; at the end of the line'
        );
      }
    }

    return {
      key: propertyName,
      info: { value, line: propertyLine }
    };
  }

  private shouldWarnAboutMissingSemicolon(value: string): boolean {
    // Filter out text replacements like <key=value> from the value for checking
    const valueWithoutReplacements = value.replace(/<[^>]*>/g, '');

    // If value contains < after filtering replacements, it might have HTML/tags
    if (valueWithoutReplacements.includes('<')) {
      return false;
    }

    // At this point, we've already consumed all continuation lines in parseProperty()
    // So we just need to check what's next
    // Save current position to restore later
    const savedCurrent = this.current;

    // Skip any newlines and whitespace
    while (!this.isAtEnd() && (this.check(TokenType.NEWLINE) || this.peek().type === TokenType.COMMENT)) {
      this.advance();
    }

    // Look ahead for next meaningful token
    let shouldWarn = false;

    if (this.isAtEnd()) {
      // End of file - probably should have semicolon
      shouldWarn = true;
    } else if (this.check(TokenType.LEFT_BRACKET)) {
      // Next is [ObjectType] - should have had semicolon
      shouldWarn = true;
    } else if (this.check(TokenType.IDENTIFIER)) {
      // Check if this looks like KEY=VALUE pattern
      const lookahead = this.current + 1;
      if (lookahead < this.tokens.length && this.tokens[lookahead].type === TokenType.EQUALS) {
        // Next is KEY=VALUE - should have had semicolon
        shouldWarn = true;
      }
    }

    // Restore position
    this.current = savedCurrent;

    return shouldWarn;
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const type = this.peek().type;
      if (type === TokenType.NEWLINE || type === TokenType.COMMENT) {
        this.advance();
      } else {
        break;
      }
    }
  }

  private skipToNextLine(): void {
    while (!this.isAtEnd() && !this.check(TokenType.NEWLINE)) {
      this.advance();
    }
    if (this.check(TokenType.NEWLINE)) {
      this.advance();
    }
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private addError(message: string, line: number, context?: string): void {
    this.errors.push({
      severity: 'error',
      message,
      line,
      context,
    });
  }

  private addWarning(message: string, line: number, context?: string): void {
    this.errors.push({
      severity: 'warning',
      message,
      line,
      context,
    });
  }
}
