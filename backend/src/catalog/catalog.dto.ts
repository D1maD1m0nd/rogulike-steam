import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GENRES, MODES, PLATFORMS, PRICES, type Filters } from '@steam-draft/contracts';

export class FiltersDto implements Filters {
  @IsOptional() @IsIn(Object.keys(GENRES))
  genre?: Filters['genre'];

  @IsOptional() @IsIn(Object.keys(MODES))
  mode?: Filters['mode'];

  @IsOptional() @IsIn(Object.keys(PLATFORMS))
  platform?: Filters['platform'];

  @IsOptional() @IsIn(Object.keys(PRICES))
  price?: Filters['price'];
}

export class CatalogQueryDto extends FiltersDto {
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @Type(() => Number) @IsOptional() @IsInt() @Min(0) @Max(1_000_000)
  offset = 0;
}
