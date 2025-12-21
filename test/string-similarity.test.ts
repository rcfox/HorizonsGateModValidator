/**
 * String Similarity Tests
 * Tests for Levenshtein distance calculation and typo suggestions
 */

import { describe, test, expect } from 'vitest';
import { levenshteinDistance, findSimilar, MAX_EDIT_DISTANCE } from '../src/string-similarity.js';

describe('String Similarity', () => {
  describe('Levenshtein Distance', () => {
    test('identical strings have distance 0', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
      expect(levenshteinDistance('test', 'test')).toBe(0);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    test('case differences', () => {
      expect(levenshteinDistance('Hello', 'hello')).toBe(1);
      expect(levenshteinDistance('ACTION', 'action')).toBe('action'.length);
    });

    test('single character insertion', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1);
      expect(levenshteinDistance('test', 'tests')).toBe(1);
    });

    test('single character deletion', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1);
      expect(levenshteinDistance('tests', 'test')).toBe(1);
    });

    test('single character substitution', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
      expect(levenshteinDistance('test', 'best')).toBe(1);
    });

    test('multiple edits', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3); // k→s, e→i, +g
      expect(levenshteinDistance('saturday', 'sunday')).toBe(3); // remove 'atur'+'a', change 't' to 'n'
    });

    test('completely different strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3);
      expect(levenshteinDistance('hello', 'world')).toBe(4);
    });

    test('empty string comparisons', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
    });
  });

  describe('Find Similar', () => {
    test('finds exact matches', () => {
      const candidates = ['apple', 'banana', 'cherry'];
      const results = findSimilar('apple', candidates);

      expect(results).toHaveLength(1);
      expect(results[0]?.value).toBe('apple');
      expect(results[0]?.distance).toBe(0);
    });

    test('finds matches with only case differences', () => {
      const candidates = ['apple', 'banana', 'cherry'];
      const results = findSimilar('APPLE', candidates);

      expect(results).toHaveLength(1);
      expect(results[0]?.value).toBe('apple');
      expect(results[0]?.distance).toBe(0);
    });

    test('finds typos within 1 edit distance', () => {
      const candidates = ['Action', 'Actor', 'Item'];
      const results = findSimilar('Acton', candidates, 1);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.value).toBe('Action'); // Missing 'i'
      expect(results[0]?.distance).toBe(1);
    });

    test('finds typos within 2 edit distance', () => {
      const candidates = ['applyWeaponBuffs', 'casterAnimation', 'targetAnimation'];
      const results = findSimilar('applyWaponBuffs', candidates, 2);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.value).toBe('applyWeaponBuffs'); // Missing 'e'
    });

    test('finds typos within MAX_EDIT_DISTANCE (3)', () => {
      const candidates = ['itemCategory', 'bodyPart', 'magnitude'];
      const results = findSimilar('itamCatagory', candidates);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.value).toBe('itemCategory');
      expect(results[0]?.distance).toBeLessThanOrEqual(MAX_EDIT_DISTANCE);
    });

    test('excludes strings beyond max distance', () => {
      const candidates = ['hello', 'world', 'completely'];
      const results = findSimilar('abc', candidates, 2);

      // 'hello' is distance 4, 'world' is distance 4, 'completely' is far
      expect(results).toHaveLength(0);
    });

    test('returns top 3 suggestions sorted by distance', () => {
      const candidates = ['test', 'tests', 'testing', 'tested', 'best'];
      const results = findSimilar('tst', candidates);

      expect(results.length).toBeLessThanOrEqual(3);
      // Verify sorted by distance
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        if (prev && curr) {
          expect(prev.distance).toBeLessThanOrEqual(curr.distance);
        }
      }
    });

    test('handles empty candidates array', () => {
      const results = findSimilar('test', []);
      expect(results).toHaveLength(0);
    });

    test('handles empty target string', () => {
      const candidates = ['a', 'ab', 'abc'];
      const results = findSimilar('', candidates, 3);

      // Empty string should match short strings within distance
      expect(results.length).toBeGreaterThan(0);
    });

    test('case-insensitive suggestions', () => {
      const candidates = ['ACTION', 'Actor', 'Item'];
      const results = findSimilar('action', candidates);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.value).toBe('ACTION');
      expect(results[0]?.distance).toBe(0);
    });
  });
});
