import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_API_KEY_ANTHROPIC,
  PROPERTY_ANTHROPIC_MODEL
} from '@ghostfolio/common/config';

import { ChatAnthropic } from '@langchain/anthropic';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export async function createLlm(
  propertyService: PropertyService
): Promise<ChatAnthropic> {
  const apiKey =
    await propertyService.getByKey<string>(PROPERTY_API_KEY_ANTHROPIC);

  const model =
    (await propertyService.getByKey<string>(PROPERTY_ANTHROPIC_MODEL)) ??
    DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error(
      'Anthropic API key not configured. Set API_KEY_ANTHROPIC in admin settings.'
    );
  }

  return new ChatAnthropic({
    anthropicApiKey: apiKey,
    model,
    temperature: 0,
    maxTokens: 4096
  });
}
