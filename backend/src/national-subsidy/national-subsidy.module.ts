import { Module } from '@nestjs/common';
import { NationalSubsidyController } from './national-subsidy.controller';
import { NationalSubsidyService } from './national-subsidy.service';

@Module({
  controllers: [NationalSubsidyController],
  providers: [NationalSubsidyService],
  exports: [NationalSubsidyService],
})
export class NationalSubsidyModule {}
