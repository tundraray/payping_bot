import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              botToken: 'test-bot-token',
              subscriptionDays: 365,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
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
});
