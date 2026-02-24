import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { SystemMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { END, START, StateGraph } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

import { createLlm } from '../providers/llm-provider';
import { createAccountOverviewTool } from '../tools/account-overview.tool';
import { createHoldingsLookupTool } from '../tools/holdings-lookup.tool';
import { createPortfolioSummaryTool } from '../tools/portfolio-summary.tool';

import { createDisclaimNode } from './nodes/disclaim.node';
import { createVerifyNode } from './nodes/verify.node';
import { AgentState } from './state';

const SYSTEM_PROMPT = `You are a helpful financial assistant for Ghostfolio, a portfolio management application. You help users understand their portfolio, holdings, accounts, and financial performance.

Rules:
- Only use data returned by your tools. Never fabricate financial data.
- Always specify which tool data you're referencing in your answers.
- If a tool returns an error, tell the user honestly and suggest alternatives.
- Format currency values with appropriate symbols and 2 decimal places.
- Use markdown formatting for tables and structured data.
- Be concise but thorough. Lead with the key insight.
- Never provide specific investment recommendations or financial advice.
- If confidence is low, explicitly state your uncertainty.`;

export async function buildAgentGraph({
  accountService,
  checkpointer,
  portfolioService,
  propertyService
}: {
  accountService: AccountService;
  checkpointer?: PostgresSaver;
  portfolioService: PortfolioService;
  propertyService: PropertyService;
}) {
  const llm = await createLlm(propertyService);

  const tools: StructuredToolInterface[] = [
    createPortfolioSummaryTool(portfolioService),
    createHoldingsLookupTool(portfolioService),
    createAccountOverviewTool(accountService)
  ];

  // Build the core ReAct agent
  const reactAgent = createReactAgent({
    llm: llm as unknown as BaseChatModel,
    tools,
    prompt: new SystemMessage(SYSTEM_PROMPT)
  });

  // Build the full graph: ReAct → Verify → Disclaim
  const graph = new StateGraph(AgentState)
    .addNode('react', reactAgent)
    .addNode('verify', createVerifyNode())
    .addNode('disclaim', createDisclaimNode())
    .addEdge(START, 'react')
    .addEdge('react', 'verify')
    .addEdge('verify', 'disclaim')
    .addEdge('disclaim', END);

  return graph.compile({
    checkpointer
  });
}
