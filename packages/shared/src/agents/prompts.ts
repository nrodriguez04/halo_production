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
  lead_analyst: {
    system: string;
    user: string;
  };
  deal_underwriter: {
    system: string;
    user: string;
  };
  outreach_drafter: {
    system: string;
    user: string;
  };
  disposition_matcher: {
    system: string;
    user: string;
  };
  buyer_responder: {
    system: string;
    user: string;
  };
  market_intelligence: {
    system: string;
    user: string;
  };
  market_expansion: {
    system: string;
    user: string;
    /** With web research on: the same task, with the search's findings (web_findings) in the context. */
    user_web: string;
    /** The search step of a web-research run: a plain report on the unknown questions. */
    research_system: string;
    research_user: string;
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

