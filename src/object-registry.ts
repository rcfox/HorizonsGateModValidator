/**
 * Object type registry
 * Maps object type names to their parsing behavior and validation rules
 */

import { ObjectTypeInfo, ObjectCategory } from './types.js';

/**
 * Registry of object types and their metadata
 */
export const OBJECT_TYPE_REGISTRY: Record<string, ObjectTypeInfo> = {
  // Category 1: Standalone Definition Objects
  'TerrainType': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'ActorValue': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'ActorType': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'ItemType': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'Action': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'Animation': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'ActorClass': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'SupportAbility': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: true,
  },
  'Faction': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'QuestType': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'AvEffect': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'Palette': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'FXData': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: false,
  },

  // Category 2: Nested Property Objects (single property)
  'TerrainLight': {
    category: 'nested',
    parentType: 'TerrainType',
    propertyName: 'light',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorTypeLight': {
    category: 'nested',
    parentType: 'ActorType',
    propertyName: 'light',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemLight': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'light',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorTypeAoE': {
    category: 'nested',
    parentType: 'ActorType',
    propertyName: 'detectionAoE',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorTypeAOE': {
    category: 'nested',
    parentType: 'ActorType',
    propertyName: 'detectionAoE',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorTypeDetectAoE': {
    category: 'nested',
    parentType: 'ActorType',
    propertyName: 'detectionAoE',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorTypeDetectAOE': {
    category: 'nested',
    parentType: 'ActorType',
    propertyName: 'detectionAoE',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActionAoE': {
    category: 'nested',
    parentType: 'Action',
    propertyName: 'aoe',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActionAOE': {
    category: 'nested',
    parentType: 'Action',
    propertyName: 'aoe',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },

  // Category 3: Nested List Objects
  'TerrainReaction': {
    category: 'nested',
    parentType: 'TerrainType',
    propertyName: 'reactions',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorValueReaction': {
    category: 'nested',
    parentType: 'ActorValue',
    propertyName: 'reactions',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorValueEffect': {
    category: 'nested',
    parentType: 'ActorValue',
    propertyName: 'activeEffects',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorTypeReaction': {
    category: 'nested',
    parentType: 'ActorType',
    propertyName: 'reactions',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemEffect': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'effects',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemEffectInWeapon': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'effects_inWeapon',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemEffectInArmor': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'effects_inArmor',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemReaction': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'reactions',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemReactionInWeapon': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'reactions_inWeapon',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ItemReactionInArmor': {
    category: 'nested',
    parentType: 'ItemType',
    propertyName: 'reactions_inArmor',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorClassReaction': {
    category: 'nested',
    parentType: 'ActorClass',
    propertyName: 'reactions',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorClassEffect': {
    category: 'nested',
    parentType: 'ActorClass',
    propertyName: 'effects',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'SupportAbilityReaction': {
    category: 'nested',
    parentType: 'SupportAbility',
    propertyName: 'reactions',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'SupportAbilityEffect': {
    category: 'nested',
    parentType: 'SupportAbility',
    propertyName: 'effects',
    isList: true,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'Keyframe': {
    category: 'nested',
    parentType: 'Animation',
    propertyName: 'keyframes',
    isList: true,
    requiresID: false,
    supportsCloneFrom: false,
  },
  'AvAffecterAoE': {
    category: 'nested',
    parentType: 'AvAffecter',
    propertyName: 'aoe',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },
  'AvAffecterAOE': {
    category: 'nested',
    parentType: 'AvAffecter',
    propertyName: 'aoe',
    isList: false,
    requiresID: true,
    supportsCloneFrom: false,
  },

  // Category 4: Instance Objects (Save/Runtime State)
  'Actor': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorClone': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorState': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorCrew': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorItem': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorGateItem': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorInventory': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorContainer': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorGateInventory': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorGateContainer': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorEffect': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorAOE': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorAoE': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'GlobalAoE': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'GlobalAOE': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'Fleet': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'FleetBoat': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'FleetCargo': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'FleetCargoItem': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'Item': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'StashItem': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'CargoItem': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'Zone': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ZoneMerge': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'Location': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'LocationContainer': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'LocationItem': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'GameState': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'PlayerActor': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'PlayerActorMissing': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'PlayerActorBarracks': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'PlayerActorDead': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'PlayerActorCorpse': {
    category: 'instance',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ActorPrefab': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'ActorSavePrefab': {
    category: 'instance',
    requiresID: true,
    supportsCloneFrom: false,
  },

  // Category 5: Special/Meta Objects
  'Trigger': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'GlobalTrigger': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'GlobalTriggerEffect': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'TriggerEffect': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'GlobalFormula': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'FormulaGlobal': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'LevelData': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'LevelDataZone': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'SetPiece': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'SpawnData': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'SpecialSpawn': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'Screenshake': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ScreenTint': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'Screentint': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'drawOrderFX': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'drawOrderFXLight': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ElementAssociation': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ElementAssociations': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ConsoleCommand': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'GameSettings': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'Keybinding': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'ModInfo': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'SavePreview': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'TriggerFlags': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'AvAffecter': {
    category: 'definition',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'HeightMap': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'JournalEntry': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'DialogNode': {
    category: 'special',
    requiresID: true,
    supportsCloneFrom: false,
  },
  'DialogOption': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'DialogNodeOverride': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
  'actTimer': {
    category: 'special',
    requiresID: false,
    supportsCloneFrom: false,
  },
};

/**
 * Check if an object type is known
 */
export function isKnownObjectType(type: string): boolean {
  return type in OBJECT_TYPE_REGISTRY;
}

/**
 * Get object type info
 */
export function getObjectTypeInfo(type: string): ObjectTypeInfo | null {
  return OBJECT_TYPE_REGISTRY[type] || null;
}
