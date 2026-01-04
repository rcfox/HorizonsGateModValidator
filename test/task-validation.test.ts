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

    test('validates as task string when actorValue = "trigger"', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=trigger;
        magnitude=abil;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors when actorValue = "trigger" and magnitude is empty', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=trigger;
        magnitude=;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have error for empty magnitude
      expectMessage(result, { text: 'requires non-empty magnitude', severity: 'error' });
    });

    test('hints on invalid task when actorValue = "trigger"', () => {
      const modContent = `[ActorValueAffecter] ID=test;
        actorValue=trigger;
        magnitude=actoin;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have hint for unknown task (actoin is close to action, so it hints with corrections)
      expectMessage(result, { text: 'Unknown task', severity: 'hint' });
    });
  });

  describe('@-prefix parameter validation', () => {
    test('validates @F formula prefix', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@Fc:HP>10;`;

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
        specialEffect=test,@Rc:HP>10;`;

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

    test('validates @G global variable substitution alone', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setupPartyFromGVars,prefix@GvarName;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates @R@G formula with global variable', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@R@GformulaVar;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates @X@G coordinate with global variable', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=applyElement,fire,@X@GxCoord;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates @S@G string with global variable', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=setupPartyFromGVars,@S@GstringVar;`;

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

    test('errors on empty @G variable name in combination', () => {
      const modContent = `[DialogNode] ID=testNode;
        specialEffect=test,@R@G;`;

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

  describe('TriggerEffect property validation', () => {
    test('validates taskString property as task string', () => {
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          taskString=abil;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates effectID as task name', () => {
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('warns when both effectID and taskString are specified', () => {
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;
          taskString=travel;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should warn that taskString takes precedence and effectID will be ignored
      expectMessage(result, { text: 'taskString and effectID are specified', severity: 'warning' });
    });

    test('hints on unknown effectID task name', () => {
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=actoin;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should have hint for unknown task (with corrections)
      expectMessage(result, { text: 'Unknown task', severity: 'error' });
    });

    test('warns when TriggerEffect has neither effectID nor taskString', () => {
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          sValue=test;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should warn about missing effectID and taskString
      expectMessage(result, { text: 'has neither effectID nor taskString', severity: 'error' });
    });

    test('validates TriggerEffect with any properties', () => {
      // All TriggerEffect properties have defaults, so any combination is valid
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=setGlobalVar;
          sValue=varName;
          sValue2=varValue;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates TriggerEffect with minimal properties', () => {
      // Only effectID is required, other properties use defaults
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates TriggerEffect with mixed properties', () => {
      // Any combination of properties is valid (all have defaults)
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=setGlobalVar;
          sValue=varName;
          fValue=42;
          bValue1=true;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('validates fReq as formula', () => {
      // fReq should be validated as a formula (standard property validation)
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;
          fReq=c:HP>50;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('errors on invalid formula syntax in fReq', () => {
      // Formulas with bare comparisons (no prefix) should error
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;
          fReq=hp>50;`;

      const result = validator.validate(modContent, 'test.txt');
      expectMessage(result, { text: 'Formula parse error', severity: 'error' });
    });

    test('validates delay as any number', () => {
      // delay should accept any number
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;
          delay=2.5;`;

      const result = validator.validate(modContent, 'test.txt');
      expectValid(result);
    });

    test('does not warn about parameter counts', () => {
      // All properties have defaults, so any combination is valid
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          effectID=abil;
          sValue=anyValue;
          fValue=1.5;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should not warn about parameter counts (all properties have defaults)
      expectValid(result);
    });

    test('skips property validation when taskString is set', () => {
      // When taskString is set, effectID and other properties should be ignored for task validation
      const modContent = `[Trigger] ID=testTrigger;
        [TriggerEffect]
          taskString=abil;
          effectID=invalidTask;
          sValue=ignored;`;

      const result = validator.validate(modContent, 'test.txt');

      // Should only validate taskString, not effectID
      // The effectID won't be validated as a task name because taskString takes precedence
      // But should warn that both are specified
      expectMessage(result, { text: 'taskString and effectID are specified', severity: 'warning' });
    });
  });
});
