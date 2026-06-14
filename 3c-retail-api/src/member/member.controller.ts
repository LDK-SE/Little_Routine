import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { MemberService } from './member.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('api/members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Post()
  @Roles('owner', 'salesperson')
  async create(@Body() dto: CreateMemberDto) {
    return this.memberService.create(dto);
  }

  @Get()
  @Roles('owner', 'salesperson')
  async findAll(@Query() query: MemberQueryDto) {
    return this.memberService.findAll(query);
  }

  @Get(':id')
  @Roles('owner', 'salesperson')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.memberService.findById(id);
  }

  @Put(':id')
  @Roles('owner')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.memberService.update(id, dto);
  }
}
