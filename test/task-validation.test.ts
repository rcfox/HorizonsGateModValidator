import { describe, test, expect } from 'vitest';
import { ModValidator } from '../src/validator.js';
import { expectMessage, expectValid, expectToBeDefined } from './test-utils.js';

describe('Task String Validation', () => {
  const validator = new ModValidator();

  describe('DialogNode.specialEffect validation', () => {
    test('accepts valid task names', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=abil;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('rejects unknown task names with suggestions', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=actoin;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have hint for unknown task (with corrections)
      expectMessage(result, { text: 'Unknown task', severity: 'hint' });

      // Should have corrections (suggestions)
      const hints = result.hints.filter(h => h.message.includes('Unknown task'));
      const hintWithCorrections = hints.find(h => h.corrections && h.corrections.length > 0);
      expectToBeDefined(hintWithCorrections);
      expect(hintWithCorrections.corrections).toContainEqual(expect.objectContaining({ replacementText: 'action' }));
    });

    test('validates task with parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=action,testAction;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('detects missing required parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=action;`;

      const result = validator.validate(modContent, 'test.txt');

      // 'action' requires strings[0] parameter
      expectMessage(result, { text: 'requires at least', severity: 'error' });
    });
  });

  describe('ActorValueAffecter.magnitude validation', () => {
    test('validates as Formula when actorValue != "task"', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=HP;
        magnitude=10+5;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates as task string when actorValue = "task"', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=task;
        magnitude=abil;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors when actorValue = "task" and magnitude is empty', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=task;
        magnitude=;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty magnitude
      expectMessage(result, { text: 'requires non-empty magnitude', severity: 'error' });
    });

    test('hints on invalid task when actorValue = "task"', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=task;
        magnitude=actoin;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have hint for unknown task (actoin is close to action, so it hints with corrections)
      expectMessage(result, { text: 'Unknown task', severity: 'hint' });
    });
  });

  describe('@-prefix parameter validation', () => {
    test('validates @F formula prefix', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Fhp>10;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on empty @F formula', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@F;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty formula
      expectMessage(result, { text: '@F prefix requires', severity: 'error' });
    });

    test('validates @A actor reference', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Aplayer;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates @X/@Y coordinate parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@X10.5,@Y20.5;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on invalid @X coordinate', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Xinvalid;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for invalid coordinate
      expectMessage(result, { text: 'Coordinate value', severity: 'error' });
    });
  });

  describe('Parameter type inference', () => {
    test('infers boolean parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,true,false;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('infers float parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,1.5,3.14;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('infers string parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,stringParam,anotherString;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });
  });

  describe('Issue 5 validation rules', () => {
    test('warns when receiving too many parameters', () => {
      // 'abil' task only expects floats[0] as optional
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=abil,1,2,3,4,5;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should warn about too many parameters
      expectMessage(result, { text: 'expects at most', severity: 'warning' });
    });

    test('hints when delay parameter (@) in middle', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,param1,@1.5,param2;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have info/hint about delay position (delay is in the middle, not first or last)
      expectMessage(result, { text: 'Delay parameter', severity: 'hint' });
    });
  });
});
