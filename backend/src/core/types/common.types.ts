export interface JwtPayload {
    sub: string;
    email: string;
    homeId?: string;
  }
  
  export interface AuthenticatedUser {
    id: string;
    email: string;
    name: string;
    homeId?: string;
    isAdmin?: boolean;
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