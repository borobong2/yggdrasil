import type { MiddlewareHandler } from 'hono';

export type User = { id: string };
export type AppEnv = { Variables: { user: User } };

let testOwner: { token: string; user: User } | undefined;

export function installTestOwner(token: string, user: User): void {
  if (process.env.NODE_ENV === 'test') testOwner = { token, user };
}

export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new UnauthorizedError();
  if (testOwner?.token === token) return testOwner.user;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new UnauthorizedError();

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization }
  });
  if (!response.ok) throw new UnauthorizedError();

  const user = (await response.json()) as { id?: unknown };
  if (typeof user.id !== 'string' || !user.id) throw new UnauthorizedError();
  return { id: user.id };
}

export const ownerAuth: MiddlewareHandler<AppEnv> = async (context, next) => {
  try {
    context.set('user', await requireUser(context.req.raw));
  } catch (error) {
    if (error instanceof UnauthorizedError) return context.json({ error: 'Unauthorized' }, 401);
    throw error;
  }
  await next();
};

class UnauthorizedError extends Error {}
