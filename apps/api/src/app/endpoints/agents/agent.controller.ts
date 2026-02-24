import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

import { AgentService } from './agent.service';

@Controller('agents')
export class AgentController {
  public constructor(
    private readonly agentService: AgentService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Post('chat')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async chat(
    @Body() body: { message: string; threadId?: string },
    @Res() res: Response
  ) {
    const userId = this.request.user.id;
    const userCurrency =
      this.request.user.settings?.settings?.baseCurrency ?? 'USD';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      await this.agentService.chat({
        message: body.message,
        threadId: body.threadId,
        userId,
        userCurrency,
        onToken: (token: string) => {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        },
        onToolStart: (toolName: string) => {
          res.write(
            `data: ${JSON.stringify({ type: 'tool_start', tool: toolName })}\n\n`
          );
        },
        onToolEnd: (toolName: string) => {
          res.write(
            `data: ${JSON.stringify({ type: 'tool_end', tool: toolName })}\n\n`
          );
        },
        onComplete: (response: {
          threadId: string;
          content: string;
          confidence: number;
        }) => {
          res.write(
            `data: ${JSON.stringify({ type: 'complete', ...response })}\n\n`
          );
          res.end();
        },
        onError: (error: string) => {
          res.write(
            `data: ${JSON.stringify({ type: 'error', content: error })}\n\n`
          );
          res.end();
        }
      });
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', content: 'An unexpected error occurred. Please try again.' })}\n\n`
      );
      res.end();
    }
  }

  @Get('conversations')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getConversations() {
    const userId = this.request.user.id;

    return this.agentService.getConversations({ userId });
  }

  @Get('conversations/:id')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getConversation(@Param('id') threadId: string) {
    const userId = this.request.user.id;

    return this.agentService.getConversation({ threadId, userId });
  }

  @Delete('conversations/:id')
  @HasPermission(permissions.accessAssistant)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async deleteConversation(@Param('id') threadId: string) {
    const userId = this.request.user.id;

    return this.agentService.deleteConversation({ threadId, userId });
  }
}
