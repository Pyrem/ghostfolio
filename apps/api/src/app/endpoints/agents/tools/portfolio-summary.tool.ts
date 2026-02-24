import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const schema = z.object({
  userId: z.string().describe('The authenticated user ID'),
  dateRange: z
    .enum(['1d', 'wtd', 'mtd', 'ytd', '1y', '5y', 'max'])
    .optional()
    .default('max')
    .describe('Time range for the portfolio snapshot')
});

export function createPortfolioSummaryTool(
  portfolioService: PortfolioService
) {
  // @ts-expect-error — TS2589: known deep type instantiation with DynamicStructuredTool + Zod
  return new DynamicStructuredTool({
    name: 'portfolio_summary',
    description:
      'Get a summary of the user\'s portfolio including all holdings with allocations, sectors, currencies, and asset classes. Use this when the user asks about their portfolio overview, allocation breakdown, or what they own.',
    schema,
    func: async (input: z.infer<typeof schema>): Promise<string> => {
      try {
        const details = await portfolioService.getDetails({
          dateRange: input.dateRange,
          userId: input.userId,
          impersonationId: undefined,
          withMarkets: true,
          withSummary: true
        });

        const holdings = Object.values(details.holdings).map(
          (holding: any) => ({
            name: holding.name,
            symbol: holding.symbol,
            currency: holding.currency,
            assetClass: holding.assetClass,
            assetSubClass: holding.assetSubClass,
            allocationInPercentage: holding.allocationInPercentage,
            quantity: holding.quantity,
            marketPrice: holding.marketPrice,
            valueInBaseCurrency: holding.valueInBaseCurrency,
            performancePercentage:
              holding.netPerformancePercentWithCurrencyEffect
          })
        );

        return JSON.stringify({
          success: true,
          data: {
            holdings,
            summary: details.summary ?? null,
            hasErrors: details.hasErrors
          },
          confidence: details.hasErrors ? 0.6 : 0.95
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          data: null,
          error: `Failed to fetch portfolio summary: ${error.message}`,
          confidence: 0
        });
      }
    }
  });
}
