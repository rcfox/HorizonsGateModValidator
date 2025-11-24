#!/usr/bin/env node

/**
 * Schema Extractor for C# Classes
 * Extracts public fields from C# class files and type aliases to generate TypeScript schemas
 */

const fs = require('fs');
const path = require('path');

// Type mapping from C# to our schema format
const typeMap = {
  'bool': 'boolean',
  'int': 'integer',
  'float': 'float',
  'byte': 'byte',
  'string': 'string',
  'Vector2': 'Vector2',
  'Vector3': 'Vector3',
  'Rectangle': 'Rectangle',
  'TileCoord': 'TileCoord',
  'Color': 'Color',
  'Formula': 'Formula',
  'Element': 'Element',
  'List<string>': 'List<string>',
  'List<int>': 'List<integer>',
  'List<float>': 'List<float>',
  'List<Vector2>': 'List<Vector2>',
  'List<TileCoord>': 'List<TileCoord>',
  'List<Formula>': 'List<Formula>',
  'HashSet<string>': 'HashSet<string>',
  'Dictionary<string, string>': 'Dictionary<string, string>',
  'Dictionary<string, int>': 'Dictionary<string, integer>',
  'Dictionary<string, float>': 'Dictionary<string, float>',
};

function extractFieldsFromClass(filePath, className) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fields = [];

  // Match public field declarations
  const fieldRegex = /^\s*public\s+([\w<>,\s]+?)\s+(\w+)\s*(?:=|;)/gm;

  let match;
  while ((match = fieldRegex.exec(content)) !== null) {
    const rawType = match[1].trim();
    const fieldName = match[2].trim();

    // Skip non-data fields
    if (rawType.includes('(') || rawType.includes('{') || rawType.startsWith('event') || rawType.startsWith('static')) {
      continue;
    }

    // Map the type
    let mappedType = typeMap[rawType];

    // Handle generic types not in map
    if (!mappedType) {
      if (rawType.startsWith('List<')) {
        const innerType = rawType.match(/List<(.+)>/)?.[1];
        mappedType = `List<${innerType}>`;
      } else if (rawType.startsWith('Dictionary<')) {
        mappedType = rawType;
      } else {
        mappedType = rawType;
      }
    }

    fields.push({
      name: fieldName,
      type: mappedType,
      csType: rawType
    });
  }

  // Also match public properties with getters/setters
  // Pattern: public TYPE NAME { get/set
  // More precise: looking for { followed by whitespace and then get/set keywords
  const propertyRegex = /^\s*public\s+([\w<>,\s]+?)\s+(\w+)\s*\n\s*\{\s*(?:get|set)/gm;

  while ((match = propertyRegex.exec(content)) !== null) {
    const rawType = match[1].trim();
    const fieldName = match[2].trim();

    // Skip if already added as a field
    if (fields.find(f => f.name === fieldName)) {
      continue;
    }

    // Skip static properties (rawType will be like "static Light")
    if (rawType.startsWith('static ')) {
      continue;
    }

    // Map the type
    let mappedType = typeMap[rawType];

    // Handle generic types not in map
    if (!mappedType) {
      if (rawType.startsWith('List<')) {
        const innerType = rawType.match(/List<(.+)>/)?.[1];
        mappedType = `List<${innerType}>`;
      } else if (rawType.startsWith('Dictionary<')) {
        mappedType = rawType;
      } else {
        mappedType = rawType;
      }
    }

    fields.push({
      name: fieldName,
      type: mappedType,
      csType: rawType
    });
  }

  return fields;
}

function supportsCloneFrom(filePath, className) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for constructor with both cloneFrom and Dictionary parameters
  // e.g., public AreaOfEffect(Dictionary<string, string> v, AreaOfEffect cloneFrom)
  const cloneFromConstructor = new RegExp(`public\\s+${className}\\([^)]*${className}\\s+cloneFrom[^)]*\\)`);

  return cloneFromConstructor.test(content);
}

function extractVirtualProperties(filePath, className) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const virtualProps = [];

  // Find the constructor that takes Dictionary<string, string>
  const constructorHeaderMatch = content.match(/public\s+\w+\(Dictionary<string,\s*string>\s+(\w+)\)[^{]*\{/);

  if (!constructorHeaderMatch) {
    return virtualProps;
  }

  const dictVarName = constructorHeaderMatch[1];

  // Find the full constructor body by matching braces
  const startIdx = constructorHeaderMatch.index + constructorHeaderMatch[0].length - 1; // Index of opening {
  let braceCount = 1;
  let endIdx = startIdx + 1;

  while (endIdx < content.length && braceCount > 0) {
    if (content[endIdx] === '{') braceCount++;
    else if (content[endIdx] === '}') braceCount--;
    endIdx++;
  }

  const constructorBody = content.substring(startIdx + 1, endIdx - 1);

  // Look for dictionary access patterns: v["key"] or v.ContainsKey("key")
  const dictAccessRegex = new RegExp(`${dictVarName}\\[["']([^"']+)["']\\]|${dictVarName}\\.(?:ContainsKey|TryGetValue)\\(["']([^"']+)["']`, 'g');

  const foundKeys = new Set();
  const patternKeys = new Set(); // Keys that use StartsWith pattern
  let match;

  while ((match = dictAccessRegex.exec(constructorBody)) !== null) {
    const key = match[1] || match[2];
    foundKeys.add(key);
  }

  // Also look for key.StartsWith("pattern") patterns in foreach loops
  // This handles cases like Trigger where topX, topY, etc. use StartsWith
  const startsWithRegex = /\bkey\.StartsWith\(["']([^"']+)["']\)/g;
  while ((match = startsWithRegex.exec(constructorBody)) !== null) {
    const baseKey = match[1];
    patternKeys.add(baseKey);
  }

  // Convert to virtual properties with inferred types
  for (const key of foundKeys) {
    // Try to infer type from usage
    let type = 'string'; // default

    // Check for Formula assignment (e.g., someFormula.formulaString = v["key"])
    const formulaAssignmentRegex = new RegExp(`\\w+\\.formulaString\\s*=\\s*${dictVarName}\\["${key}"\\]`);
    if (formulaAssignmentRegex.test(constructorBody)) {
      type = 'Formula';
    }
    // Check for byte.Parse (like R, G, B)
    else if (constructorBody.includes(`byte.Parse(${dictVarName}["${key}"])`)) {
      type = 'byte';
    }
    // Check for int.Parse
    else if (constructorBody.includes(`int.Parse(${dictVarName}["${key}"])`)) {
      type = 'integer';
    }
    // Check for float.Parse
    else if (constructorBody.includes(`float.Parse(${dictVarName}["${key}"])`)) {
      type = 'float';
    }
    // Check for bool.Parse
    else if (constructorBody.includes(`bool.Parse(${dictVarName}["${key}"])`)) {
      type = 'boolean';
    }

    virtualProps.push({
      name: key,
      type: type,
      csType: type,
      virtual: true // Mark as virtual property
    });
  }

  // Process pattern keys (from key.StartsWith("pattern"))
  for (const baseKey of patternKeys) {
    // These accept the base name with optional + suffixes (like topX, topX+, topX++, etc.)
    // We'll infer the type from how the value is used
    let type = 'string';

    // Look for how the value from the dictionary is parsed
    // Pattern: v[key] is used somewhere after the StartsWith check
    const blockAfterStartsWith = constructorBody.substring(
      constructorBody.indexOf(`key.StartsWith("${baseKey}")`)
    );
    const nextBraceIdx = blockAfterStartsWith.indexOf('}');
    const relevantBlock = blockAfterStartsWith.substring(0, nextBraceIdx);

    if (relevantBlock.includes(`int.Parse(${dictVarName}[key])`)) {
      type = 'integer';
    } else if (relevantBlock.includes(`float.Parse(${dictVarName}[key])`)) {
      type = 'float';
    } else if (relevantBlock.includes(`byte.Parse(${dictVarName}[key])`)) {
      type = 'byte';
    } else if (relevantBlock.includes(`bool.Parse(${dictVarName}[key])`)) {
      type = 'boolean';
    }

    virtualProps.push({
      name: baseKey + '+',
      type: type,
      csType: type,
      virtual: true,
      pattern: true // Indicates this accepts + suffixes
    });
  }

  // Check for numbered property patterns like "bodyPart" + num
  const numberedPatternRegex = new RegExp(`"([^"]+)"\\s*\\+\\s*\\w+`, 'g');
  let patternMatch;
  while ((patternMatch = numberedPatternRegex.exec(constructorBody)) !== null) {
    const basePropertyName = patternMatch[1];
    // Add a pattern property (name ends with pattern indicator)
    if (!virtualProps.find(p => p.name === basePropertyName + 'N')) {
      virtualProps.push({
        name: basePropertyName + 'N',
        type: 'string',
        csType: 'string',
        virtual: true,
        pattern: true // Mark as pattern property (accepts numbered suffixes)
      });
    }
  }

  return virtualProps;
}

/**
 * Parse DataManager case statements to extract type->class mappings
 * Handles consecutive case statements that fall through to the same code
 * @param {string} content - The DataManager.cs file content
 * @returns {Map<string, string>} Map of type names to class names
 */
function parseDataManagerCases(content) {
  const typesToClass = new Map();

  // Find all case statements - handling consecutive cases that fall through
  const allCaseMatches = [...content.matchAll(/case\s+"([^"]+)":/g)];
  const processedIndices = new Set();

  for (let i = 0; i < allCaseMatches.length; i++) {
    if (processedIndices.has(i)) continue;

    const caseMatch = allCaseMatches[i];
    const startPos = caseMatch.index;
    const caseNames = [caseMatch[1]];

    // Look ahead for consecutive case statements (fall-through cases)
    let nextIndex = i + 1;
    while (nextIndex < allCaseMatches.length) {
      const nextCase = allCaseMatches[nextIndex];
      const betweenText = content.substring(
        allCaseMatches[nextIndex - 1].index + allCaseMatches[nextIndex - 1][0].length,
        nextCase.index
      ).trim();

      // If there's only whitespace/newlines between cases, they're consecutive
      if (betweenText === '') {
        caseNames.push(nextCase[1]);
        processedIndices.add(nextIndex);
        nextIndex++;
      } else {
        break;
      }
    }

    // Find the case body (from first case to next non-consecutive case)
    const endPos = nextIndex < allCaseMatches.length
      ? allCaseMatches[nextIndex].index
      : content.length;
    const caseBody = content.substring(startPos, endPos);

    // Find "new ClassName(valuesDict)" or "new ClassName(valuesDict, ...)" in the case body
    // valuesDict must be the first argument without any property/index access
    const newMatch = caseBody.match(/new\s+(\w+)\(\s*valuesDict\s*[,)]/);

    if (newMatch) {
      const className = newMatch[1];
      for (const typeName of caseNames) {
        typesToClass.set(typeName, className);
      }
    }

    processedIndices.add(i);
  }

  return typesToClass;
}

function extractTypeAliases(dataManagerPath) {
  console.log('\nExtracting type aliases from DataManager.cs...');

  if (!fs.existsSync(dataManagerPath)) {
    console.warn('Warning: DataManager.cs not found, skipping alias extraction');
    return {};
  }

  const content = fs.readFileSync(dataManagerPath, 'utf-8');

  // Extract only the createDataFromDict function
  const createDataMatch = content.match(/public static bool createDataFromDict\(string type, Dictionary<string, string> valuesDict\)[\s\S]*?(?=\n\tpublic static|$)/);

  if (!createDataMatch) {
    console.warn('Could not find createDataFromDict function');
    return {};
  }

  const functionBody = createDataMatch[0];
  const typesToClass = parseDataManagerCases(functionBody);

  const aliases = {};

  // Convert to aliases object, filtering out non-aliases
  for (const [typeName, className] of typesToClass) {
    if (typeName !== className) {
      aliases[typeName] = className;
      console.log(`  Found alias: ${typeName} -> ${className}`);
    }
  }

  return aliases;
}

function extractEnums(baseDir) {
  console.log('\nExtracting enums...\n');

  const { execSync } = require('child_process');
  const enums = {};

  // Find all .cs files
  try {
    const result = execSync(`find "${baseDir}" -name "*.cs" 2>/dev/null`, { encoding: 'utf-8' });
    const files = result.trim().split('\n').filter(f => f);

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // First, find enums nested inside classes
      // Match: public class ClassName { ... }
      const classRegex = /public\s+class\s+(\w+)\s*[\r\n]*\{([\s\S]*?)(?:\n}\s*$|\n}\s*\n)/gm;

      let classMatch;
      while ((classMatch = classRegex.exec(content)) !== null) {
        const className = classMatch[1];
        const classBody = classMatch[2];

        // Find enums within this class
        const enumRegex = /public\s+enum\s+(\w+)\s*\{([^}]+)\}/g;

        let enumMatch;
        while ((enumMatch = enumRegex.exec(classBody)) !== null) {
          const enumName = enumMatch[1];
          const enumBody = enumMatch[2];

          // Extract enum values (name = value or just name)
          const valueRegex = /(\w+)\s*=?\s*[^,\n]*/g;
          const values = [];

          let valueMatch;
          while ((valueMatch = valueRegex.exec(enumBody)) !== null) {
            const valueName = valueMatch[1].trim();
            if (valueName) {
              values.push(valueName);
            }
          }

          if (values.length > 0) {
            // Namespace enum by its containing class
            const namespacedName = `${className}.${enumName}`;
            enums[namespacedName] = values;
            console.log(`  ${namespacedName}: ${values.slice(0, 5).join(', ')}${values.length > 5 ? `, ... (${values.length} total)` : ''}`);
          }
        }
      }

      // Also find standalone enums (not inside a class)
      // These should use their simple name
      const standaloneEnumRegex = /^public\s+enum\s+(\w+)\s*\{([^}]+)\}/gm;

      let standaloneMatch;
      while ((standaloneMatch = standaloneEnumRegex.exec(content)) !== null) {
        const enumName = standaloneMatch[1];
        const enumBody = standaloneMatch[2];

        // Check if this enum is already captured as part of a class
        // by checking if any class contains this position
        const enumPosition = standaloneMatch.index;
        let isInsideClass = false;

        const classCheckRegex = /public\s+class\s+\w+\s*[\r\n]*\{/g;
        let classCheckMatch;
        while ((classCheckMatch = classCheckRegex.exec(content)) !== null) {
          const classStart = classCheckMatch.index;
          // Find the matching closing brace for this class
          let braceCount = 1;
          let pos = classCheckMatch.index + classCheckMatch[0].length;
          while (braceCount > 0 && pos < content.length) {
            if (content[pos] === '{') braceCount++;
            if (content[pos] === '}') braceCount--;
            pos++;
          }
          const classEnd = pos;

          if (enumPosition > classStart && enumPosition < classEnd) {
            isInsideClass = true;
            break;
          }
        }

        if (!isInsideClass) {
          // Extract enum values
          const valueRegex = /(\w+)\s*=?\s*[^,\n]*/g;
          const values = [];

          let valueMatch;
          while ((valueMatch = valueRegex.exec(enumBody)) !== null) {
            const valueName = valueMatch[1].trim();
            if (valueName) {
              values.push(valueName);
            }
          }

          if (values.length > 0) {
            enums[enumName] = values;
            console.log(`  ${enumName}: ${values.slice(0, 5).join(', ')}${values.length > 5 ? `, ... (${values.length} total)` : ''}`);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error extracting enums:', e.message);
  }

  return enums;
}

function discoverTypesFromDataManager(dataManagerPath) {
  console.log('Discovering types from DataManager.cs...\n');

  if (!fs.existsSync(dataManagerPath)) {
    console.warn('Warning: DataManager.cs not found');
    return { types: new Map(), content: '' };
  }

  const content = fs.readFileSync(dataManagerPath, 'utf-8');

  // Extract only the createDataFromDict function
  const createDataMatch = content.match(/public static bool createDataFromDict\(string type, Dictionary<string, string> valuesDict\)[\s\S]*?(?=\n\tpublic static|$)/);

  if (!createDataMatch) {
    console.warn('Could not find createDataFromDict function');
    return { types: new Map(), content };
  }

  const functionBody = createDataMatch[0];
  const typesToClass = parseDataManagerCases(functionBody);

  // Log discovered types
  for (const [typeName, className] of typesToClass) {
    console.log(`  ${typeName} -> ${className}`);
  }

  return { types: typesToClass, content };
}

function categorizeClass(className, dataManagerContent) {
  // Check how the class is used in DataManager to determine category
  // Look for case blocks that instantiate this class
  const casePattern = new RegExp(`case\\s+"(\\w+)":[\\s\\S]*?(?=case\\s+"|default:|\\}\\s*return)`, 'g');
  const matches = [];
  let match;

  while ((match = casePattern.exec(dataManagerContent)) !== null) {
    const caseType = match[1];
    const caseBody = match[0];

    // Check if this case creates an instance of our class
    if (new RegExp(`new\\s+${className}\\(`).test(caseBody)) {
      matches.push({ caseType, code: caseBody });
    }
  }

  if (matches.length === 0) return 'special';

  // Check the first usage to determine category
  const firstMatch = matches[0];

  // Definition: Stored in Data.xxxTypes[value] or Data.xxx[value] collections
  // Pattern: Data.actorTypes[value] = new ActorType(...)
  const definitionPattern = new RegExp(`Data\\.\\w+\\[\\w+\\]\\s*=\\s*new\\s+${className}\\(`);
  if (definitionPattern.test(firstMatch.code)) {
    return 'definition';
  }

  // Instance: Assigned to mostRecentXxx variables
  // Pattern: mostRecentActor = new Actor(...)
  const instancePattern = new RegExp(`mostRecent\\w+\\s*=\\s*new\\s+${className}\\(`);
  if (instancePattern.test(firstMatch.code)) {
    return 'instance';
  }

  // Nested: Added to collections with .Add() or .addItem() etc.
  // Pattern: something.Add(new ClassName(...))
  const nestedPattern = new RegExp(`\\w+\\.(?:Add|addItem|add)\\([^)]*new\\s+${className}\\(`);
  if (nestedPattern.test(firstMatch.code)) {
    return 'nested';
  }

  // If the case name matches the class name and we couldn't categorize it, likely a definition
  if (firstMatch.caseType === className) {
    return 'definition';
  }

  // Default to nested if unclear
  return 'nested';
}

function extractSchema(tacticsDir) {
  const dataManagerPath = path.join(tacticsDir, 'DataManager.cs');

  // Discover all types and their classes from DataManager
  const { types: typesToClass, content: dataManagerContent } = discoverTypesFromDataManager(dataManagerPath);

  // Get unique classes
  const uniqueClasses = new Set(typesToClass.values());

  console.log(`\nFound ${typesToClass.size} types mapping to ${uniqueClasses.size} unique classes\n`);

  const schema = {};

  // Helper to find a class file in the codebase
  function findClassFile(className, baseDir) {
    const { execSync } = require('child_process');
    try {
      const result = execSync(`find "${baseDir}" -name "${className}.cs" 2>/dev/null`, { encoding: 'utf-8' });
      const files = result.trim().split('\n').filter(f => f);
      return files.length > 0 ? files[0] : null;
    } catch (e) {
      return null;
    }
  }

  const baseDir = path.join(tacticsDir, '..');

  for (const className of uniqueClasses) {
    const filePath = findClassFile(className, baseDir);
    if (!filePath) {
      console.warn(`Warning: ${className}.cs not found, skipping`);
      continue;
    }

    console.log(`Extracting ${className}...`);
    const fields = extractFieldsFromClass(filePath, className);
    const virtualProps = extractVirtualProperties(filePath, className);

    // Filter out virtual properties that duplicate real fields
    const realFieldNames = new Set(fields.map(f => f.name));
    const uniqueVirtualProps = virtualProps.filter(vp => !realFieldNames.has(vp.name));

    // Combine real fields and unique virtual properties
    const allFields = [...fields, ...uniqueVirtualProps];

    // Determine category
    const category = categorizeClass(className, dataManagerContent);

    // Check if this class supports cloneFrom
    const cloneFromSupported = supportsCloneFrom(filePath, className);

    schema[className] = {
      category: category,
      fields: allFields,
      supportsCloneFrom: cloneFromSupported
    };

    if (virtualProps.length > 0) {
      console.log(`  Found ${virtualProps.length} virtual properties: ${virtualProps.map(p => p.name).join(', ')}`);
    }
  }

  // Extract type aliases from DataManager.cs
  const typeAliases = extractTypeAliases(dataManagerPath);

  // Extract virtual properties from DataManager
  const dataManagerVirtualProps = extractDataManagerVirtualProps(dataManagerPath);

  // Add virtual properties to schema
  addCommonVirtualProperties(schema, dataManagerVirtualProps);

  // Fix known property type issues
  fixfReqTypes(schema);

  // Extract enums
  const enums = extractEnums(baseDir);

  return { schema, typeAliases, enums };
}

/**
 * Fix known property type issues that can't be automatically detected
 * For example, fReq is defined as string in C# but should be treated as Formula
 */
function fixfReqTypes(schema) {
  console.log('\nFixing known property type issues...');

  // fReq should always be validated as Formula
  const classesWithFReq = ['TriggerEffect'];

  for (const className of classesWithFReq) {
    if (schema[className]) {
      const fReqField = schema[className].fields.find(f => f.name === 'fReq');
      if (fReqField && fReqField.type === 'string') {
        console.log(`  Fixing ${className}.fReq: string -> Formula`);
        fReqField.type = 'Formula';
        // Keep csType as 'string' since that's what it actually is in C#
      }
    }
  }
}

function extractDataManagerVirtualProps(dataManagerPath) {
  console.log('\nExtracting virtual properties from DataManager.cs...');

  if (!fs.existsSync(dataManagerPath)) {
    console.warn('Warning: DataManager.cs not found');
    return { common: [], byType: {} };
  }

  const content = fs.readFileSync(dataManagerPath, 'utf-8');
  const virtualPropsByType = {};

  // Find createDataFromDict function
  const createDataMatch = content.match(/public static bool createDataFromDict\(string type, Dictionary<string, string> valuesDict\)[\s\S]*?(?=\n\tpublic static|$)/);

  if (!createDataMatch) {
    console.warn('Could not find createDataFromDict function');
    return { common: [], byType: {} };
  }

  const functionBody = createDataMatch[0];

  // Extract common properties from the preamble (before switch statement)
  const switchMatch = functionBody.match(/switch\s*\(/);
  const preamble = switchMatch ? functionBody.substring(0, switchMatch.index) : '';

  const dictAccessRegex = /valuesDict\[["']([^"']+)["']\]|valuesDict\.(?:ContainsKey|TryGetValue)\(["']([^"']+)["']/g;
  const commonProps = new Set();

  let match;
  while ((match = dictAccessRegex.exec(preamble)) !== null) {
    const key = match[1] || match[2];
    commonProps.add(key);
  }

  console.log(`  Found common properties: ${Array.from(commonProps).join(', ')}`);

  // Split into case blocks
  const caseBlocks = functionBody.split(/case "/);

  for (const block of caseBlocks) {
    const caseMatch = block.match(/^([^"]+)"/);
    if (!caseMatch) continue;

    const typeName = caseMatch[1];

    // Find all valuesDict accesses in this case block
    const foundKeys = new Set();

    let match2;
    while ((match2 = dictAccessRegex.exec(block)) !== null) {
      const key = match2[1] || match2[2];
      foundKeys.add(key);
    }

    if (foundKeys.size > 0) {
      virtualPropsByType[typeName] = Array.from(foundKeys).map(key => {
        // Try to infer type
        let type = 'string';

        if (block.includes(`byte.Parse(valuesDict["${key}"])`)) {
          type = 'byte';
        } else if (block.includes(`int.Parse(valuesDict["${key}"])`)) {
          type = 'integer';
        } else if (block.includes(`float.Parse(valuesDict["${key}"])`)) {
          type = 'float';
        } else if (block.includes(`bool.Parse(valuesDict["${key}"])`)) {
          type = 'boolean';
        }

        return { name: key, type };
      });

      console.log(`  ${typeName}: ${Array.from(foundKeys).join(', ')}`);
    }
  }

  // Convert common props to virtual property format
  const commonVirtualProps = Array.from(commonProps).map(key => ({
    name: key,
    type: 'string' // Default type for common properties
  }));

  return { common: commonVirtualProps, byType: virtualPropsByType };
}

function addCommonVirtualProperties(schema, dataManagerVirtualProps) {
  // Add common properties to ALL types since they're extracted in the preamble
  for (const [className, classSchema] of Object.entries(schema)) {
    for (const virtualProp of dataManagerVirtualProps.common) {
      if (!classSchema.fields.find(f => f.name === virtualProp.name)) {
        classSchema.fields.push({
          name: virtualProp.name,
          type: virtualProp.type,
          csType: virtualProp.type,
          virtual: true,
          source: 'DataManager (common)'
        });
      }
    }
  }

  // Add type-specific properties
  for (const [className, classSchema] of Object.entries(schema)) {
    if (dataManagerVirtualProps.byType[className]) {
      for (const virtualProp of dataManagerVirtualProps.byType[className]) {
        if (!classSchema.fields.find(f => f.name === virtualProp.name)) {
          classSchema.fields.push({
            name: virtualProp.name,
            type: virtualProp.type,
            csType: virtualProp.type,
            virtual: true,
            source: 'DataManager'
          });
        }
      }
    }
  }
}

// Main execution
const tacticsDir = path.join(__dirname, '../Tactics');
const { schema, typeAliases, enums } = extractSchema(tacticsDir);

// Output combined schema, aliases, and enums as JSON
const combinedOutput = {
  schema: schema,
  typeAliases: typeAliases,
  enums: enums
};

const outputPath = path.join(__dirname, 'src/mod-schema.json');
fs.writeFileSync(outputPath, JSON.stringify(combinedOutput, null, 2));

console.log(`\n✅ Schema extracted to ${outputPath}`);
console.log(`Extracted ${Object.keys(schema).length} classes`);
console.log(`Extracted ${Object.keys(typeAliases).length} type aliases`);
console.log(`Extracted ${Object.keys(enums).length} enums`);

// Also output TypeScript type definitions
let tsOutput = '// Auto-generated schema types\n\n';
tsOutput += 'export type FieldType = \n';
const allTypes = new Set();
Object.values(schema).forEach(classSchema => {
  classSchema.fields.forEach(field => allTypes.add(field.type));
});
tsOutput += '  | "' + Array.from(allTypes).join('"\n  | "') + '";\n\n';

tsOutput += 'export interface FieldSchema {\n';
tsOutput += '  name: string;\n';
tsOutput += '  type: FieldType;\n';
tsOutput += '  csType: string;\n';
tsOutput += '}\n\n';

tsOutput += 'export interface ClassSchema {\n';
tsOutput += '  category: "definition" | "nested" | "instance" | "special";\n';
tsOutput += '  fields: FieldSchema[];\n';
tsOutput += '  supportsCloneFrom?: boolean;\n';
tsOutput += '}\n\n';

tsOutput += 'export type ModSchema = Record<string, ClassSchema>;\n\n';

tsOutput += 'export interface SchemaData {\n';
tsOutput += '  schema: ModSchema;\n';
tsOutput += '  typeAliases: Record<string, string>;\n';
tsOutput += '  enums: Record<string, string[]>;\n';
tsOutput += '}\n';

const tsOutputPath = path.join(__dirname, 'src/mod-schema.d.ts');
fs.writeFileSync(tsOutputPath, tsOutput);

console.log(`✅ TypeScript definitions written to ${tsOutputPath}`);
