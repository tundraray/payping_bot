import { TransactionsService } from '@app/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { BlockchainService } from './blockchain.service';
import { PollerState, TransactionPollerService } from './services/transaction-poller.service';

describe('BlockchainService', () => {
  let service: BlockchainService;
  let pollerService: jest.Mocked<TransactionPollerService>;
  let transactionsService: jest.Mocked<TransactionsService>;

  beforeEach(async () => {
    const mockPollerService = {
      startPolling: jest.fn().mockResolvedValue(undefined),
      stopPolling: jest.fn().mockResolvedValue(undefined),
      getState: jest.fn().mockReturnValue(PollerState.IDLE),
    };

    const mockTransactionsService = {
      getMonitoredWalletAddress: jest.fn().mockResolvedValue(null),
      getLastTimestamp: jest.fn().mockResolvedValue(null),
      findByHash: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        {
          provide: TransactionPollerService,
          useValue: mockPollerService,
        },
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
      ],
    }).compile();

    service = module.get<BlockchainService>(BlockchainService);
    pollerService = module.get(TransactionPollerService);
    transactionsService = module.get(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should start polling when wallet address is configured', async () => {
      transactionsService.getMonitoredWalletAddress.mockResolvedValue('TWalletAddress123');

      await service.onModuleInit();

      expect(transactionsService.getMonitoredWalletAddress).toHaveBeenCalled();
      expect(pollerService.startPolling).toHaveBeenCalled();
    });

    it('should not start polling when wallet address is not configured (AC-6.2)', async () => {
      transactionsService.getMonitoredWalletAddress.mockResolvedValue(null);

      await service.onModuleInit();

      expect(transactionsService.getMonitoredWalletAddress).toHaveBeenCalled();
      expect(pollerService.startPolling).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully during initialization', async () => {
      transactionsService.getMonitoredWalletAddress.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(pollerService.startPolling).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop polling on module destroy', async () => {
      await service.onModuleDestroy();

      expect(pollerService.stopPolling).toHaveBeenCalled();
    });

    it('should handle errors gracefully during shutdown', async () => {
      pollerService.stopPolling.mockRejectedValue(new Error('Shutdown error'));

      // Should not throw
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('startMonitoring', () => {
    it('should delegate to poller service', async () => {
      await service.startMonitoring();

      expect(pollerService.startPolling).toHaveBeenCalled();
    });
  });

  describe('stopMonitoring', () => {
    it('should delegate to poller service', async () => {
      await service.stopMonitoring();

      expect(pollerService.stopPolling).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return current poller state', () => {
      pollerService.getState.mockReturnValue(PollerState.POLLING);

      expect(service.getStatus()).toBe(PollerState.POLLING);
    });
  });

  describe('getMonitoredWallet', () => {
    it('should return null initially', () => {
      expect(service.getMonitoredWallet()).toBeNull();
    });

    it('should return wallet address after init (AC-6.1)', async () => {
      transactionsService.getMonitoredWalletAddress.mockResolvedValue('TWalletAddress123');
      await service.onModuleInit();

      expect(service.getMonitoredWallet()).toBe('TWalletAddress123');
    });
  });

  describe('refreshWalletAddress (AC-6.3)', () => {
    it('should restart polling when wallet changes', async () => {
      // Initialize with first wallet
      transactionsService.getMonitoredWalletAddress.mockResolvedValue('TWallet1');
      await service.onModuleInit();

      // Reset mocks
      pollerService.startPolling.mockClear();
      pollerService.stopPolling.mockClear();

      // Change wallet
      transactionsService.getMonitoredWalletAddress.mockResolvedValue('TWallet2');
      await service.refreshWalletAddress();

      expect(pollerService.stopPolling).toHaveBeenCalled();
      expect(pollerService.startPolling).toHaveBeenCalled();
      expect(service.getMonitoredWallet()).toBe('TWallet2');
    });

    it('should not restart polling when wallet has not changed', async () => {
      transactionsService.getMonitoredWalletAddress.mockResolvedValue('TWallet1');
      await service.onModuleInit();

      pollerService.startPolling.mockClear();
      pollerService.stopPolling.mockClear();

      // Same wallet
      await service.refreshWalletAddress();

      expect(pollerService.stopPolling).not.toHaveBeenCalled();
      expect(pollerService.startPolling).not.toHaveBeenCalled();
    });

    it('should stop polling when wallet is removed', async () => {
      transactionsService.getMonitoredWalletAddress.mockResolvedValue('TWallet1');
      await service.onModuleInit();

      pollerService.startPolling.mockClear();
      pollerService.stopPolling.mockClear();

      // Remove wallet
      transactionsService.getMonitoredWalletAddress.mockResolvedValue(null);
      await service.refreshWalletAddress();

      expect(pollerService.stopPolling).toHaveBeenCalled();
      expect(pollerService.startPolling).not.toHaveBeenCalled();
      expect(service.getMonitoredWallet()).toBeNull();
    });
  });

  describe('isPollingActive', () => {
    it('should return true when poller state is POLLING', () => {
      pollerService.getState.mockReturnValue(PollerState.POLLING);

      expect(service.isPollingActive()).toBe(true);
    });

    it('should return false when poller state is not POLLING', () => {
      pollerService.getState.mockReturnValue(PollerState.IDLE);

      expect(service.isPollingActive()).toBe(false);
    });
  });
});
