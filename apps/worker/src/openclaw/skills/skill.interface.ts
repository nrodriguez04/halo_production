export interface SkillDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (input: any) => Promise<any>;
}
