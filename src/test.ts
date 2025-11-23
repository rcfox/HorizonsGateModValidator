/**
 * Test the validator with sample mod code
 */

import { ModValidator } from './validator.js';

const validator = new ModValidator();

// Test 1: Valid mod code
console.log('=== Test 1: Valid Mod Code ===');
const validMod = `
[TerrainType]
ID = customGrass;
name = Custom Grass;
R = 50;
G = 150;
B = 32;
sprite = 0;
moveCost = 1.0;
`;

const result1 = validator.validate(validMod);
console.log('Valid:', result1.valid);
console.log('Errors:', result1.errors.length);
console.log('Warnings:', result1.warnings.length);
if (result1.errors.length > 0) {
    console.log('Error details:', result1.errors);
}
console.log('');

// Test 2: Missing semicolon
console.log('=== Test 2: Missing Semicolon ===');
const missingSemicolon = `
[ItemType]
ID = testItem;
name = Test Item
damage = 10;
`;

const result2 = validator.validate(missingSemicolon);
console.log('Valid:', result2.valid);
console.log('Warnings:', result2.warnings);
console.log('');

// Test 3: Unknown object type
console.log('=== Test 3: Unknown Object Type ===');
const unknownType = `
[NotARealType]
ID = test;
value = 123;
`;

const result3 = validator.validate(unknownType);
console.log('Valid:', result3.valid);
console.log('Warnings:', result3.warnings);
console.log('');

// Test 4: Invalid property type
console.log('=== Test 4: Invalid Property Type ===');
const invalidType = `
[TerrainType]
ID = test;
R = notANumber;
G = 100;
B = 100;
`;

const result4 = validator.validate(invalidType);
console.log('Valid:', result4.valid);
console.log('Errors:', result4.errors);
console.log('');

// Test 5: Formula validation
console.log('=== Test 5: Formula Validation ===');
const formulaMod = `
[Action]
ID = testAction;
mpCost = c:wisdom/2+10;
fReq = moreThan:5:partySize;
damage = max:10:w:damage*2;
`;

const result5 = validator.validate(formulaMod);
console.log('Valid:', result5.valid);
console.log('Errors:', result5.errors.length);
console.log('Warnings:', result5.warnings.length);
if (result5.errors.length > 0) {
    console.log('Errors:', result5.errors);
}
console.log('');

// Test 6: Missing required ID
console.log('=== Test 6: Missing Required ID ===');
const missingID = `
[ActorType]
name = TestActor;
HP = 100;
`;

const result6 = validator.validate(missingID);
console.log('Valid:', result6.valid);
console.log('Errors:', result6.errors);
console.log('');

// Test 7: Nested object
console.log('=== Test 7: Nested Object ===');
const nested = `
[TerrainType]
ID = glowingTerrain;
R = 100;
G = 100;
B = 255;

[TerrainLight]
ID = glowingTerrain;
radius = 5.0;
R = 150;
G = 150;
B = 255;
`;

const result7 = validator.validate(nested);
console.log('Valid:', result7.valid);
console.log('Errors:', result7.errors.length);
console.log('Warnings:', result7.warnings.length);
console.log('');

// Summary
console.log('=== Summary ===');
console.log('Known object types:', validator.getKnownObjectTypes().length);
console.log('Tests completed!');
