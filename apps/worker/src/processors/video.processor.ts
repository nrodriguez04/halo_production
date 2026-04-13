import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma.service';

@Processor('marketing')
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'GENERATE_VIDEO_SCRIPT') return;

    const { jobRunId, tenantId, dealId } = job.data;
    this.logger.log(`Processing video script generation for deal ${dealId}`);

    try {
      await this.prisma.jobRun.update({
        where: { id: jobRunId },
        data: { status: 'RUNNING', attempts: { increment: 1 } },
      });

      const deal = await this.prisma.deal.findFirst({
        where: { id: dealId, accountId: tenantId },
        include: { property: true },
      });

      if (!deal) throw new Error('Deal not found');

      const storyboard = {
        scenes: [
          {
            type: 'intro',
            duration: 3,
            text: `Investment Opportunity: ${deal.property?.address || 'Property'}`,
            voiceover: `Check out this incredible investment opportunity at ${deal.property?.address}, ${deal.property?.city}, ${deal.property?.state}.`,
          },
          {
            type: 'details',
            duration: 5,
            text: `ARV: $${deal.arv?.toLocaleString() || 'TBD'} | Repairs: $${deal.repairEstimate?.toLocaleString() || 'TBD'}`,
            voiceover: `After repair value is estimated at ${deal.arv?.toLocaleString() || 'to be determined'} dollars with an estimated repair cost of ${deal.repairEstimate?.toLocaleString() || 'to be determined'} dollars.`,
          },
          {
            type: 'cta',
            duration: 3,
            text: 'Contact us for more details',
            voiceover: 'Reach out today to learn more about this investment opportunity.',
          },
        ],
        totalDuration: 11,
        generatedAt: new Date().toISOString(),
      };

      await this.prisma.marketingMaterial.create({
        data: {
          dealId,
          type: 'video_script',
          content: JSON.stringify(storyboard),
          metadata: { generator: 'halo-video-stub', version: '1.0' },
        },
      });

      await this.prisma.jobRun.update({
        where: { id: jobRunId },
        data: {
          status: 'SUCCEEDED',
          resultJson: storyboard as any,
        },
      });

      this.logger.log(`Video script generated for deal ${dealId}`);
    } catch (error: any) {
      this.logger.error(`Video script generation failed: ${error.message}`);
      await this.prisma.jobRun.update({
        where: { id: jobRunId },
        data: { status: 'FAILED', error: error.message },
      });
    }
  }
}
