import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  }),
  userId: Annotation<string>(),
  userCurrency: Annotation<string>(),
  confidence: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 1.0
  }),
  disclaimers: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  })
});

export type AgentStateType = typeof AgentState.State;
