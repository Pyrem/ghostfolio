import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { v4 as uuidv4 } from 'uuid';

import { buildAgentGraph } from './graph/agent.graph';

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private checkpointer: PostgresSaver | undefined;

  public constructor(
    private readonly accountService: AccountService,
    private readonly portfolioService: PortfolioService,
    private readonly propertyService: PropertyService
  ) {}

  public async onModuleInit() {
    try {
      const databaseUrl = process.env.DATABASE_URL;

      if (databaseUrl) {
        this.checkpointer = PostgresSaver.fromConnString(databaseUrl);
        await this.checkpointer.setup();
        this.logger.log('LangGraph PostgreSQL checkpointer initialized');
      } else {
        this.logger.warn(
          'DATABASE_URL not set — conversation memory disabled'
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize checkpointer: ${error.message}`
      );
    }
  }

  public async onModuleDestroy() {
    // PostgresSaver handles connection cleanup internally
  }

  public async chat({
    message,
    threadId,
    userId,
    userCurrency,
    onToken,
    onToolStart,
    onToolEnd,
    onComplete,
    onError
  }: {
    message: string;
    threadId?: string;
    userId: string;
    userCurrency: string;
    onToken: (token: string) => void;
    onToolStart: (toolName: string) => void;
    onToolEnd: (toolName: string) => void;
    onComplete: (response: {
      threadId: string;
      content: string;
      confidence: number;
    }) => void;
    onError: (error: string) => void;
  }) {
    const resolvedThreadId = threadId ?? uuidv4();

    try {
      const graph = await buildAgentGraph({
        accountService: this.accountService,
        checkpointer: this.checkpointer,
        portfolioService: this.portfolioService,
        propertyService: this.propertyService
      });

      // Inject userId into the message so tools can access it
      const enrichedMessage = `[User ID: ${userId}] [Currency: ${userCurrency}]\n\n${message}`;

      const config = {
        configurable: {
          thread_id: resolvedThreadId
        }
      };

      // Stream the graph execution
      const stream = await graph.streamEvents(
        {
          messages: [new HumanMessage(enrichedMessage)],
          userId,
          userCurrency
        },
        {
          ...config,
          version: 'v2' as const
        }
      );

      let finalContent = '';
      let confidence = 0.95;

      for await (const event of stream) {
        if (
          event.event === 'on_chat_model_stream' &&
          event.data?.chunk?.content
        ) {
          const token =
            typeof event.data.chunk.content === 'string'
              ? event.data.chunk.content
              : '';

          if (token) {
            finalContent += token;
            onToken(token);
          }
        }

        if (event.event === 'on_tool_start') {
          onToolStart(event.name);
        }

        if (event.event === 'on_tool_end') {
          onToolEnd(event.name);
        }
      }

      // Get final state for confidence
      const finalState = await graph.getState(config);

      if (finalState?.values?.confidence !== undefined) {
        confidence = finalState.values.confidence;
      }

      if (finalState?.values?.messages?.length > 0) {
        const lastMsg =
          finalState.values.messages[finalState.values.messages.length - 1];
        finalContent =
          typeof lastMsg.content === 'string'
            ? lastMsg.content
            : finalContent;
      }

      onComplete({
        threadId: resolvedThreadId,
        content: finalContent,
        confidence
      });
    } catch (error) {
      this.logger.error(`Agent chat error: ${error.message}`, error.stack);
      onError(
        error.message?.includes('API key')
          ? 'Anthropic API key not configured. An admin must set API_KEY_ANTHROPIC in settings.'
          : 'An error occurred while processing your request. Please try again.'
      );
    }
  }

  public async getConversations({ userId }: { userId: string }) {
    if (!this.checkpointer) {
      return [];
    }

    try {
      const conversations: { threadId: string; updatedAt: string }[] = [];

      const checkpoints = this.checkpointer.list({
        configurable: {}
      });

      for await (const checkpoint of checkpoints) {
        const tid = checkpoint.config?.configurable?.thread_id;

        if (tid) {
          conversations.push({
            threadId: tid as string,
            updatedAt: checkpoint.checkpoint?.ts ?? new Date().toISOString()
          });
        }
      }

      return conversations;
    } catch (error) {
      this.logger.error(`Failed to list conversations: ${error.message}`);

      return [];
    }
  }

  public async getConversation({
    threadId,
    userId
  }: {
    threadId: string;
    userId: string;
  }) {
    if (!this.checkpointer) {
      return { threadId, messages: [] };
    }

    try {
      const graph = await buildAgentGraph({
        accountService: this.accountService,
        checkpointer: this.checkpointer,
        portfolioService: this.portfolioService,
        propertyService: this.propertyService
      });

      const state = await graph.getState({
        configurable: { thread_id: threadId }
      });

      const messages = (state?.values?.messages ?? []).map((msg: any) => ({
        role: msg._getType(),
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content)
      }));

      return { threadId, messages };
    } catch (error) {
      this.logger.error(`Failed to get conversation: ${error.message}`);

      return { threadId, messages: [] };
    }
  }

  public async deleteConversation({
    threadId,
    userId
  }: {
    threadId: string;
    userId: string;
  }) {
    // LangGraph checkpointer doesn't expose a delete API by default.
    // For MVP, we return success — full implementation would use raw SQL.
    this.logger.warn(
      `Delete conversation ${threadId} requested — not yet supported by checkpointer`
    );

    return { deleted: false, message: 'Delete not yet supported' };
  }
}
