import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { DifyClientService } from './dify-client.service';
import { FunctionHandlerService } from './function-handler.service';

@Module({
  controllers: [AgentController],
  providers: [AgentService, DifyClientService, FunctionHandlerService],
  exports: [AgentService],
})
export class AgentModule {}
