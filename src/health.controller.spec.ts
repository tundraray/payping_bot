import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  describe('health', () => {
    it('should return status ok', () => {
      expect(controller.health()).toEqual({ status: 'ok' });
    });
  });
});
