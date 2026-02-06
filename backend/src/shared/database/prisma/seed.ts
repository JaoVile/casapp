import { PrismaClient, CategoryType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpar dados existentes
  await prisma.itemNote.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.productUrl.deleteMany();
  await prisma.shoppingItem.deleteMany();
  await prisma.shoppingList.deleteMany();
  await prisma.expenseShare.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.home.deleteMany();

  // Criar casa
  const home = await prisma.home.create({
    data: {
      name: 'Nosso Apê',
    },
  });
  console.log('🏠 Casa criada:', home.name);

  // Criar usuários
  const hashedPassword = await bcrypt.hash('123456', 12);

  const user1 = await prisma.user.create({
    data: {
      name: 'Você',
      email: 'voce@email.com',
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
      password: hashedPassword,
      homeId: home.id,
      pixKey: '11999999999',
    },
  });

  console.log('👥 Usuários criados:', user1.name, 'e', user2.name);

  // Criar categorias padrão
  const categoriesData = [
    { name: 'Aluguel/Parcela', icon: '🏠', color: '#6366F1', type: CategoryType.FIXED, isRecurring: true, recurringDay: 10 },
    { name: 'Internet', icon: '📡', color: '#8B5CF6', type: CategoryType.FIXED, isRecurring: true, recurringDay: 15 },
    { name: 'Luz', icon: '💡', color: '#F59E0B', type: CategoryType.VARIABLE, isRecurring: true, recurringDay: 20 },
    { name: 'Água', icon: '💧', color: '#3B82F6', type: CategoryType.VARIABLE, isRecurring: true, recurringDay: 20 },
    { name: 'Gás', icon: '🔥', color: '#EF4444', type: CategoryType.VARIABLE, isRecurring: true, recurringDay: 25 },
    { name: 'Mercado/Feira', icon: '🛒', color: '#10B981', type: CategoryType.VARIABLE, isRecurring: false },
    { name: 'Móveis', icon: '🛋️', color: '#78716C', type: CategoryType.ONETIME, isRecurring: false },
    { name: 'Limpeza', icon: '🧹', color: '#06B6D4', type: CategoryType.VARIABLE, isRecurring: false },
    { name: 'Outros', icon: '📦', color: '#64748B', type: CategoryType.ONETIME, isRecurring: false },
  ];

  for (const cat of categoriesData) {
    await prisma.category.create({
      data: {
        ...cat,
        homeId: home.id,
      },
    });
  }
  console.log('📁 Categorias criadas:', categoriesData.length);

  // Criar lista de compras padrão
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

  console.log('🛒 Listas de compras criadas');

  console.log('');
  console.log('✅ Seed concluído!');
  console.log('');
  console.log('📧 Logins disponíveis:');
  console.log('   Email: voce@email.com | Senha: 123456');
  console.log('   Email: amigo@email.com | Senha: 123456');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });