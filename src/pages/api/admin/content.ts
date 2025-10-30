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

    // Sort by order field, then by date (newest first)
    const sortedCollection = collection.sort((a, b) => {
      // First sort by order (lower numbers first, 0 means not ordered)
      const orderA = a.data.order || 9999;
      const orderB = b.data.order || 9999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // Then sort by date (newest first)
      return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
    });

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
