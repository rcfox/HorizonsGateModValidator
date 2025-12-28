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

      // 'action' requires parameters - should show all possible use cases
      expectMessage(result, { text: "parameters don't match any use case", severity: 'error' });
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

    test('errors on invalid @F formula syntax', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Finvalid++syntax;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for invalid formula syntax
      expectMessage(result, { text: 'Formula parse error', severity: 'error' });
    });

    test('validates @A actor reference', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setupPartyFromGVars,@Aplayer;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates @X/@Y coordinate parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElement,fire,@X10.5,@Y20.5;`;

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

    test('errors on invalid @Y coordinate', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Ynotanumber;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for invalid coordinate
      expectMessage(result, { text: 'Coordinate value', severity: 'error' });
    });

    test('validates @R formula prefix (redundant with @F)', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Rhp>10;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on invalid @R formula syntax', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Rinvalid++;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for invalid formula syntax
      expectMessage(result, { text: 'Formula parse error', severity: 'error' });
    });

    test('validates @S force string prefix', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setupPartyFromGVars,@S123;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on empty @S string', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@S;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty string
      expectMessage(result, { text: '@S prefix requires non-empty value', severity: 'error' });
    });

    test('errors on empty @A actor reference', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@A;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty actor reference
      expectMessage(result, { text: '@A prefix requires non-empty value', severity: 'error' });
    });

    test('validates @T travel point prefix', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElement,fire,@TtravelPoint1;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on empty @T travel point', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElement,fire,@T;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty travel point
      expectMessage(result, { text: '@T prefix requires non-empty value', severity: 'error' });
    });

    test('validates @XYA actor reference for tileCoord', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElement,fire,@XYAactorName;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on empty @XYA actor reference', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElement,fire,@XYA;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty actor reference
      expectMessage(result, { text: '@XYA prefix requires non-empty value', severity: 'error' });
    });

    test('validates @G global variable substitution', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setupPartyFromGVars,prefix@GvarName;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on empty @G variable name', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@G;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty variable name
      expectMessage(result, { text: '@G prefix requires non-empty variable name', severity: 'error' });
    });

    test('errors on invalid delay value', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@notanumber;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for invalid delay value
      expectMessage(result, { text: 'Delay value must be a valid number', severity: 'error' });
    });
  });

  describe('Parameter type inference', () => {
    test('infers boolean parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElementToZone,fire,true;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('infers float parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=abil,1.5;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('infers string parameters', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setupPartyFromGVars,stringParam,anotherString;`;

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

    test('warns when providing unexpected parameter type (0 expected)', () => {
      // 'setNPCDialogWindowSizeY' expects only floats[0], no strings
      // Providing a string when 0 strings are expected should warn
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setNPCDialogWindowSizeY,teststring;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should warn about unexpected string parameter
      expectMessage(result, { text: 'expects at most 0 strings parameter(s), but got 1', severity: 'warning' });
    });

    test('hints when delay parameter (@) in middle', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,param1,@1.5,param2;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have info/hint about delay position (delay is in the middle, not first or last)
      expectMessage(result, { text: 'Delay parameter', severity: 'hint' });
    });
  });

  describe('Implicit float 0 in DialogNode/DialogOption.specialEffect', () => {
    test('accepts task without float when implicit float satisfies requirement', () => {
      // 'delayActions' requires floats[0], but DialogNode.specialEffect provides implicit 0
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=delayActions;`;

      const result = validator.validate(modContent, 'test.txt');
      expect(result.errors).toHaveLength(0);
      expectMessage(result, { text: "Task's float parameter is implicitly filled with 0", severity: 'info' });
    });

    test('works with DialogOption as well', () => {
      // Test that DialogOption also gets implicit float 0
      const modContent = `[DialogOption] ID=testOption;
        specialEffect=delayActions;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should pass validation (no errors) and provide info message
      expect(result.errors).toHaveLength(0);
      expectMessage(result, { text: "Task's float parameter is implicitly filled with 0", severity: 'info' });
    });

    test('works with DialogNodeOverride as well', () => {
      // Test that DialogNodeOverride also gets implicit float 0
      const modContent = `[DialogNodeOverride] ID=testOverride;
        specialEffect=delayActions;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should pass validation (no errors) and provide info message
      expect(result.errors).toHaveLength(0);
      expectMessage(result, { text: "Task's float parameter is implicitly filled with 0", severity: 'info' });
    });

    test('errors when 2 floats are required and none are given', () => {
      // 'moveCamXY' requires 2 floats. Ensure the implicitly added value only counts as 1.
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=moveCamXY;`;

      const result = validator.validate(modContent, 'test.txt');
      expectMessage(result, { text: "parameters don't match any use case", severity: 'error' });
    });

    test('does not add implicit float for other object types', () => {
      // ActorValueAffecter.magnitude should NOT get implicit float
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=task;
        magnitude=delayActions;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should error because delayActions requires a float and no implicit one is provided
      expectMessage(result, { text: "parameters don't match any use case", severity: 'error' });
    });

    test('does not warn about too many when implicit float causes excess', () => {
      // 'abil' has optional floats[0], so max is 1
      // Providing 1 float explicitly, implicit adds another = 2 total
      // Should NOT warn about too many since we're within range without the implicit
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=abil,1;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should not have "too many" warning
      expectValid(result);
    });

    test('still warns about too many when user provides excess', () => {
      // 'abil' has optional floats[0], so max is 1
      // Providing 5 floats explicitly is already over the limit
      // SHOULD warn about too many
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=abil,1,2,3,4,5;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should warn about too many parameters
      expectMessage(result, { text: 'expects at most', severity: 'warning' });
    });

    test('accepts tasks with unlimited string parameters', () => {
      // 'setupPartyFromGVars' requires strings[0+] (1 or more strings, unlimited)
      const modContent = `[DialogNode] ID=arena_join4_elite;
        specialEffect=setupPartyFromGVars,arenaEntrant1,arenaEntrant2;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });
  });
});
