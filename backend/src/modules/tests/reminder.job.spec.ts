import { ReminderJob } from '../jobs/reminder.job';

function createPrismaMock() {
  return {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    expenseShare: {
      findMany: jest.fn(),
    },
  };
}

function createRedisMock() {
  return {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
}

describe('ReminderJob', () => {
  const originalWebhookUrl = process.env.N8N_REMINDER_WEBHOOK_URL;

  afterEach(() => {
    process.env.N8N_REMINDER_WEBHOOK_URL = originalWebhookUrl;
  });

  it('returns early when webhook is not configured', async () => {
    process.env.N8N_REMINDER_WEBHOOK_URL = '';
    const prisma = createPrismaMock();
    const redis = createRedisMock();
    const job = new ReminderJob(prisma as any, redis as any);

    await job.handleInactiveUsersReminder();

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('skips execution when distributed lock is not acquired', async () => {
    process.env.N8N_REMINDER_WEBHOOK_URL = 'https://example.com/webhook';
    const prisma = createPrismaMock();
    const redis = createRedisMock();
    redis.set.mockResolvedValueOnce(null);
    const job = new ReminderJob(prisma as any, redis as any);

    await job.handleInactiveUsersReminder();

    expect(redis.set).toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

