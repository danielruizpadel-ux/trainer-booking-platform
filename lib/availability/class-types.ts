/** Únicos valores reales de `class_type` (docs/DATABASE.md, tabla `class_types`). */
export const CLASS_TYPES = ['private', 'group', 'academy'] as const
export type ClassType = (typeof CLASS_TYPES)[number]
