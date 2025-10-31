import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  // Check GitHub session
  const session = cookies.get('github_session')?.value;
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const sessionData = JSON.parse(session);
    if (!sessionData.authenticated) {
      return new Response('Unauthorized', { status: 401 });
    }
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get category from query params
  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  if (!category) {
    return new Response('Category required', { status: 400 });
  }

  try {
    // Fetch collection based on category
    const collection = await getCollection(category as any);

    // Sort by filename (alphabetically)
    const sortedCollection = collection.sort((a: any, b: any) => a.id.localeCompare(b.id));

    return new Response(JSON.stringify({ items: sortedCollection }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Content fetch error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch content',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
