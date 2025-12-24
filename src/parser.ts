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

  constructor(
    private source: string,
    private filePath: string
  ) {}

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

    let lastObject: ParsedObject | null = null;
    let sawUnexpectedToken = false;

    // Parse objects
    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();

      if (this.isAtEnd()) break;

      // Look for object definition [ObjectType]
      if (this.check(TokenType.LEFT_BRACKET)) {
        const obj = this.parseObject();
        if (obj) {
          obj.previousObject = lastObject;
          if (lastObject) {
            lastObject.nextObject = obj;
          }
          this.objects.push(obj);
        }
        lastObject = obj;
      } else {
        // Only emit this error once per file.
        if (!sawUnexpectedToken) {
          sawUnexpectedToken = true;
          // Unexpected token outside of object definition
          const token = this.peek();
          this.errors.push({
            severity: 'error',
            message: 'Unexpected token outside object definition',
            filePath: this.filePath,
            line: token.line,
            context: `Found "${token.value}", expected [ObjectType]`,
          });
        }
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
      this.errors.push({
        severity: 'error',
        message: 'Expected object type name after [',
        filePath: this.filePath,
        line: this.peek().line,
        context: `Found ${this.peek().value}`,
      });
      return null;
    }

    const typeToken = this.advance();
    const objectType = typeToken.value;
    const typeStartLine = typeToken.line;
    const typeStartColumn = typeToken.column;
    const typeEndColumn = typeToken.column + typeToken.value.length;
    let typeBracketEndColumn = -1;

    // Expect closing bracket
    if (!this.check(TokenType.RIGHT_BRACKET)) {
      this.errors.push({
        severity: 'error',
        message: 'Expected ] after object type name',
        filePath: this.filePath,
        line: this.peek().line,
        context: `Found ${this.peek().value} in [${objectType}]`,
      });
      // Try to recover by finding the next ]
      while (!this.isAtEnd() && !this.check(TokenType.RIGHT_BRACKET)) {
        this.advance();
      }
    } else {
      const bracketToken = this.peek();
      typeBracketEndColumn = bracketToken.column + 1; // Position after ]
      this.advance(); // consume ']'
    }

    // Parse properties until next object or EOF
    const properties = this.parseProperties();
    const endLine = this.previous()?.line ?? startLine;

    return {
      type: objectType,
      filePath: this.filePath,
      properties,
      startLine,
      endLine,
      typeStartLine,
      typeStartColumn,
      typeEndColumn,
      typeBracketEndColumn,

      previousObject: null, // These will be set up when the function returns.
      nextObject: null,
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
    const nameStartLine = nameToken.line;
    const nameStartColumn = nameToken.column;
    const nameEndColumn = nameToken.column + nameToken.value.length;

    // Check for equals sign
    if (!this.check(TokenType.EQUALS)) {
      this.errors.push({
        severity: 'error',
        message: `Expected = after property name '${propertyName}'`,
        filePath: this.filePath,
        line: propertyLine,
        context: `Found ${this.peek().value}`,
      });
      this.skipToNextLine();
      return null;
    }

    this.advance(); // consume '='

    // Get value - can be identifier or string value
    let value = '';

    // Track value position (first and last tokens)
    let valueStartLine = 0;
    let valueStartColumn = 0;
    let valueEndLine = 0;
    let valueEndColumn = 0;
    let firstValueToken = true;

    // Collect all tokens until semicolon, handling multi-line values
    const valueParts: { text: string; line: number }[] = [];
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
          const nextToken = this.peekNext();
          if (nextToken?.type === TokenType.EQUALS) {
            // This is a new property, stop here
            break;
          }
          // Otherwise, this is a continuation line - keep collecting
        }

        continue; // Continue to next token
      }

      const token = this.advance();
      if (token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING_VALUE) {
        valueParts.push({ text: token.value, line: token.line });

        // Track position of first value token
        if (firstValueToken) {
          valueStartLine = token.line;
          valueStartColumn = token.column;
          firstValueToken = false;
        }

        // Always update end position to the latest token
        valueEndLine = token.line;
        valueEndColumn = token.column + token.value.length;
      } else if (token.type === TokenType.EQUALS) {
        // This might be part of a formula like "is:1:value"
        valueParts.push({ text: '=', line: token.line });

        if (firstValueToken) {
          valueStartLine = token.line;
          valueStartColumn = token.column;
          firstValueToken = false;
        }

        valueEndLine = token.line;
        valueEndColumn = token.column + 1; // '=' is 1 character
      }
    }

    // Join value parts, adding newlines between tokens on different lines
    value = valueParts.reduce((acc, part, idx) => {
      if (idx === 0) return part.text;
      const prevLine = valueParts[idx - 1]!.line;
      const currentLine = part.line;
      const newlines = '\n'.repeat(currentLine - prevLine);
      return acc + newlines + part.text;
    }, '');

    // Check for semicolon
    if (!foundSemicolon && value.length > 0) {
      // Look ahead to see if the next tokens form a KEY=VALUE pattern or [ObjectType]
      // This helps us determine if a semicolon is truly missing
      const shouldHaveSemicolon = this.shouldWarnAboutMissingSemicolon(value);

      if (shouldHaveSemicolon) {
        this.errors.push({
          severity: 'error',
          message: `Property '${propertyName} = ${value}' does not end with semicolon`,
          filePath: this.filePath,
          line: propertyLine,
          context: 'Add ; at the end of the line',
          suggestion: 'Add a semicolon',
          suggestionIsAction: true,
          correctionIcon: '🔧',
          corrections: [
            {
              filePath: this.filePath,
              startLine: propertyLine,
              startColumn: valueEndColumn,
              endLine: propertyLine,
              endColumn: valueEndColumn,
              replacementText: ';',
            },
          ],
        });
      }
    }

    return {
      key: propertyName,
      info: {
        value,
        filePath: this.filePath,
        nameStartLine,
        nameStartColumn,
        nameEndColumn,
        valueStartLine,
        valueStartColumn,
        valueEndLine,
        valueEndColumn,
      },
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
      const nextToken = this.peekNext();
      if (nextToken?.type === TokenType.EQUALS) {
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
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    const token = this.previous();
    if (!token) {
      throw new Error('Advanced to invalid token');
    }
    return token;
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    const token = this.tokens[this.current];
    if (!token) {
      throw new Error('Peeked at invalid token');
    }
    return token;
  }

  private peekNext(): Token | null {
    if (this.current + 1 >= this.tokens.length) {
      return null;
    }
    const token = this.tokens[this.current + 1];
    if (!token) {
      throw new Error('Peeked at invalid token');
    }
    return token;
  }

  private previous(): Token | null {
    if (this.current - 1 < 0) {
      return null;
    }
    const token = this.tokens[this.current - 1];
    if (!token) {
      throw new Error('Peeked at invalid token');
    }
    return token;
  }
}
