import { describe, it, expect } from 'vitest';
import { parseDynamicText, containsDynamicText } from '../src/dynamic-text-parser.js';
import type { ParsedDynamicTextBareString, ParsedDynamicTextSegment, ParsedDynamicTextTag } from '../src/types.js';

function expectTag(segment: ParsedDynamicTextSegment | undefined): asserts segment is ParsedDynamicTextTag {
  expect(segment?.type).toBe('tag');
}

function expectBareString(
  segment: ParsedDynamicTextSegment | undefined
): asserts segment is ParsedDynamicTextBareString {
  expect(segment?.type).toBe('bareString');
}

describe('containsDynamicText', () => {
  it('returns true for strings with <', () => {
    expect(containsDynamicText('<n=>')).toBe(true);
    expect(containsDynamicText('Hello <color=red=>world')).toBe(true);
  });

  it('returns false for strings without <', () => {
    expect(containsDynamicText('Hello world')).toBe(false);
    expect(containsDynamicText('')).toBe(false);
  });
});

describe('parseDynamicText', () => {
  describe('bare strings', () => {
    it('parses a string with no tags as a single bare string', () => {
      const segments = parseDynamicText('Hello world');
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({
        type: 'bareString',
        value: 'Hello world',
        position: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 11 },
      });
    });

    it('parses an empty string as no segments', () => {
      const segments = parseDynamicText('');
      expect(segments).toHaveLength(0);
    });
  });

  describe('simple tags', () => {
    it('parses a tag with no arguments', () => {
      const segments = parseDynamicText('<n=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
      expect(segments[0].arguments).toHaveLength(1);
      expect(segments[0].arguments[0]?.value).toBe(''); // trailing =
    });

    it('parses a tag with one argument', () => {
      const segments = parseDynamicText('<color=red=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('color');
      expect(segments[0].arguments).toHaveLength(2);
      expect(segments[0].arguments[0]?.value).toBe('red');
      expect(segments[0].arguments[1]?.value).toBe(''); // trailing =
    });

    it('parses a tag with multiple arguments', () => {
      // Note: > cannot appear in tag arguments as it ends the tag
      const segments = parseDynamicText('<textIf=some text=c:HP+5=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('textIf');
      expect(segments[0].arguments).toHaveLength(3);
      expect(segments[0].arguments[0]?.value).toBe('some text');
      expect(segments[0].arguments[1]?.value).toBe('c:HP+5');
      expect(segments[0].arguments[2]?.value).toBe(''); // trailing =
    });

    it('parses a tag without trailing = (no trailing empty arg)', () => {
      const segments = parseDynamicText('<n>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
      expect(segments[0].arguments).toHaveLength(0);
    });
  });

  describe('mixed content', () => {
    it('parses text before a tag', () => {
      const segments = parseDynamicText('Hello <n=>');
      expect(segments).toHaveLength(2);
      expectBareString(segments[0]);
      expectTag(segments[1]);
      expect(segments[0].value).toBe('Hello ');
    });

    it('parses text after a tag', () => {
      const segments = parseDynamicText('<n=>Hello');
      expect(segments).toHaveLength(2);
      expectTag(segments[0]);
      expectBareString(segments[1]);
      expect(segments[1].value).toBe('Hello');
    });

    it('parses multiple tags with text between', () => {
      const segments = parseDynamicText('Start <color=red=>middle<color=> end');
      expect(segments).toHaveLength(5);
      expectBareString(segments[0]);
      expectTag(segments[1]);
      expectBareString(segments[2]);
      expectTag(segments[3]);
      expectBareString(segments[4]);
    });
  });

  describe('position tracking', () => {
    it('tracks tag position correctly', () => {
      const segments = parseDynamicText('<n=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].position.startLine).toBe(0);
      expect(segments[0].position.startColumn).toBe(0);
      expect(segments[0].position.endColumn).toBe(4);
    });

    it('tracks tag name position correctly', () => {
      const segments = parseDynamicText('<color=red=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagNamePosition.startColumn).toBe(1); // after <
      expect(segments[0].tagNamePosition.endColumn).toBe(6); // 'color' is 5 chars
    });

    it('tracks argument positions correctly', () => {
      const segments = parseDynamicText('<textIf=hello=world=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].arguments[0]?.startColumn).toBe(8); // after 'textIf='
      expect(segments[0].arguments[0]?.endColumn).toBe(13); // 'hello' is 5 chars
      expect(segments[0].arguments[1]?.startColumn).toBe(14); // after 'hello='
      expect(segments[0].arguments[1]?.endColumn).toBe(19); // 'world' is 5 chars
    });

    it('tracks position after bare string', () => {
      const segments = parseDynamicText('Hello <n=>');
      expect(segments).toHaveLength(2);
      expectTag(segments[1]);
      expect(segments[1].position.startColumn).toBe(6); // after 'Hello '
    });
  });

  describe('edge cases', () => {
    it('handles unclosed tag as bare string', () => {
      const segments = parseDynamicText('Hello <unclosed');
      expect(segments).toHaveLength(2);
      expectBareString(segments[0]);
      expect(segments[0].value).toBe('Hello ');
      expectBareString(segments[1]);
      expect(segments[1].value).toBe('<unclosed');
    });

    it('handles empty tag name', () => {
      const segments = parseDynamicText('<==>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('');
    });

    it('handles command tag format', () => {
      const segments = parseDynamicText('<cmd=globalAdd=var=5=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('cmd');
      expect(segments[0].arguments[0]?.value).toBe('globalAdd');
      expect(segments[0].arguments[1]?.value).toBe('var');
      expect(segments[0].arguments[2]?.value).toBe('5');
    });

    it('does not support nested angle brackets - first > ends the tag', () => {
      // The game splits on both < and > using regex, so nested brackets are not supported.
      // Our parser finds the first > after <, which has the same effect.
      // The validator reports an error when '<' appears in an argument.
      // Input: <textIf=<n>=c:HP=>
      // Result: tag "textIf" with arg "<n", then bare string "=c:HP=>"
      const segments = parseDynamicText('<textIf=<n>=c:HP=>');
      expect(segments).toHaveLength(2);

      // First segment: tag ending at first >
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('textIf');
      expect(segments[0].arguments).toHaveLength(1);
      expect(segments[0].arguments[0]?.value).toBe('<n'); // The < is included as part of the argument

      // Second segment: bare string with the rest
      expectBareString(segments[1]);
      expect(segments[1].value).toBe('=c:HP=>');
    });
  });

  describe('whitespace around tag name', () => {
    it('trims leading whitespace from tag name', () => {
      const segments = parseDynamicText('< n=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
    });

    it('trims trailing whitespace from tag name', () => {
      const segments = parseDynamicText('<n =>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
    });

    it('trims whitespace from both sides of tag name', () => {
      const segments = parseDynamicText('<  n  =>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
    });

    it('tracks tag name position correctly with leading whitespace', () => {
      const segments = parseDynamicText('< n=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
      // Tag name 'n' starts at column 2 (after '< ')
      expect(segments[0].tagNamePosition.startColumn).toBe(2);
      expect(segments[0].tagNamePosition.endColumn).toBe(3);
    });

    it('tracks tag name position correctly with trailing whitespace', () => {
      const segments = parseDynamicText('<n =>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
      // Tag name 'n' starts at column 1 (after '<')
      expect(segments[0].tagNamePosition.startColumn).toBe(1);
      expect(segments[0].tagNamePosition.endColumn).toBe(2);
    });

    it('tracks tag name position correctly with whitespace on both sides', () => {
      const segments = parseDynamicText('<  n  =>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('n');
      // Tag name 'n' starts at column 3 (after '<  ')
      expect(segments[0].tagNamePosition.startColumn).toBe(3);
      expect(segments[0].tagNamePosition.endColumn).toBe(4);
    });

    it('handles whitespace with longer tag name', () => {
      const segments = parseDynamicText('< color =red=>');
      expect(segments).toHaveLength(1);
      expectTag(segments[0]);
      expect(segments[0].tagName).toBe('color');
      // Tag name 'color' starts at column 2 (after '< ')
      expect(segments[0].tagNamePosition.startColumn).toBe(2);
      expect(segments[0].tagNamePosition.endColumn).toBe(7); // 'color' is 5 chars
    });
  });
});
