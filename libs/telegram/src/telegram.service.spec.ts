import { TelegramService } from './telegram.service';

// Mock @grammyjs/i18n to avoid filesystem access
jest.mock('@grammyjs/i18n', () => ({
  I18n: jest.fn().mockImplementation(() => ({
    middleware: jest.fn(),
    t: jest.fn((key: string) => key),
  })),
}));

// Mock grammy Bot class
jest.mock('grammy', () => ({
  Bot: jest.fn().mockImplementation(() => ({
    use: jest.fn(),
    command: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  })),
  InlineKeyboard: jest.fn().mockImplementation(() => ({
    text: jest.fn().mockReturnThis(),
  })),
}));

describe('TelegramService', () => {
  let service: TelegramService;
  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      botToken: 'test-bot-token',
      subscriptionDays: 365,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramService(mockConfigService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose bot instance via getBot()', () => {
    expect(service.getBot()).toBeDefined();
  });

  it('should expose i18n instance via getI18n()', () => {
    expect(service.getI18n()).toBeDefined();
  });

  it('should throw error if botToken is not provided', () => {
    const invalidConfigService = {
      get: jest.fn().mockReturnValue(null),
    };
    expect(() => new TelegramService(invalidConfigService as any)).toThrow(
      'TELEGRAM_BOT_TOKEN is required',
    );
  });
});
