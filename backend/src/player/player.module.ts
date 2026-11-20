import {
  Body, Controller, Get, Inject, Module, Param, ParseUUIDPipe, Post, Req, Res,
  type CanActivate, type ExecutionContext, Injectable, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CatalogModule } from '../catalog/catalog.module';
import { FiltersDto } from '../catalog/catalog.dto';
import { PlayerRepository } from './player.repository';
import { PlayerService } from './player.service';

class GameDto {
  @IsInt() @Min(1) @Max(4294967295)
  appId!: number;
}

class PlayedDto extends GameDto {
  @IsBoolean()
  played!: boolean;
}

class PreferenceDto extends GameDto {
  @IsIn(['wishlist', 'hidden'])
  kind!: 'wishlist' | 'hidden';

  @IsBoolean()
  enabled!: boolean;
}

export type PlayerRequest = Request & { playerId: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(PlayerRepository) private readonly players: PlayerRepository) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<PlayerRequest>();
    const response = http.getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    const sessionId = request.headers.cookie?.match(/(?:^|;\s*)draft_session=([0-9a-f-]{36})(?=;|$)/)?.[1];
    if (sessionId && await this.players.player(sessionId)) {
      request.playerId = sessionId;
      return true;
    }

    const id = randomUUID();
    await this.players.register(id);
    request.playerId = id;
    response.cookie('draft_session', id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.secure || process.env.COOKIE_SECURE === 'true',
      path: '/api',
      maxAge: 365 * 86_400_000,
    });
    return true;
  }
}

@Controller('player')
@UseGuards(SessionGuard)
class PlayerController {
  constructor(@Inject(PlayerService) private readonly players: PlayerService) {}

  @Get()
  state(@Req() request: PlayerRequest) { return this.players.state(request.playerId); }

  @Post('rolls')
  roll(@Req() request: PlayerRequest, @Body() filters: FiltersDto) {
    return this.players.roll(request.playerId, filters);
  }

  @Post('rolls/:id/claim')
  claim(@Req() request: PlayerRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: GameDto) {
    return this.players.claim(request.playerId, id, body.appId);
  }

  @Post('bonus')
  bonus(@Req() request: PlayerRequest) { return this.players.bonus(request.playerId); }

  @Post('preferences')
  preference(@Req() request: PlayerRequest, @Body() body: PreferenceDto) {
    return this.players.preference(request.playerId, body.appId, body.kind, body.enabled);
  }

  @Post('played')
  played(@Req() request: PlayerRequest, @Body() body: PlayedDto) {
    return this.players.played(request.playerId, body.appId, body.played);
  }

  @Post('rolls/:id/share')
  share(@Req() request: PlayerRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.players.share(request.playerId, id);
  }
}

@Controller('shared')
@UseGuards(SessionGuard)
class SharedController {
  constructor(@Inject(PlayerService) private readonly players: PlayerService) {}

  @Get(':id')
  shared(@Req() request: PlayerRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.players.shared(request.playerId, id);
  }

  @Post(':id/vote')
  vote(@Req() request: PlayerRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: GameDto) {
    return this.players.vote(request.playerId, id, body.appId);
  }
}

@Module({
  imports: [CatalogModule],
  controllers: [PlayerController, SharedController],
  providers: [PlayerService, PlayerRepository, SessionGuard],
  exports: [PlayerRepository, SessionGuard],
})
export class PlayerModule {}
