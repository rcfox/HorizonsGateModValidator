// Auto-generated schema types

export type FieldType = 
  | "byte"
  | "boolean"
  | "string"
  | "integer"
  | "float"
  | "Color"
  | "SpriteType"
  | "List<string>"
  | "Element"
  | "Light"
  | "List<integer>"
  | "List<ElementReaction>"
  | "Vector2"
  | "List<Element>"
  | "Formula"
  | "List<ActorValueEffect>"
  | "List<Vector2>"
  | "List<bool>"
  | "Dictionary<string, float>"
  | "Dictionary<string, string>"
  | "Dictionary<string, List<string>>"
  | "AreaOfEffect"
  | "AoEShapeType"
  | "TileCoord"
  | "AoEPreset"
  | "ItemCategory"
  | "HashSet<specialProperty>"
  | "List<float>"
  | "List<Light>"
  | "Dictionary<string, List<Keyframe>>"
  | "List<Keyframe>"
  | "Container"
  | "JournalCategory"
  | "List<Formula>"
  | "List<DialogOption>"
  | "const int"
  | "Animator"
  | "LuaRunner"
  | "ActorState"
  | "List<Actor>"
  | "Dictionary<string, BodyPart>"
  | "List<TileCoord>"
  | "ActionExecution"
  | "Dictionary<string, List<float>>"
  | "WeatherType"
  | "Dictionary<string, Dictionary<string, Location>>"
  | "Dictionary<string, List<int>>"
  | "List<TriggerEffect>"
  | "List<specialProperty>"
  | "List<ActorValueAffecter>"
  | "Zone"
  | "Dictionary<string, integer>"
  | "Screenshake"
  | "ScreenTint"
  | "Screenwave"
  | "SpriteEffects"
  | "Rectangle"
  | "Item"
  | "Dictionary<string, Actor>"
  | "List<Trigger>"
  | "List<ActTimer>";

export interface FieldSchema {
  name: string;
  type: FieldType;
  csType: string;
}

export interface ClassSchema {
  category: "definition" | "nested" | "instance" | "special";
  fields: FieldSchema[];
  supportsCloneFrom?: boolean;
}

export type ModSchema = Record<string, ClassSchema>;

export interface SchemaData {
  schema: ModSchema;
  typeAliases: Record<string, string>;
  enums: Record<string, string[]>;
}
