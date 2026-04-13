import promptsData from './prompts.json';

export interface PromptTemplates {
  underwriting: {
    system: string;
    user: string;
  };
  communication: {
    sms_initial: string;
    email_initial: string;
  };
  marketing: {
    flyer: string;
    buyer_blast: string;
  };
}

export const prompts: PromptTemplates = promptsData as PromptTemplates;

export function renderPrompt(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return rendered;
}

