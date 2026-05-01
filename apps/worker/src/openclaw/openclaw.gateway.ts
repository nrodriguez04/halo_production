import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { openclawConfig } from './openclaw.config';
import type { SkillDefinition } from './skills/skill.interface';

@Injectable()
export class OpenClawGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawGateway.name);
  private client: any = null;
  private skills: Map<string, SkillDefinition> = new Map();

  registerSkill(skill: SkillDefinition) {
    this.skills.set(skill.name, skill);
    this.logger.log(`Registered OpenClaw skill: ${skill.name}`);
  }

  async onModuleInit() {
    if (!openclawConfig.enabled) {
      this.logger.log('OpenClaw disabled (FEATURE_OPENCLAW != true)');
      return;
    }

    try {
      const { OpenClawClient } = await import('openclaw-node');
      this.client = new OpenClawClient({
        url: openclawConfig.gatewayUrl,
        agent: openclawConfig.agentName,
        token: openclawConfig.authToken || undefined,
      } as any);

      this.client.on('message', async (message: any) => {
        await this.handleMessage(message);
      });

      this.client.on('error', (err: Error) => {
        this.logger.error('OpenClaw connection error', err.message);
      });

      this.client.on('connected', () => {
        this.logger.log(`Connected to OpenClaw Gateway at ${openclawConfig.gatewayUrl}`);
        this.announceSkills();
      });

      await this.client.connect();
    } catch (error: any) {
      this.logger.warn(`OpenClaw Gateway not available: ${error.message}. Skills registered locally only.`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {}
    }
  }

  private announceSkills() {
    const skillList = Array.from(this.skills.keys());
    this.logger.log(`Announcing ${skillList.length} skills: ${skillList.join(', ')}`);
  }

  private async handleMessage(message: any) {
    const { skillName, input, requestId } = message || {};
    const skill = this.skills.get(skillName);

    if (!skill) {
      this.logger.warn(`Unknown skill requested: ${skillName}`);
      return;
    }

    try {
      const result = await skill.execute(input);
      if (this.client) {
        await this.client.send({
          type: 'skill_result',
          requestId,
          result,
          status: 'success',
        });
      }
    } catch (error: any) {
      this.logger.error(`Skill ${skillName} failed: ${error.message}`);
      if (this.client) {
        await this.client.send({
          type: 'skill_result',
          requestId,
          error: error.message,
          status: 'error',
        });
      }
    }
  }

  async executeSkill(name: string, input: any): Promise<any> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    return skill.execute(input);
  }

  getRegisteredSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }
}
