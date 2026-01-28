import { describe, it, expect } from 'vitest';
import { validateDynamicText } from '../src/dynamic-text-validator.js';
import type { PropertyInfo } from '../src/types.js';

function createPropInfo(value: string): PropertyInfo {
  return {
    value,
    filePath: 'test.txt',
    nameStartLine: 1,
    nameStartColumn: 0,
    nameEndColumn: 4,
    valueStartLine: 1,
    valueStartColumn: 5,
    valueEndLine: 1,
    valueEndColumn: 5 + value.length,
  };
}

describe('validateDynamicText', () => {
  describe('valid tags', () => {
    it('accepts known tags with correct arguments', () => {
      const messages = validateDynamicText('<color=red=>', createPropInfo('<color=red=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('accepts tags with no required arguments', () => {
      const messages = validateDynamicText('<n=>', createPropInfo('<n=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('accepts tag aliases', () => {
      const messages = validateDynamicText('<p=0.5=>', createPropInfo('<p=0.5=>')); // alias for pause
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('returns empty array for strings without tags', () => {
      const messages = validateDynamicText('Hello world', createPropInfo('Hello world'));
      expect(messages).toHaveLength(0);
    });
  });

  describe('unknown tags', () => {
    it('reports error for unknown tag', () => {
      const messages = validateDynamicText('<unknowntag=>', createPropInfo('<unknowntag=>'));
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe('error');
      expect(messages[0]?.message).toContain('Unknown dynamic text tag');
    });

    it('suggests similar tag names', () => {
      const messages = validateDynamicText('<colr=red=>', createPropInfo('<colr=red=>')); // typo for color
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe('error');
      expect(messages[0]?.corrections).toBeDefined();
      expect(messages[0]?.corrections?.some(c => c.replacementText === 'color')).toBe(true);
    });
  });

  describe('missing required arguments', () => {
    it('reports error for missing required argument (no = at all)', () => {
      const messages = validateDynamicText('<title>', createPropInfo('<title>')); // title requires Argument 1
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('missing required');
    });

    it('accepts empty argument as provided (default value)', () => {
      // <title=> provides 1 argument (empty = use default), which satisfies the requirement
      const messages = validateDynamicText('<title=>', createPropInfo('<title=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('reports error for tag missing second required argument', () => {
      // textIf requires 2 args: text and formula. <textIf=text> only provides 1
      const messages = validateDynamicText('<textIf=text>', createPropInfo('<textIf=text>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('missing required');
    });

    it('accepts textIf with both arguments (even if second is empty)', () => {
      // <textIf=text=> provides 2 arguments
      const messages = validateDynamicText('<textIf=text=>', createPropInfo('<textIf=text=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('too many arguments', () => {
    it('warns for too many arguments', () => {
      const messages = validateDynamicText('<n=extra=args=>', createPropInfo('<n=extra=args=>'));
      const warnings = messages.filter(m => m.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]?.message).toContain('too many arguments');
    });

    it('warns for empty tag with arguments', () => {
      const messages = validateDynamicText('<=extra=>', createPropInfo('<=extra=>'));
      const warnings = messages.filter(m => m.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('nested brackets', () => {
    it('reports error for nested angle brackets in argument', () => {
      // <textIf=<n>=c:HP=> parses as tag "textIf" with arg "<n" (first > ends tag)
      const messages = validateDynamicText('<textIf=<n>=c:HP=>', createPropInfo('<textIf=<n>=c:HP=>'));
      const nestedErrors = messages.filter(m => m.message.includes('Nested angle brackets'));
      expect(nestedErrors).toHaveLength(1);
      expect(nestedErrors[0]?.severity).toBe('error');
    });

    it('reports error with context showing the problematic argument', () => {
      const messages = validateDynamicText('<textIf=<n>=c:HP=>', createPropInfo('<textIf=<n>=c:HP=>'));
      const nestedErrors = messages.filter(m => m.message.includes('Nested angle brackets'));
      expect(nestedErrors[0]?.context).toContain('<n');
    });

    it('reports nested bracket error for simpler case', () => {
      // <color=<n>=> - color tag with nested <n> in argument
      const messages = validateDynamicText('<color=<n>=>', createPropInfo('<color=<n>=>'));
      const nestedErrors = messages.filter(m => m.message.includes('Nested angle brackets'));
      expect(nestedErrors).toHaveLength(1);
    });
  });

  describe('trailing equals', () => {
    it('reports info for missing trailing = on tag with no arguments', () => {
      const messages = validateDynamicText('<n>', createPropInfo('<n>'));
      const infos = messages.filter(m => m.severity === 'info');
      expect(infos.length).toBeGreaterThan(0);
      expect(infos[0]?.message).toContain("missing trailing '='");
    });

    it('no info message when trailing = is present', () => {
      const messages = validateDynamicText('<n=>', createPropInfo('<n=>'));
      const trailingInfos = messages.filter(m => m.severity === 'info' && m.message.includes('trailing'));
      expect(trailingInfos).toHaveLength(0);
    });

    it('no info message for tag with arguments but no trailing =', () => {
      // Tags with arguments don't need the trailing = convention
      const messages = validateDynamicText('<color=red>', createPropInfo('<color=red>'));
      const trailingInfos = messages.filter(m => m.severity === 'info' && m.message.includes('trailing'));
      expect(trailingInfos).toHaveLength(0);
    });
  });

  describe('formula validation', () => {
    // NOTE: Formula validation in dynamic text arguments is currently disabled
    // due to false positives. It will be re-enabled when argument type information
    // is available in the schema.
    it.skip('validates formula-like arguments', () => {
      // Using a valid formula
      const messages = validateDynamicText('<math=c:HP+5=>', createPropInfo('<math=c:HP+5=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it.skip('reports error for invalid formula in argument', () => {
      // Invalid formula with unmatched parenthesis
      const messages = validateDynamicText('<math=c:HP+(=>', createPropInfo('<math=c:HP+(=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('command tags', () => {
    it('validates command tag with valid command', () => {
      const messages = validateDynamicText('<cmd=globalAdd=myVar=5=>', createPropInfo('<cmd=globalAdd=myVar=5=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('reports error for unknown command', () => {
      const messages = validateDynamicText('<cmd=unknownCmd=>', createPropInfo('<cmd=unknownCmd=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('Unknown command');
    });

    it('suggests similar command names', () => {
      const messages = validateDynamicText('<cmd=globaAdd=myVar=5=>', createPropInfo('<cmd=globaAdd=myVar=5=>')); // typo
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.corrections?.some(c => c.replacementText === 'globalAdd')).toBe(true);
    });

    it('reports error for missing command name', () => {
      const messages = validateDynamicText('<cmd=>', createPropInfo('<cmd=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('reports error for missing required command arguments', () => {
      const messages = validateDynamicText('<cmd=globalAdd=>', createPropInfo('<cmd=globalAdd=>')); // needs 2 args
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('missing required');
    });

    it('warns for too many command arguments', () => {
      const messages = validateDynamicText('<cmd=globalAdd=var=5=extra=args=>', createPropInfo('<cmd=globalAdd=var=5=extra=args=>'));
      const warnings = messages.filter(m => m.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('accepts command aliases', () => {
      const messages = validateDynamicText('<cmd=gAdd=myVar=5=>', createPropInfo('<cmd=gAdd=myVar=5=>')); // alias for globalAdd
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('multiple tags', () => {
    it('validates all tags in a string', () => {
      const messages = validateDynamicText('<colr=red=><unknwn=>', createPropInfo('<colr=red=><unknwn=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(2); // both unknown
    });

    it('mixed valid and invalid tags', () => {
      const messages = validateDynamicText('<n=><unknwn=><color=red=>', createPropInfo('<n=><unknwn=><color=red=>'));
      const errors = messages.filter(m => m.severity === 'error');
      expect(errors).toHaveLength(1); // only unknwn is invalid
    });
  });

  describe('position tracking', () => {
    it('reports correct line number for errors', () => {
      const propInfo = createPropInfo('<unknowntag=>');
      const messages = validateDynamicText('<unknowntag=>', propInfo);
      expect(messages[0]?.line).toBe(propInfo.valueStartLine);
    });
  });
});
