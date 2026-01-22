import { SubscriptionsService, UsersService } from '@app/db';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';
import type { BotContext } from '../types/telegram.types';
import { CALLBACK_ACTIONS } from '../types/telegram.types';
import { SubscribeHandler } from './subscribe.handler';

describe('SubscribeHandler', () => {
  let handler: SubscribeHandler;
  let usersService: jest.Mocked<UsersService>;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let mockBot: {
    command: jest.Mock;
    callbackQuery: jest.Mock;
  };

  const mockUser = {
    id: 1,
    telegramId: 123456,
    username: 'testuser',
    firstName: 'Test',
    lastName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSubscription = {
    id: 1,
    userId: 1,
    status: 'active' as const,
    startsAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockBot = {
      command: jest.fn(),
      callbackQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribeHandler,
        {
          provide: UsersService,
          useValue: {
            findByTelegramId: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            getActive: jest.fn(),
            create: jest.fn(),
            cancel: jest.fn(),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            getBot: jest.fn().mockReturnValue(mockBot),
          },
        },
      ],
    }).compile();

    handler = module.get<SubscribeHandler>(SubscribeHandler);
    usersService = module.get(UsersService);
    subscriptionsService = module.get(SubscriptionsService);
  });

  /**
   * Creates a mock BotContext for testing.
   * @param telegramId - The Telegram user ID
   * @returns Mock BotContext with basic properties
   */
  function createMockContext(telegramId: number): jest.Mocked<BotContext> {
    return {
      from: {
        id: telegramId,
        username: 'testuser',
        first_name: 'Test',
        last_name: undefined,
        language_code: 'en',
        is_bot: false,
      },
      reply: jest.fn(),
      t: jest.fn((key: string) => key),
    } as unknown as jest.Mocked<BotContext>;
  }

  describe('handleSubscribe', () => {
    it('should return early when no user ID in context', async () => {
      const ctx = createMockContext(123456);
      ctx.from = undefined;

      await handler.handleSubscribe(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should create subscription for new user', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      await handler.handleSubscribe(ctx);

      expect(usersService.create).toHaveBeenCalledWith({
        telegramId: 123456,
        username: 'testuser',
        firstName: 'Test',
        lastName: undefined,
      });
      expect(subscriptionsService.create).toHaveBeenCalledWith(mockUser.id, expect.any(Date));
      expect(ctx.reply).toHaveBeenCalledWith('subscribe-success');
    });

    it('should create subscription for existing user without subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      await handler.handleSubscribe(ctx);

      expect(usersService.create).not.toHaveBeenCalled();
      expect(subscriptionsService.create).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('subscribe-success');
    });

    it('should show "already subscribed" message for existing subscriber', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(mockSubscription);

      await handler.handleSubscribe(ctx);

      expect(subscriptionsService.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('subscribe-already');
    });

    it('should create subscription with 365-day expiry', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      const now = new Date();
      await handler.handleSubscribe(ctx);

      const createCall = subscriptionsService.create.mock.calls[0];
      const expiresAt = createCall[1] as Date;

      // Verify expiry is approximately 365 days from now (allow 1 second tolerance)
      const expected = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('should handle database errors gracefully', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockRejectedValue(new Error('DB error'));

      await handler.handleSubscribe(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('error-generic');
    });
  });

  describe('handleUnsubscribe', () => {
    it('should return early when no user ID in context', async () => {
      const ctx = createMockContext(123456);
      ctx.from = undefined;

      await handler.handleUnsubscribe(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should cancel active subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.cancel.mockResolvedValue(true);

      await handler.handleUnsubscribe(ctx);

      expect(subscriptionsService.cancel).toHaveBeenCalledWith(mockUser.id);
      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-success');
    });

    it('should show "not subscribed" message when user not found', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(null);

      await handler.handleUnsubscribe(ctx);

      expect(subscriptionsService.cancel).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-not-subscribed');
    });

    it('should show "not subscribed" message when no active subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.cancel.mockResolvedValue(false);

      await handler.handleUnsubscribe(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-not-subscribed');
    });

    it('should handle database errors gracefully', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockRejectedValue(new Error('DB error'));

      await handler.handleUnsubscribe(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('error-generic');
    });
  });

  describe('onModuleInit', () => {
    it('should register /subscribe command', () => {
      handler.onModuleInit();

      expect(mockBot.command).toHaveBeenCalledWith('subscribe', expect.any(Function));
    });

    it('should register /unsubscribe command', () => {
      handler.onModuleInit();

      expect(mockBot.command).toHaveBeenCalledWith('unsubscribe', expect.any(Function));
    });

    it('should register subscribe callback query handler', () => {
      handler.onModuleInit();

      expect(mockBot.callbackQuery).toHaveBeenCalledWith(
        CALLBACK_ACTIONS.SUBSCRIBE,
        expect.any(Function),
      );
    });

    it('should register unsubscribe callback query handler', () => {
      handler.onModuleInit();

      expect(mockBot.callbackQuery).toHaveBeenCalledWith(
        CALLBACK_ACTIONS.UNSUBSCRIBE,
        expect.any(Function),
      );
    });
  });

  describe('handleSubscribeCallback', () => {
    it('should call handleSubscribe and answerCallbackQuery', async () => {
      const ctx = createMockContext(123456);
      ctx.answerCallbackQuery = jest.fn();

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      await handler.handleSubscribeCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('subscribe-success');
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it('should answer callback query even on existing subscription', async () => {
      const ctx = createMockContext(123456);
      ctx.answerCallbackQuery = jest.fn();

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(mockSubscription);

      await handler.handleSubscribeCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('subscribe-already');
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('handleUnsubscribeCallback', () => {
    it('should call handleUnsubscribe and answerCallbackQuery', async () => {
      const ctx = createMockContext(123456);
      ctx.answerCallbackQuery = jest.fn();

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.cancel.mockResolvedValue(true);

      await handler.handleUnsubscribeCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-success');
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it('should answer callback query even when not subscribed', async () => {
      const ctx = createMockContext(123456);
      ctx.answerCallbackQuery = jest.fn();

      usersService.findByTelegramId.mockResolvedValue(null);

      await handler.handleUnsubscribeCallback(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-not-subscribed');
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });
});
