import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
  } from '@nestjs/common';
  
  @Injectable()
  export class HomeMemberGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
  
      if (!user?.homeId) {
        throw new ForbiddenException(
          'Você precisa fazer parte de uma casa para acessar este recurso',
        );
      }
  
      return true;
    }
  }