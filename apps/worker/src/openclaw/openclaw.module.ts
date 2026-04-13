import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OpenClawGateway } from './openclaw.gateway';
import { SendSmsSkill } from './skills/send-sms.skill';
import { SendEmailSkill } from './skills/send-email.skill';
import { UnderwriteDealSkill } from './skills/underwrite-deal.skill';
import { EnrichLeadSkill } from './skills/enrich-lead.skill';
import { CreateEnvelopeSkill } from './skills/create-envelope.skill';
import { PropertyLookupSkill } from './skills/property-lookup.skill';
import { GenerateFlyerSkill } from './skills/generate-flyer.skill';

const skillProviders = [
  SendSmsSkill,
  SendEmailSkill,
  UnderwriteDealSkill,
  EnrichLeadSkill,
  CreateEnvelopeSkill,
  PropertyLookupSkill,
  GenerateFlyerSkill,
];

@Module({
  providers: [PrismaService, OpenClawGateway, ...skillProviders],
  exports: [OpenClawGateway],
})
export class OpenClawModule implements OnModuleInit {
  constructor(
    private gateway: OpenClawGateway,
    private sendSms: SendSmsSkill,
    private sendEmail: SendEmailSkill,
    private underwrite: UnderwriteDealSkill,
    private enrich: EnrichLeadSkill,
    private createEnvelope: CreateEnvelopeSkill,
    private propertyLookup: PropertyLookupSkill,
    private generateFlyer: GenerateFlyerSkill,
  ) {}

  onModuleInit() {
    this.gateway.registerSkill(this.sendSms.getDefinition());
    this.gateway.registerSkill(this.sendEmail.getDefinition());
    this.gateway.registerSkill(this.underwrite.getDefinition());
    this.gateway.registerSkill(this.enrich.getDefinition());
    this.gateway.registerSkill(this.createEnvelope.getDefinition());
    this.gateway.registerSkill(this.propertyLookup.getDefinition());
    this.gateway.registerSkill(this.generateFlyer.getDefinition());
  }
}
