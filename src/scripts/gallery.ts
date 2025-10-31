import { animate } from 'animejs';

// Type definition
interface Image {
  src: string;
  original?: string;
  alt: string;
}

// Small helper: check if source is video
const isVideo = (src: string): boolean => {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
  return videoExtensions.some(ext => src.toLowerCase().endsWith(ext));
};

// Small helper: create slide HTML
const createSlide = (img: Image, index: number): string => {
  const isVideoFile = isVideo(img.src);

  return `
  <div class="gallery-slide snap-start flex-shrink-0 w-screen h-[100dvh] flex items-center justify-center px-4 py-4" data-index="${index}">
    ${isVideoFile
      ? `<video controls class="w-full h-full object-contain" playsinline preload="none">
           <source src="${img.src}" type="video/mp4">
           <source src="${img.src}" type="video/quicktime">
           Your browser does not support the video tag.
         </video>`
      : `<img src="${img.src}" alt="${img.alt}" class="w-full h-full object-contain" loading="lazy" />`
    }
  </div>
  `;
};

// Small helper: create overlay HTML (without slides - they'll be added dynamically)
const createOverlayHTML = (totalImages: number, startIndex: number): string => `
  <div id="gallery-overlay" class="fixed inset-0 z-[100] bg-black/30 backdrop-blur-xl opacity-0 h-[100dvh] w-full">
    <!-- Close button -->
    <button id="gallery-close" class="absolute top-6 right-6 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>

    <!-- View Original button -->
    <a id="gallery-original" href="#" target="_blank" class="absolute top-6 right-20 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all" title="View original">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
      </svg>
    </a>

    <!-- Counter -->
    <div id="gallery-counter" class="absolute top-6 left-6 z-10 text-white text-lg font-light">
      <span id="current-index">${startIndex + 1}</span> / ${totalImages}
    </div>

    <!-- Navigation arrows -->
    <button id="gallery-prev" class="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
      </svg>
    </button>

    <button id="gallery-next" class="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
      </svg>
    </button>

    <!-- Horizontal scroll container -->
    <div id="gallery-container" class="flex overflow-x-auto snap-x snap-mandatory h-full scrollbar-hide">
      <!-- Slides will be dynamically added here -->
    </div>
  </div>
`;

// Small helper: fade in element
const fadeIn = (el: HTMLElement) => {
  animate(el, {
    opacity: [0, 1],
    duration: 300,
    ease: 'out(2)'
  });
};

// Small helper: fade out and remove
const fadeOut = (el: HTMLElement, callback: () => void) => {
  animate(el, {
    opacity: [1, 0],
    duration: 300,
    ease: 'out(2)',
    onComplete: callback
  });
};

// Extend window interface for prefetch tracking
declare global {
  interface Window {
    __prefetchedImages?: Set<string>;
  }
}

// Small helper: prefetch image by actually loading it
const prefetchImage = (src: string) => {
  // Check if already prefetched
  if (window.__prefetchedImages?.has(src)) {
    console.log('Already prefetched:', src);
    return;
  }

  console.log('Prefetching next image:', src);

  // Create hidden image to force browser to load it
  const img = new Image();
  img.src = src;

  // Track prefetched images
  if (!window.__prefetchedImages) {
    window.__prefetchedImages = new Set();
  }
  window.__prefetchedImages.add(src);

  console.log('Image preload started');
};

// Small helper: ensure slide exists at index
const ensureSlide = (container: HTMLElement, images: Image[], index: number): HTMLElement => {
  // Check if slide already exists
  let slide = container.querySelector(`[data-index="${index}"]`) as HTMLElement;
  if (slide) return slide;

  // Create new slide
  const slideHTML = createSlide(images[index], index);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = slideHTML.trim();
  slide = tempDiv.firstElementChild as HTMLElement;

  // Find correct position to insert (keep slides in order)
  const allSlides = Array.from(container.querySelectorAll('.gallery-slide'));
  const insertBeforeSlide = allSlides.find(s => {
    const slideIndex = parseInt((s as HTMLElement).dataset.index || '0');
    return slideIndex > index;
  });

  if (insertBeforeSlide) {
    container.insertBefore(slide, insertBeforeSlide);
  } else {
    container.appendChild(slide);
  }

  return slide;
};

// Small helper: load slides in range around current index
const loadSlidesInRange = (container: HTMLElement, images: Image[], currentIndex: number, range = 2) => {
  const totalImages = images.length;

  // Load current + range on each side
  for (let i = -range; i <= range; i++) {
    const index = (currentIndex + i + totalImages) % totalImages;
    ensureSlide(container, images, index);
  }

  // Remove slides far from current (keep range + 1 buffer)
  const allSlides = Array.from(container.querySelectorAll('.gallery-slide'));
  allSlides.forEach(slide => {
    const slideIndex = parseInt((slide as HTMLElement).dataset.index || '0');
    const distance = Math.min(
      Math.abs(slideIndex - currentIndex),
      Math.abs(slideIndex - currentIndex + totalImages),
      Math.abs(slideIndex - currentIndex - totalImages)
    );

    if (distance > range + 1) {
      slide.remove();
    }
  });
};

// Small helper: scroll to index
const scrollToIndex = (container: HTMLElement, index: number, images: Image[]) => {
  // Ensure slides are loaded
  loadSlidesInRange(container, images, index);

  const slideWidth = window.innerWidth;
  const slides = Array.from(container.querySelectorAll('.gallery-slide'));
  const targetSlide = slides.find(s => parseInt((s as HTMLElement).dataset.index || '0') === index) as HTMLElement;

  if (!targetSlide) return;

  const currentScrollIndex = Math.round(container.scrollLeft / slideWidth);
  const currentSlide = slides.find(s => parseInt((s as HTMLElement).dataset.index || '0') === currentScrollIndex) as HTMLElement;
  const currentMedia = currentSlide?.querySelector('img, video') as HTMLElement;
  const targetMedia = targetSlide.querySelector('img, video') as HTMLElement;

  // Calculate scroll position based on DOM order
  const slideIndexInDOM = slides.indexOf(targetSlide);
  container.scrollLeft = slideIndexInDOM * slideWidth;

  // Crossfade: fade out current, fade in new (simultaneously)
  if (currentMedia && currentMedia !== targetMedia) {
    animate(currentMedia, {
      opacity: [1, 0],
      duration: 250,
      ease: 'out(2)'
    });
  }

  if (targetMedia) {
    animate(targetMedia, {
      opacity: [0, 1],
      duration: 250,
      ease: 'out(2)'
    });
  }
};

// Small helper: update counter
const updateCounter = (current: number) => {
  const counterEl = document.getElementById('current-index');
  if (counterEl) {
    counterEl.textContent = String(current + 1);
  }
};

// Small helper: update original link
const updateOriginalLink = (images: Image[], current: number) => {
  const originalLink = document.getElementById('gallery-original') as HTMLAnchorElement;
  if (originalLink && images[current]) {
    const originalSrc = images[current].original || images[current].src;
    originalLink.href = originalSrc;
  }
};

// Small helper: update URL with current index
const updateURL = (index: number) => {
  const url = new URL(window.location.href);
  url.searchParams.set('photo', String(index + 1));
  window.history.pushState({ photoIndex: index }, '', url.toString());
};

// Small helper: calculate next index
const nextIndex = (current: number, total: number): number =>
  (current + 1) % total;

// Small helper: calculate previous index
const prevIndex = (current: number, total: number): number =>
  (current - 1 + total) % total;

// Small helper: close gallery
const closeGallery = () => {
  const overlay = document.getElementById('gallery-overlay');
  if (overlay) {
    fadeOut(overlay, () => {
      overlay.remove();
      document.body.style.overflow = '';
    });
  }
};

// Small helper: setup keyboard navigation
const setupKeyboard = (
  onNext: () => void,
  onPrev: () => void,
  onClose: () => void
) => {
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight' || e.key === ' ') onNext();
    if (e.key === 'ArrowLeft') onPrev();
  };

  document.addEventListener('keydown', handleKey);

  return () => document.removeEventListener('keydown', handleKey);
};

// Main function: open gallery
export function openGallery(images: Image[], startIndex = 0) {
  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Create and append overlay
  const div = document.createElement('div');
  div.innerHTML = createOverlayHTML(images.length, startIndex);
  document.body.appendChild(div.firstElementChild as HTMLElement);

  // Get elements
  const overlay = document.getElementById('gallery-overlay') as HTMLElement;
  const container = document.getElementById('gallery-container') as HTMLElement;
  const closeBtn = document.getElementById('gallery-close');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');

  // State
  let currentIndex = startIndex;

  // Load initial slides
  loadSlidesInRange(container, images, startIndex);
  console.log(`Gallery opened: loaded ${container.querySelectorAll('.gallery-slide').length} slides for image ${startIndex + 1} of ${images.length}`);

  // Prefetch next image
  const nextImageIndex = (startIndex + 1) % images.length;
  if (images[nextImageIndex]) {
    prefetchImage(images[nextImageIndex].src);
  }

  // Navigation functions
  const goToNext = () => {
    currentIndex = nextIndex(currentIndex, images.length);
    scrollToIndex(container, currentIndex, images);
    updateCounter(currentIndex);
    updateOriginalLink(images, currentIndex);
    updateURL(currentIndex);

    // Prefetch next image after this one
    const nextImageIndex = (currentIndex + 1) % images.length;
    if (images[nextImageIndex]) {
      prefetchImage(images[nextImageIndex].src);
    }
  };

  const goToPrev = () => {
    currentIndex = prevIndex(currentIndex, images.length);
    scrollToIndex(container, currentIndex, images);
    updateCounter(currentIndex);
    updateOriginalLink(images, currentIndex);
    updateURL(currentIndex);

    // Prefetch previous image before this one
    const prevImageIndex = (currentIndex - 1 + images.length) % images.length;
    if (images[prevImageIndex]) {
      prefetchImage(images[prevImageIndex].src);
    }
  };

  // Handle browser back/forward
  const handlePopState = (e: PopStateEvent) => {
    if (e.state?.photoIndex !== undefined) {
      currentIndex = e.state.photoIndex;
      scrollToIndex(container, currentIndex, images);
      updateCounter(currentIndex);
      updateOriginalLink(images, currentIndex);
    } else {
      // User went back before gallery was opened
      closeGallery();
    }
  };

  window.addEventListener('popstate', handlePopState);

  // Setup event listeners
  const cleanupClose = () => {
    window.removeEventListener('popstate', handlePopState);
    // Remove photo param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('photo');
    window.history.replaceState({}, '', url.toString());
    closeGallery();
  };

  closeBtn?.addEventListener('click', cleanupClose);
  nextBtn?.addEventListener('click', goToNext);
  prevBtn?.addEventListener('click', goToPrev);

  // Setup keyboard navigation
  const keyboardCleanup = setupKeyboard(goToNext, goToPrev, cleanupClose);

  // Animate in
  fadeIn(overlay);

  // Scroll to start position
  setTimeout(() => {
    const slideWidth = window.innerWidth;
    const slides = Array.from(container.querySelectorAll('.gallery-slide'));
    const targetSlide = slides.find(s => parseInt((s as HTMLElement).dataset.index || '0') === startIndex);
    if (targetSlide) {
      const slideIndexInDOM = slides.indexOf(targetSlide);
      container.scrollLeft = slideIndexInDOM * slideWidth;
    }
  }, 0);

  // Set initial URL and original link
  updateURL(startIndex);
  updateOriginalLink(images, startIndex);
}
