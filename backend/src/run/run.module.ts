import { Body, Controller, Get, Inject, Module, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { RunAction } from '@steam-draft/contracts';
import { CatalogModule } from '../catalog/catalog.module';
import { PlayerModule, SessionGuard, type PlayerRequest } from '../player/player.module';
import { RunService } from './run.service';

class ActionDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsIn(['draft', 'travel', 'play', 'prize', 'skip', 'abandon'])
  action!: RunAction;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4294967295)
  choice?: number;
}

@Controller('runs')
@UseGuards(SessionGuard)
class RunController {
  constructor(@Inject(RunService) private readonly runs: RunService) {}

  @Get()
  state(@Req() request: PlayerRequest) {
    return this.runs.state(request.playerId);
  }

  @Post()
  start(@Req() request: PlayerRequest) {
    return this.runs.start(request.playerId);
  }

  @Post(':id/action')
  action(
    @Req() request: PlayerRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ActionDto,
  ) {
    return this.runs.act(request.playerId, id, body.version, body.action, body.choice);
  }
}

@Module({ imports: [CatalogModule, PlayerModule], controllers: [RunController], providers: [RunService] })
export class RunModule {}
