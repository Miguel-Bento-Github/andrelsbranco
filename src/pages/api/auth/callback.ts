import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  if (!code) return redirect('/admin');

  const clientId = import.meta.env.GITHUB_CLIENT_ID;
  const clientSecret = import.meta.env.GITHUB_CLIENT_SECRET;

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const { access_token } = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'User-Agent': 'Portfolio-Admin'
      }
    });

    const user = await userResponse.json();

    // Check if user is allowed
    const allowedUsers = (import.meta.env.ALLOWED_GITHUB_USERS || '').split(',');
    if (!allowedUsers.includes(user.login)) {
      return new Response('Unauthorized - not in allowed users list', { status: 403 });
    }

    // Set session cookie
    cookies.set('github_session', JSON.stringify({
      authenticated: true,
      username: user.login
    }), {
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax'
    });

    return redirect('/admin');

  } catch (error) {
    console.error('Auth error:', error);
    return redirect('/admin?error=auth_failed');
  }
};
