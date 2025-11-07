# André Branco Photography Portfolio

A photography portfolio website built with Astro, featuring galleries for portraits, bits & pieces, and film work with support for both local videos and Vimeo embeds.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm

### Installation

1. Clone the repository:
```sh
git clone https://github.com/Miguel-Bento-Github/andrelsbranco.git
cd andrelsbranco
```

2. Install dependencies:
```sh
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory with:
```
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
ALLOWED_GITHUB_USERS=username1,username2
GITHUB_TOKEN=your_github_token
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repo_name
GITHUB_BRANCH=main
NETLIFY_BUILD_HOOK=your_netlify_build_hook_url
```

4. Start the development server:
```sh
npm run dev
```

The site will be available at `http://localhost:4321`

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Installs dependencies |
| `npm run dev` | Starts local dev server at `localhost:4321` |
| `npm run build` | Build production site to `./dist/` |
| `npm run preview` | Preview build locally before deploying |

## Uploading Content

### Accessing the Admin Panel

1. Navigate to `/admin` on your site
2. Log in with an authorized GitHub account (configured in `ALLOWED_GITHUB_USERS`)
3. In development, you can bypass authentication by visiting `/admin?dev=true`

### Uploading Photos

1. Select a page category:
   - **Overview**: Featured photos shown on the homepage
   - **Portraits**: Portrait photography
   - **Bits & Pieces**: Miscellaneous photos
   - **Film**: Video content

2. Drag and drop images or click to select files
3. Check "Featured" to show the photo on the Overview page
4. Click "Upload Files"

**Supported formats**: JPG, PNG

Photos are automatically optimized:
- Full-size version at 100% quality (WebP)
- Display version (max 1920px width) for gallery viewing
- Thumbnail version (max 400px width) for grid display

### Uploading Videos

#### Local Video Files

1. Select "Film" category
2. Upload MP4 or MOV files
3. A thumbnail will be automatically generated
4. Click "Upload Files"

#### Vimeo Videos

1. Select "Film" category
2. Enter the Vimeo video URL (e.g., `https://vimeo.com/123456789`)
3. Upload a thumbnail image (JPG or PNG) - **required**
4. Click "Upload Files"

The system will:
- Extract the Vimeo video ID
- Process and optimize the thumbnail
- Create a content entry with the embedded Vimeo player

### Managing Content

After uploading, you can:
- **View content** by expanding category sections
- **Reorder items** by dragging and dropping (save order to persist changes)
- **Delete items** by selecting checkboxes and clicking "Delete Selected"

### Deployment

In production:
- All uploads are committed to GitHub
- Netlify automatically rebuilds the site (takes 2-3 minutes)
- No local files are stored on the server

In development:
- Files are saved locally in `public/uploads/` and `src/content/`
- Changes are immediately visible with hot module reloading

## Project Structure

```
/
├── public/
│   └── uploads/          # Uploaded media files (gitignored)
│       ├── photos/       # Images and thumbnails
│       └── videos/       # Local video files
├── src/
│   ├── components/       # Reusable components
│   │   ├── Header.astro
│   │   └── MasonryGrid.astro
│   ├── content/          # Content collections (gitignored except .gitkeep)
│   │   ├── overview/     # Featured photos
│   │   ├── portraits/    # Portrait photos
│   │   ├── bits-pieces/  # Miscellaneous photos
│   │   └── film/         # Video content
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro   # Homepage
│   │   ├── portraits.astro
│   │   ├── bits-pieces.astro
│   │   ├── film.astro
│   │   ├── admin.astro   # Upload dashboard
│   │   └── api/
│   │       ├── auth/     # GitHub OAuth
│   │       └── admin/    # Upload & management APIs
│   └── scripts/
│       └── gallery.ts    # Gallery modal logic
└── package.json
```

## Features

- **Image Optimization**: Automatic WebP conversion with multiple sizes
- **Masonry Grid Layout**: Responsive column-based layout
- **Lightbox Gallery**: Full-screen image/video viewer with keyboard navigation
- **GitHub OAuth Authentication**: Secure admin access
- **Vimeo Integration**: Embed Vimeo videos alongside local content
- **Drag-and-Drop Ordering**: Organize content visually
- **Automatic Deployment**: GitHub integration with Netlify auto-deploy

## Tech Stack

- **Framework**: Astro
- **Styling**: Tailwind CSS
- **Image Processing**: Sharp
- **Video Processing**: FFmpeg
- **Animation**: Anime.js
- **Authentication**: GitHub OAuth
- **Deployment**: Netlify
- **CMS**: Custom file-based system with GitHub integration
