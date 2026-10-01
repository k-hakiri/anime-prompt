import { RECOMMENDATION_INSTRUCTIONS } from './instructions.ts';

export interface Preferences {
  likes: string[];
  dislikes: string[];
}
export interface RecommendationContext {
  policy?: string;
  preferences?: Preferences;
}
export function contextInstructions(context?: RecommendationContext): string {
  return (
    RECOMMENDATION_INSTRUCTIONS + (context?.policy ? '\n' + context.policy : '')
  );
}
export function userContext(context?: RecommendationContext) {
  return context?.preferences ? { preferences: context.preferences } : {};
}
