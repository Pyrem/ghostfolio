import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export function createHoldingsLookupTool(
  portfolioService: PortfolioService
) {
  return new DynamicStructuredTool({
    name: 'holdings_lookup',
    description:
      'Look up detailed information about specific holdings in the user\'s portfolio. Can filter by symbol or asset class. Use this when the user asks about a specific stock, ETF, or asset they hold.',
    schema: z.object({
      userId: z.string().describe('The authenticated user ID'),
      symbol: z
        .string()
        .optional()
        .describe('Filter by specific symbol (e.g., AAPL, MSFT)'),
      assetClass: z
        .string()
        .optional()
        .describe(
          'Filter by asset class (e.g., EQUITY, FIXED_INCOME, REAL_ESTATE)'
        ),
      dateRange: z
        .enum(['1d', 'wtd', 'mtd', 'ytd', '1y', '5y', 'max'])
        .optional()
        .default('max')
        .describe('Time range for performance data')
    }),
    func: async ({ userId, symbol, assetClass, dateRange }) => {
      try {
        const details = await portfolioService.getDetails({
          dateRange,
          userId,
          impersonationId: undefined
        });

        let holdings = Object.values(details.holdings);

        if (symbol) {
          holdings = holdings.filter(
            (h) => h.symbol?.toUpperCase() === symbol.toUpperCase()
          );
        }

        if (assetClass) {
          holdings = holdings.filter(
            (h) =>
              h.assetClass?.toUpperCase() === assetClass.toUpperCase()
          );
        }

        const result = holdings.map((holding) => ({
          name: holding.name,
          symbol: holding.symbol,
          currency: holding.currency,
          assetClass: holding.assetClass,
          assetSubClass: holding.assetSubClass,
          quantity: holding.quantity,
          marketPrice: holding.marketPrice,
          averagePrice: holding.averagePrice,
          valueInBaseCurrency: holding.valueInBaseCurrency,
          allocationInPercentage: holding.allocationInPercentage,
          netPerformance: holding.netPerformanceWithCurrencyEffect,
          netPerformancePercentage:
            holding.netPerformancePercentWithCurrencyEffect,
          sectors: holding.sectors,
          countries: holding.countries,
          dataSource: holding.dataSource
        }));

        return JSON.stringify({
          success: true,
          data: result,
          confidence: details.hasErrors ? 0.6 : 0.95
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          data: null,
          error: `Failed to look up holdings: ${error.message}`,
          confidence: 0
        });
      }
    }
  });
}
