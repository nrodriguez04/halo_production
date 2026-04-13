import { session } from '@descope/nextjs-sdk/server';

export async function getServerSession() {
  return session();
}
