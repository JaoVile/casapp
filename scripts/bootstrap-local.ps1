param(
  [ValidateSet('local', 'full-docker')]
  [string]$Mode = 'local'
)

$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "==> $Label"
  & $Action
}

function Invoke-StepWithRetry {
  param(
    [string]$Label,
    [scriptblock]$Action,
    [int]$MaxAttempts = 8,
    [int]$DelaySeconds = 3
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      Invoke-Step -Label "$Label (tentativa $attempt/$MaxAttempts)" -Action $Action
      return
    } catch {
      if ($attempt -eq $MaxAttempts) {
        throw
      }

      Write-Host "   Falhou: $($_.Exception.Message)"
      Write-Host "   Aguardando $DelaySeconds segundos para tentar novamente..."
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

if ($Mode -eq 'full-docker') {
  Invoke-Step -Label 'Subindo stack full-docker (frontend + backend + db + redis)' -Action {
    docker compose -f docker-compose.dev.yml up -d --remove-orphans
  }

  Invoke-StepWithRetry -Label 'Aplicando migrations no backend container' -Action {
    docker compose -f docker-compose.dev.yml exec backend npm run db:migrate:deploy
  }

  Invoke-StepWithRetry -Label 'Rodando seed no backend container' -Action {
    docker compose -f docker-compose.dev.yml exec backend npm run db:seed
  }
} else {
  Invoke-Step -Label 'Subindo infra local (db + redis)' -Action {
    docker compose up -d --remove-orphans
  }

  Push-Location backend
  try {
    Invoke-Step -Label 'Gerando cliente Prisma' -Action {
      npm run db:generate
    }

    Invoke-StepWithRetry -Label 'Aplicando migrations locais' -Action {
      npm run db:migrate:deploy
    }

    Invoke-StepWithRetry -Label 'Rodando seed local' -Action {
      npm run db:seed
    }
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Bootstrap concluido com sucesso.'
if ($Mode -eq 'full-docker') {
  Write-Host 'Frontend: http://localhost:5173'
  Write-Host 'Backend:  http://localhost:3333/api'
} else {
  Write-Host 'Agora rode manualmente:'
  Write-Host '  1) cd backend; npm run dev'
  Write-Host '  2) cd frontend; npm run dev'
}
