import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global para que cualquier modulo inyecte PrismaService sin re-importarlo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
