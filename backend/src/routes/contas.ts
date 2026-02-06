import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// GET - Listar todas as contas
router.get('/', async (req, res) => {
  try {
    const contas = await prisma.conta.findMany({
      include: { categoria: true },
      orderBy: { dataVencimento: 'asc' }
    })
    res.json(contas)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contas' })
  }
})

// POST - Criar nova conta
router.post('/', async (req, res) => {
  try {
    const conta = await prisma.conta.create({
      data: req.body
    })
    res.status(201).json(conta)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar conta' })
  }
})

// PUT - Atualizar conta
router.put('/:id', async (req, res) => {
  try {
    const conta = await prisma.conta.update({
      where: { id: Number(req.params.id) },
      data: req.body
    })
    res.json(conta)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar conta' })
  }
})

// DELETE - Deletar conta
router.delete('/:id', async (req, res) => {
  try {
    await prisma.conta.delete({
      where: { id: Number(req.params.id) }
    })
    res.status(204).send()
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar conta' })
  }
})

export default router