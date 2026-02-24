import { createAccountOverviewTool } from './tools/account-overview.tool';
import { createHoldingsLookupTool } from './tools/holdings-lookup.tool';
import { createPortfolioSummaryTool } from './tools/portfolio-summary.tool';
import { createVerifyNode } from './graph/nodes/verify.node';
import { createDisclaimNode } from './graph/nodes/disclaim.node';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

// Mock services
const mockPortfolioService = {
  getDetails: jest.fn()
} as any;

const mockAccountService = {
  getAccounts: jest.fn()
} as any;

describe('AgentModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('portfolio_summary tool', () => {
    it('should return portfolio holdings with standard envelope', async () => {
      mockPortfolioService.getDetails.mockResolvedValue({
        holdings: {
          AAPL: {
            name: 'Apple Inc.',
            symbol: 'AAPL',
            currency: 'USD',
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            allocationInPercentage: 0.4,
            quantity: 10,
            marketPrice: 175.5,
            valueInBaseCurrency: 1755,
            netPerformancePercentWithCurrencyEffect: 0.12
          },
          VOO: {
            name: 'Vanguard S&P 500 ETF',
            symbol: 'VOO',
            currency: 'USD',
            assetClass: 'EQUITY',
            assetSubClass: 'ETF',
            allocationInPercentage: 0.6,
            quantity: 5,
            marketPrice: 420.0,
            valueInBaseCurrency: 2100,
            netPerformancePercentWithCurrencyEffect: 0.08
          }
        },
        summary: { netWorth: 3855 },
        hasErrors: false
      });

      const tool = createPortfolioSummaryTool(mockPortfolioService);
      const result = JSON.parse(
        await tool.invoke({ userId: 'test-user', dateRange: 'max' })
      );

      expect(result.success).toBe(true);
      expect(result.data.holdings).toHaveLength(2);
      expect(result.data.holdings[0].symbol).toBe('AAPL');
      expect(result.confidence).toBe(0.95);
    });

    it('should return reduced confidence when hasErrors is true', async () => {
      mockPortfolioService.getDetails.mockResolvedValue({
        holdings: {},
        hasErrors: true
      });

      const tool = createPortfolioSummaryTool(mockPortfolioService);
      const result = JSON.parse(
        await tool.invoke({ userId: 'test-user', dateRange: 'max' })
      );

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.6);
    });

    it('should handle service errors gracefully', async () => {
      mockPortfolioService.getDetails.mockRejectedValue(
        new Error('Database connection failed')
      );

      const tool = createPortfolioSummaryTool(mockPortfolioService);
      const result = JSON.parse(
        await tool.invoke({ userId: 'test-user', dateRange: 'max' })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      expect(result.confidence).toBe(0);
    });
  });

  describe('holdings_lookup tool', () => {
    it('should filter holdings by symbol', async () => {
      mockPortfolioService.getDetails.mockResolvedValue({
        holdings: {
          AAPL: {
            name: 'Apple Inc.',
            symbol: 'AAPL',
            currency: 'USD',
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            quantity: 10,
            marketPrice: 175.5,
            averagePrice: 150.0,
            valueInBaseCurrency: 1755,
            allocationInPercentage: 0.5,
            netPerformanceWithCurrencyEffect: 255,
            netPerformancePercentWithCurrencyEffect: 0.17,
            sectors: [],
            countries: [],
            dataSource: 'YAHOO'
          },
          MSFT: {
            name: 'Microsoft',
            symbol: 'MSFT',
            currency: 'USD',
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            quantity: 5,
            marketPrice: 400.0,
            averagePrice: 350.0,
            valueInBaseCurrency: 2000,
            allocationInPercentage: 0.5,
            netPerformanceWithCurrencyEffect: 250,
            netPerformancePercentWithCurrencyEffect: 0.14,
            sectors: [],
            countries: [],
            dataSource: 'YAHOO'
          }
        },
        hasErrors: false
      });

      const tool = createHoldingsLookupTool(mockPortfolioService);
      const result = JSON.parse(
        await tool.invoke({
          userId: 'test-user',
          symbol: 'AAPL',
          dateRange: 'max'
        })
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].symbol).toBe('AAPL');
    });
  });

  describe('account_overview tool', () => {
    it('should return accounts with standard envelope', async () => {
      mockAccountService.getAccounts.mockResolvedValue([
        {
          id: 'acc-1',
          name: 'Interactive Brokers',
          balance: 5000,
          currency: 'USD',
          isExcluded: false,
          platform: { name: 'IBKR', url: 'https://ibkr.com' }
        }
      ]);

      const tool = createAccountOverviewTool(mockAccountService);
      const result = JSON.parse(
        await tool.invoke({ userId: 'test-user' })
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Interactive Brokers');
      expect(result.data[0].platform.name).toBe('IBKR');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('verify post-node', () => {
    it('should flag hallucinated dollar amounts', async () => {
      const verifyNode = createVerifyNode();
      const state = {
        messages: [
          new HumanMessage('What is my portfolio worth?'),
          new ToolMessage({
            content: JSON.stringify({ totalValue: 5000 }),
            tool_call_id: 'tc-1'
          }),
          new AIMessage('Your portfolio is worth $99999.')
        ],
        userId: 'test-user',
        userCurrency: 'USD',
        confidence: 1.0,
        disclaimers: []
      };

      const result = await verifyNode(state);

      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should pass when amounts match tool results', async () => {
      const verifyNode = createVerifyNode();
      const state = {
        messages: [
          new HumanMessage('What is my portfolio worth?'),
          new ToolMessage({
            content: JSON.stringify({ totalValue: 5000 }),
            tool_call_id: 'tc-1'
          }),
          new AIMessage('Your portfolio is worth $5000.')
        ],
        userId: 'test-user',
        userCurrency: 'USD',
        confidence: 1.0,
        disclaimers: []
      };

      const result = await verifyNode(state);

      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should flag misleading financial claims', async () => {
      const verifyNode = createVerifyNode();
      const state = {
        messages: [
          new AIMessage(
            'This investment is guaranteed to double your money.'
          )
        ],
        userId: 'test-user',
        userCurrency: 'USD',
        confidence: 1.0,
        disclaimers: []
      };

      const result = await verifyNode(state);

      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('disclaim post-node', () => {
    it('should append financial disclaimer to response', async () => {
      const disclaimNode = createDisclaimNode();
      const state = {
        messages: [
          new AIMessage('Your portfolio has 5 holdings totaling $10,000.')
        ],
        userId: 'test-user',
        userCurrency: 'USD',
        confidence: 0.95,
        disclaimers: []
      };

      const result = await disclaimNode(state);

      expect(result.messages).toHaveLength(1);

      const content = result.messages[0].content as string;

      expect(content).toContain('not constitute financial advice');
    });
  });
});
