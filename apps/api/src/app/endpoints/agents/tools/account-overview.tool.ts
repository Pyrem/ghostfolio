import { AccountService } from '@ghostfolio/api/app/account/account.service';

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const schema = z.object({
  userId: z.string().describe('The authenticated user ID'),
  accountId: z
    .string()
    .optional()
    .describe('Filter by specific account ID')
});

export function createAccountOverviewTool(
  accountService: AccountService
) {
  // @ts-expect-error — TS2589: known deep type instantiation with DynamicStructuredTool + Zod
  return new DynamicStructuredTool({
    name: 'account_overview',
    description:
      'Get an overview of the user\'s trading/brokerage accounts including balances, platforms, and cash positions. Use this when the user asks about their accounts, brokerages, or cash balances.',
    schema,
    func: async (input: z.infer<typeof schema>): Promise<string> => {
      try {
        const accounts = await accountService.getAccounts(input.userId);

        let result = accounts.map((account: any) => ({
          id: account.id,
          name: account.name,
          balance: account.balance,
          currency: account.currency,
          isExcluded: account.isExcluded,
          platform: account.platform
            ? {
                name: account.platform.name,
                url: account.platform.url
              }
            : null
        }));

        if (input.accountId) {
          result = result.filter((a: any) => a.id === input.accountId);
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
