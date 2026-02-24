import { AccountService } from '@ghostfolio/api/app/account/account.service';

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createAccountOverviewTool(
  accountService: AccountService
) {
  return new DynamicStructuredTool({
    name: 'account_overview',
    description:
      'Get an overview of the user\'s trading/brokerage accounts including balances, platforms, and cash positions. Use this when the user asks about their accounts, brokerages, or cash balances.',
    schema: z.object({
      userId: z.string().describe('The authenticated user ID'),
      accountId: z
        .string()
        .optional()
        .describe('Filter by specific account ID')
    }),
    func: async ({ userId, accountId }) => {
      try {
        const accounts = await accountService.getAccounts(userId);

        let result = accounts.map((account) => ({
          id: account.id,
          name: account.name,
          balance: account.balance,
          currency: account.currency,
          isExcluded: account.isExcluded,
          platform: account.Platform
            ? {
                name: account.Platform.name,
                url: account.Platform.url
              }
            : null,
          valueInBaseCurrency: account.valueInBaseCurrency
        }));

        if (accountId) {
          result = result.filter((a) => a.id === accountId);
        }

        return JSON.stringify({
          success: true,
          data: result,
          confidence: 0.95
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          data: null,
          error: `Failed to fetch accounts: ${error.message}`,
          confidence: 0
        });
      }
    }
  });
}
