import { Module } from '@nestjs/common';
import { ServiceTypesController } from './service-types.controller';
import { ServiceTypesService } from './service-types.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  controllers: [ServiceTypesController, ServicesController],
  providers: [ServiceTypesService, ServicesService],
})
export class ServicesModule {}
