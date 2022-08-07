import { Module } from '@nestjs/common';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';
import { RepoModule } from '../repo/repo.module';
import { AuthModule } from '../auth/auth.module';
import { FileStoreModule } from '../filestore/file-store.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SessionModule } from '../session/session.module';
import { XpSystemsModule } from '../xp-systems/xp-systems.module';

@Module({
    imports: [RepoModule, AuthModule, FileStoreModule, SessionModule, XpSystemsModule], // TODO: why is auth needed?
    controllers: [MapsController],
    providers: [{ provide: APP_GUARD, useClass: RolesGuard }, MapsService],
    exports: [MapsService]
})
export class MapsModule {}
