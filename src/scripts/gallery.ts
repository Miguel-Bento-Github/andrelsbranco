import { animate } from 'animejs';

// Type definition
interface Image {
  src: string;
  alt: string;
}

// Small helper: create slide HTML
const createSlide = (img: Image, index: number): string => `
  <div class="gallery-slide snap-start flex-shrink-0 w-screen h-screen flex items-center justify-center px-4 py-4" data-index="${index}">
    <img src="${img.src}" alt="${img.alt}" class="w-full h-full object-contain" />
  </div>
`;

// Small helper: create overlay HTML
const createOverlayHTML = (images: Image[], startIndex: number): string => `
  <div id="gallery-overlay" class="fixed inset-0 z-[100] bg-black/30 backdrop-blur-xl opacity-0">
    <!-- Close button -->
    <button id="gallery-close" class="absolute top-6 right-6 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>

    <!-- Counter -->
    <div id="gallery-counter" class="absolute top-6 left-6 z-10 text-white text-lg font-light">
      <span id="current-index">${startIndex + 1}</span> / ${images.length}
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
      ${images.map((img, i) => createSlide(img, i)).join('')}
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

// Small helper: scroll to index
const scrollToIndex = (container: HTMLElement, index: number) => {
  const slideWidth = window.innerWidth;
  animate(container, {
    scrollLeft: index * slideWidth,
    duration: 400,
    ease: 'out(2)'
  });
};

// Small helper: update counter
const updateCounter = (current: number) => {
  const counterEl = document.getElementById('current-index');
  if (counterEl) {
    counterEl.textContent = String(current + 1);
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
    if (e.key === 'ArrowRight') onNext();
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
  div.innerHTML = createOverlayHTML(images, startIndex);
  document.body.appendChild(div.firstElementChild as HTMLElement);

  // Get elements
  const overlay = document.getElementById('gallery-overlay') as HTMLElement;
  const container = document.getElementById('gallery-container') as HTMLElement;
  const closeBtn = document.getElementById('gallery-close');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');

  // State
  let currentIndex = startIndex;

  // Navigation functions
  const goToNext = () => {
    currentIndex = nextIndex(currentIndex, images.length);
    scrollToIndex(container, currentIndex);
    updateCounter(currentIndex);
    updateURL(currentIndex);
  };

  const goToPrev = () => {
    currentIndex = prevIndex(currentIndex, images.length);
    scrollToIndex(container, currentIndex);
    updateCounter(currentIndex);
    updateURL(currentIndex);
  };

  // Handle browser back/forward
  const handlePopState = (e: PopStateEvent) => {
    if (e.state?.photoIndex !== undefined) {
      currentIndex = e.state.photoIndex;
      scrollToIndex(container, currentIndex);
      updateCounter(currentIndex);
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

  // Scroll to start position instantly
  setTimeout(() => {
    const slideWidth = window.innerWidth;
    container.scrollLeft = startIndex * slideWidth;
  }, 0);

  // Set initial URL
  updateURL(startIndex);
}
