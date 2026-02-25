import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core'; // <--- O Reflector é quem lê o crachá
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 1. Verifica se a rota tem o decorador @Public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. Se for pública, LIBERA O ACESSO (return true)
    if (isPublic) {
      return true;
    }

    // 3. Se não for pública, segue a verificação padrão de Token
    return super.canActivate(context);
  }
}