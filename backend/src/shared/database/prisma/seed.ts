import { CategoryType, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed...');

  await prisma.task.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.itemNote.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.productUrl.deleteMany();
  await prisma.shoppingItem.deleteMany();
  await prisma.shoppingList.deleteMany();
  await prisma.expenseShare.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.category.deleteMany();
  await prisma.homeMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.home.deleteMany();

  const home = await prisma.home.create({
    data: {
      name: 'Nosso Ape',
    },
  });

  const hashedPassword = await bcrypt.hash('123456', 12);

  const user1 = await prisma.user.create({
    data: {
      name: 'Voce',
      email: 'voce@email.com',
      phone: '+5511999990001',
      password: hashedPassword,
      homeId: home.id,
      isAdmin: true,
      pixKey: 'voce@email.com',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      name: 'Amigo',
      email: 'amigo@email.com',
      phone: '+5511999990002',
      password: hashedPassword,
      homeId: home.id,
      pixKey: '11999999999',
    },
  });

  await prisma.homeMember.createMany({
    data: [
      {
        homeId: home.id,
        userId: user1.id,
        role: 'ADMIN',
      },
      {
        homeId: home.id,
        userId: user2.id,
        role: 'MEMBER',
      },
    ],
  });

  console.log(`Usuarios criados: ${user1.name} e ${user2.name}`);

  const categoriesData = [
    {
      name: 'Aluguel/Parcela',
      icon: '🏠',
      color: '#6366F1',
      type: CategoryType.FIXED,
      isRecurring: true,
      recurringDay: 10,
    },
    {
      name: 'Internet',
      icon: '📡',
      color: '#8B5CF6',
      type: CategoryType.FIXED,
      isRecurring: true,
      recurringDay: 15,
    },
    {
      name: 'Luz',
      icon: '💡',
      color: '#F59E0B',
      type: CategoryType.VARIABLE,
      isRecurring: true,
      recurringDay: 20,
    },
    {
      name: 'Agua',
      icon: '💧',
      color: '#3B82F6',
      type: CategoryType.VARIABLE,
      isRecurring: true,
      recurringDay: 20,
    },
    {
      name: 'Gas',
      icon: '🔥',
      color: '#EF4444',
      type: CategoryType.VARIABLE,
      isRecurring: true,
      recurringDay: 25,
    },
    {
      name: 'Mercado/Feira',
      icon: '🛒',
      color: '#10B981',
      type: CategoryType.VARIABLE,
      isRecurring: false,
    },
    {
      name: 'Moveis',
      icon: '🛋️',
      color: '#78716C',
      type: CategoryType.ONETIME,
      isRecurring: false,
    },
    {
      name: 'Limpeza',
      icon: '🧹',
      color: '#06B6D4',
      type: CategoryType.VARIABLE,
      isRecurring: false,
    },
    {
      name: 'Outros',
      icon: '📦',
      color: '#64748B',
      type: CategoryType.ONETIME,
      isRecurring: false,
    },
  ];

  for (const category of categoriesData) {
    await prisma.category.create({
      data: {
        ...category,
        homeId: home.id,
      },
    });
  }

  await prisma.shoppingList.create({
    data: {
      name: 'Mercado',
      type: 'SIMPLE',
      homeId: home.id,
    },
  });

  await prisma.shoppingList.create({
    data: {
      name: 'Lista de Desejos',
      type: 'WISHLIST',
      homeId: home.id,
    },
  });

  console.log('Seed concluido');
  console.log('Logins disponiveis:');
  console.log('Email: voce@email.com | Telefone: +5511999990001 | Senha: 123456');
  console.log('Email: amigo@email.com | Telefone: +5511999990002 | Senha: 123456');
}

main()
  .catch((error) => {
    console.error('Erro no seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
