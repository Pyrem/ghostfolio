import { AIMessage } from '@langchain/core/messages';

import type { AgentStateType } from '../state';

const FINANCIAL_DISCLAIMER =
  'This is for informational purposes only and does not constitute financial advice. Always consult a qualified financial advisor before making investment decisions.';

/**
 * Disclaim post-node: appends financial disclaimers to the agent's
 * final response. Runs after verify.
 */
export function createDisclaimNode() {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const messages = state.messages;

    if (messages.length === 0) {
      return {};
    }

    const lastMessage = messages[messages.length - 1];
    const content =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    // Build disclaimers
    const allDisclaimers = [FINANCIAL_DISCLAIMER, ...(state.disclaimers ?? [])];
    const disclaimerBlock = allDisclaimers
      .map((d) => `_${d}_`)
      .join('\n\n');

    // Append disclaimers to the final message
    const updatedContent = `${content}\n\n---\n\n${disclaimerBlock}`;

    return {
      messages: [new AIMessage({ content: updatedContent })]
    };
  };
}
