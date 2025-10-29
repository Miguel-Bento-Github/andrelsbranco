import type { APIRoute } from 'astro';
import { unlink } from 'fs/promises';
import path from 'path';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
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

  try {
    const { id, category, filePath } = await request.json();

    if (!id || !category || !filePath) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Delete the markdown content file
    // id already includes .md extension from Astro collections
    const contentPath = path.join(process.cwd(), `src/content/${category}/${id}`);
    await unlink(contentPath);

    // Delete the actual file (photo/video)
    const actualFilePath = path.join(process.cwd(), `public${filePath}`);
    await unlink(actualFilePath);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Delete error:', error);
    return new Response(JSON.stringify({
      error: 'Delete failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
