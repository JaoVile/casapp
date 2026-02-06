import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// GET - Listar itens da lista de compras
router.get('/lista', async (req, res) => {
  try {
    const itens = await prisma.itemLista.findMany({
      orderBy: [
        { comprado: 'asc' },
        { prioridade: 'desc' }
      ]
    })
    res.json(itens)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar lista' })
  }
})

// POST - Adicionar item na lista
router.post('/lista', async (req, res) => {
  try {
    const item = await prisma.itemLista.create({
      data: req.body
    })
    res.status(201).json(item)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar item' })
  }
})

// PATCH - Marcar como comprado
router.patch('/lista/:id/comprado', async (req, res) => {
  try {
    const item = await prisma.itemLista.update({
      where: { id: Number(req.params.id) },
      data: { comprado: req.body.comprado }
    })
    res.json(item)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar item' })
  }
})

export default router