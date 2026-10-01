import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { object, text, number, integer } from '../anime/schema.ts';

export const AXES = [
  'healing',
  'cognitive_load',
  'seriousness',
  'world_building',
  'character_focus',
  'travel',
] as const;
export type Axis = (typeof AXES)[number];
export type Vector = Record<Axis, { score: number; confidence: number }>;
export type InputProfile = 'basic' | 'full';
export interface FeatureSchema {
  version: string;
  hash: string;
  features: Record<Axis, { description: string; criteria: string[] }>;
}
export const DEFAULT_SCHEMA = new URL(
  '../../features/schema/v1.yaml',
  import.meta.url,
);
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export async function loadSchema(
  path: string | URL = DEFAULT_SCHEMA,
): Promise<FeatureSchema> {
  const source = await readFile(path, 'utf8');
  let root: Record<string, unknown>;
  try {
    root = object(parse(source));
  } catch {
    throw new Error('Invalid feature schema YAML');
  }
  const features = object(root.features);
  if (Object.keys(features).length !== AXES.length)
    throw new Error('Feature schema must define exactly six axes');
  const result = {} as FeatureSchema['features'];
  for (const axis of AXES) {
    const definition = object(features[axis]);
    if (
      !Array.isArray(definition.criteria) ||
      definition.criteria.length < 2 ||
      definition.criteria.length > 10
    )
      throw new Error('Score criteria must have 2–10 ordered levels');
    result[axis] = {
      description: text(definition.description),
      criteria: definition.criteria.map(text),
    };
  }
  return {
    version: text(root.version),
    hash: digest(source),
    features: result,
  };
}
export function parseVector(value: unknown): Vector {
  const row = object(value);
  if (Object.keys(row).length !== AXES.length)
    throw new Error('Expected exactly six feature axes');
  const vector = {} as Vector;
  for (const axis of AXES) {
    const feature = object(row[axis]);
    vector[axis] = {
      score: number(feature.score, 0, 1),
      confidence: number(feature.confidence, 0, 1),
    };
  }
  return vector;
}
export function parseInputProfile(value: unknown): InputProfile {
  if (value !== 'basic' && value !== 'full')
    throw new Error('Input profile must be basic or full');
  return value;
}
export interface Provenance {
  feature_schema_version: string;
  schema_sha256: string;
  provider: 'typesafe';
  model: string;
  requested_model: string;
  prompt_version: string;
  input_sha256: string;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
  generated_at: string;
}
export interface FeatureRecord extends Provenance {
  anime_id: number;
  input_profile: InputProfile;
  features: Vector;
}
export function parseProvenance(value: unknown): Provenance {
  const row = object(value);
  if (row.provider !== 'typesafe')
    throw new Error('Unsupported feature provider');
  const usage = object(row.usage);
  function hash(value: unknown) {
    const result = text(value);
    if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('Invalid SHA256');
    return result;
  }
  const generated_at = text(row.generated_at);
  if (!Number.isFinite(Date.parse(generated_at)))
    throw new Error('Invalid generation timestamp');
  return {
    feature_schema_version: text(row.feature_schema_version),
    schema_sha256: hash(row.schema_sha256),
    provider: 'typesafe',
    model: text(row.model),
    requested_model: text(row.requested_model),
    prompt_version: text(row.prompt_version),
    input_sha256: hash(row.input_sha256),
    usage: {
      input_tokens: integer(usage.input_tokens),
      output_tokens: integer(usage.output_tokens),
    },
    latency_ms: number(row.latency_ms),
    generated_at,
  };
}
export function parseFeatureRecord(value: unknown): FeatureRecord {
  const row = object(value);
  return {
    ...parseProvenance(row),
    anime_id: integer(row.anime_id, 1),
    input_profile: parseInputProfile(row.input_profile),
    features: parseVector(row.features),
  };
}
export interface MoodProfile {
  profile_schema_version: 'v1';
  original_prompt: string;
  feature_schema_version: string;
  schema_sha256: string;
  features: Vector;
}
export function parseMoodProfile(value: unknown): MoodProfile {
  const row = object(value);
  if (row.profile_schema_version !== 'v1')
    throw new Error('Unsupported mood profile version');
  const schema_sha256 = text(row.schema_sha256);
  if (!/^[a-f0-9]{64}$/.test(schema_sha256))
    throw new Error('Invalid schema SHA256');
  return {
    profile_schema_version: 'v1',
    original_prompt: text(row.original_prompt),
    feature_schema_version: text(row.feature_schema_version),
    schema_sha256,
    features: parseVector(row.features),
  };
}
