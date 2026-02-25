export interface JwtPayload {
    sub: string;
    email: string;
    homeId?: string;
    typ?: 'access' | 'refresh';
    sid?: string;
    iat?: number;
    exp?: number;
  }
  
export interface AuthenticatedUser {
    id: string;
    email: string;
    phone?: string | null;
    name: string;
    homeId?: string;
    isAdmin?: boolean;
    tokenType?: 'access' | 'refresh';
    sessionId?: string | null;
  }
  
  export interface PaginationParams {
    page?: number;
    limit?: number;
  }
  
  export interface PaginatedResult<T> {
    data: T[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }
