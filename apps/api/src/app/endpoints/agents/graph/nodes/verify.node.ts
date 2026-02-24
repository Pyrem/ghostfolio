import type { AgentStateType } from '../state';

/**
 * Verify post-node: runs 5 verification checks on the agent's response
 * before it reaches the user.
 *
 * 1. Fact-check: ensure tool results are referenced
 * 2. Hallucination detection: flag numbers not from tool outputs
 * 3. Confidence scoring: score 0–100%, caveat if below 70%
 * 4. Domain constraints: validate financial logic
 * 5. Output validation: check response is well-formed
 */
export function createVerifyNode() {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const messages = state.messages;

    if (messages.length === 0) {
      return { confidence: 0 };
    }

    const lastMessage = messages[messages.length - 1];
    const content =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    // Collect tool result messages for cross-referencing
    const toolResults = messages
      .filter((m) => m._getType() === 'tool')
      .map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      );

    let confidence = 0.95;
    const issues: string[] = [];

    // 1. Fact-check: verify tool results exist if response references data
    const hasDataReferences =
      /\d+[\.,]\d+|portfolio|holding|account|balance/i.test(content);
    const hasToolResults = toolResults.length > 0;

    if (hasDataReferences && !hasToolResults) {
      confidence = Math.min(confidence, 0.4);
      issues.push('Response contains data references but no tool results');
    }

    // 2. Hallucination detection: check for dollar amounts not in tool results
    const dollarAmounts = content.match(/\$[\d,]+\.?\d*/g) ?? [];
    const toolResultsJoined = toolResults.join(' ');

    for (const amount of dollarAmounts) {
      const numericPart = amount.replace(/[$,]/g, '');

      if (!toolResultsJoined.includes(numericPart)) {
        confidence = Math.min(confidence, 0.5);
        issues.push(`Possible hallucinated amount: ${amount}`);

        break;
      }
    }

    // 3. Domain constraints: check for obviously wrong financial claims
    if (/guaranteed|risk[- ]?free|always goes up/i.test(content)) {
      confidence = Math.min(confidence, 0.3);
      issues.push('Response contains misleading financial claims');
    }

    // 4. Output validation: ensure non-empty, reasonable length
    if (content.length < 10) {
      confidence = Math.min(confidence, 0.5);
      issues.push('Response is too short');
    }

    // 5. Confidence threshold: if below 70%, flag it
    if (confidence < 0.7) {
      const disclaimers = [
        `Note: This response has reduced confidence (${Math.round(confidence * 100)}%). ${issues.join('. ')}.`
      ];

      return { confidence, disclaimers };
    }

    return { confidence };
  };
}
