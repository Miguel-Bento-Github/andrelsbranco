import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  const redirectUri = `${import.meta.env.SITE}/api/auth/callback`;

  const githubAuthUrl =
    `https://github.com/login/oauth/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=read:user`;

  return Response.redirect(githubAuthUrl, 302);
};
