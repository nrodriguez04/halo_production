import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ControlPlaneService {
  constructor(private prisma: PrismaService) {}

  async getStatus() {
    let cp = await this.prisma.controlPlane.findFirst();
    
    if (!cp) {
      // Create default if doesn't exist
      cp = await this.prisma.controlPlane.create({
        data: {
          id: 'default',
          enabled: true,
          smsEnabled: true,
          emailEnabled: true,
          docusignEnabled: true,
          externalDataEnabled: true,
        },
      });
    }

    return cp;
  }

  async updateStatus(
    updates: {
      enabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      docusignEnabled?: boolean;
      externalDataEnabled?: boolean;
    },
    userId: string,
  ) {
    let cp = await this.prisma.controlPlane.findFirst();

    if (!cp) {
      cp = await this.prisma.controlPlane.create({
        data: {
          id: 'default',
          ...updates,
          updatedBy: userId,
        },
      });
    } else {
      cp = await this.prisma.controlPlane.update({
        where: { id: cp.id },
        data: {
          ...updates,
          updatedBy: userId,
        },
      });
    }

    return cp;
  }

  async isEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled;
  }

  async isSmsEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.smsEnabled;
  }

  async isEmailEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.emailEnabled;
  }

  async isDocuSignEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.docusignEnabled;
  }

  async isExternalDataEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.externalDataEnabled;
  }
}

