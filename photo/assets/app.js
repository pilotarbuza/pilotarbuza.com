/* ============================================================
   photo.pilotarbuza.com — Application Script
   Fast vanilla JS, URL hash routing, responsive Lightbox
   ============================================================ */

(() => {
  'use strict';

  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  // State
  let currentCategory = 'all';
  let activeProject = null;
  let currentPhotoIndex = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  // DOM Elements
  const gridEl = $('#projects-grid');
  const filterBtns = $$('.filter-btn');
  const mainGridSection = $('#main-grid-section');
  const projectRollView = $('#project-roll-view');
  const heroSection = $('#hero-section');
  const viewTitleEl = $('#view-title');

  // Lightbox elements
  const lightbox = $('#lightbox');
  const lbImg = $('#lightbox-img');
  const lbTitle = $('#lightbox-title');
  const lbCounter = $('#lightbox-counter');
  const lbCloseBtn = $('#lightbox-close');
  const lbPrevBtn = $('#lightbox-prev');
  const lbNextBtn = $('#lightbox-next');
  const lbFullscreenBtn = $('#lightbox-fullscreen');

  // Categories metadata
  const CATEGORIES = {
    all: 'All Projects',
    mountains: 'Mountains & Expeditions',
    aviation: 'Aviation Spotting',
    cities: 'Cities & Architecture',
    stories: 'Portraits & Stories'
  };

  // 1. Initialize
  function init() {
    updateFilterCounts();
    renderGrid(currentCategory);
    setupEventListeners();
    handleRoute();
  }

  // 2. Filter counts calculation
  function updateFilterCounts() {
    const counts = { all: PHOTO_PROJECTS.length, mountains: 0, aviation: 0, cities: 0, stories: 0 };
    PHOTO_PROJECTS.forEach(p => {
      if (counts[p.category] !== undefined) {
        counts[p.category]++;
      }
    });

    filterBtns.forEach(btn => {
      const cat = btn.dataset.category;
      const countEl = btn.querySelector('.count');
      if (countEl && counts[cat] !== undefined) {
        countEl.textContent = counts[cat];
      }
    });

    const totalFrames = PHOTO_PROJECTS.reduce((sum, p) => sum + (p.imageCount || 0), 0);
    const statPill = $('#total-frames-pill');
    if (statPill) {
      statPill.textContent = `${totalFrames} frames`;
    }
  }

  // 3. Render Projects Grid
  function renderGrid(cat = 'all') {
    const filtered = cat === 'all'
      ? PHOTO_PROJECTS
      : PHOTO_PROJECTS.filter(p => p.category === cat);

    if (viewTitleEl) {
      viewTitleEl.textContent = `${CATEGORIES[cat] || 'Projects'} (${filtered.length})`;
    }

    gridEl.innerHTML = filtered.map(p => {
      const coverUrl = p.cover || (p.images[0] ? p.images[0].preview : '');
      const catLabel = p.category ? p.category.toUpperCase() : 'PHOTO';
      return `
        <article class="project-card" data-id="${p.id}" tabindex="0" role="button" aria-label="Open ${p.title}">
          <div class="card-media">
            <img src="${coverUrl}" alt="${p.title}" loading="lazy" decoding="async">
            <div class="card-overlay"></div>
          </div>
          <div class="card-top">
            <span class="badge-category">${catLabel}</span>
            <span class="badge-frames mono">${p.imageCount} frames</span>
          </div>
          <div class="card-content">
            <h3 class="card-title">${p.title}</h3>
            ${p.description ? `<p class="card-desc">${p.description}</p>` : ''}
          </div>
        </article>
      `;
    }).join('');

    // Attach click listeners to cards
    $$('.project-card', gridEl).forEach(card => {
      const id = card.dataset.id;
      const open = () => {
        window.location.hash = id;
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  // 4. Open Project Detail Roll
  function openProject(projectId) {
    const project = PHOTO_PROJECTS.find(p => p.id === projectId);
    if (!project) {
      closeProject();
      return;
    }

    activeProject = project;

    // Switch views
    heroSection.style.display = 'none';
    mainGridSection.style.display = 'none';
    projectRollView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Populate roll
    $('#roll-title').textContent = project.title;
    $('#roll-category').textContent = (CATEGORIES[project.category] || project.category).toUpperCase();
    $('#roll-count').textContent = `${project.imageCount} frames`;
    
    const descEl = $('#roll-description');
    if (project.description) {
      descEl.textContent = project.description;
      descEl.style.display = 'block';
    } else {
      descEl.style.display = 'none';
    }

    const galleryEl = $('#gallery-masonry');
    galleryEl.innerHTML = project.images.map((img, idx) => `
      <div class="photo-item" data-index="${idx}" tabindex="0" role="button" aria-label="View photo ${idx + 1}">
        <img src="${img.preview}" data-highres="${img.url}" alt="${project.title} - ${idx + 1}" loading="lazy" decoding="async">
      </div>
    `).join('');

    // Attach lightbox triggers
    $$('.photo-item', galleryEl).forEach(item => {
      const idx = parseInt(item.dataset.index, 10);
      const openLb = () => openLightbox(idx);
      item.addEventListener('click', openLb);
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLb();
        }
      });
    });
  }

  // 5. Close Project Roll View
  function closeProject() {
    activeProject = null;
    projectRollView.classList.remove('active');
    heroSection.style.display = 'block';
    mainGridSection.style.display = 'block';
    if (window.location.hash) {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
  }

  // 6. Fullscreen Lightbox logic
  function openLightbox(index) {
    if (!activeProject || !activeProject.images[index]) return;
    currentPhotoIndex = index;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateLightbox();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  function updateLightbox() {
    if (!activeProject) return;
    const imgData = activeProject.images[currentPhotoIndex];
    if (!imgData) return;

    lbTitle.textContent = activeProject.title;
    lbCounter.textContent = `${currentPhotoIndex + 1} / ${activeProject.imageCount}`;
    
    // Smooth image transition
    lbImg.style.opacity = '0.5';
    lbImg.src = imgData.url;
    lbImg.onload = () => {
      lbImg.style.opacity = '1';
    };

    // Preload neighbors
    preloadImage(currentPhotoIndex + 1);
    preloadImage(currentPhotoIndex - 1);
  }

  function preloadImage(idx) {
    if (!activeProject || idx < 0 || idx >= activeProject.images.length) return;
    const preload = new Image();
    preload.src = activeProject.images[idx].url;
  }

  function nextPhoto() {
    if (!activeProject) return;
    currentPhotoIndex = (currentPhotoIndex + 1) % activeProject.images.length;
    updateLightbox();
  }

  function prevPhoto() {
    if (!activeProject) return;
    currentPhotoIndex = (currentPhotoIndex - 1 + activeProject.images.length) % activeProject.images.length;
    updateLightbox();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      lightbox.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // 7. Route handling (URL hash)
  function handleRoute() {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash) {
      openProject(hash);
    } else {
      closeProject();
    }
  }

  // 8. Event Listeners Setup
  function setupEventListeners() {
    // Filter buttons
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        currentCategory = cat;
        filterBtns.forEach(b => b.classList.toggle('active', b === btn));
        renderGrid(cat);
        if (activeProject) {
          closeProject();
        }
      });
    });

    // Back button in project roll
    $('#btn-back-to-grid').addEventListener('click', () => {
      closeProject();
    });

    // Hash change
    window.addEventListener('hashchange', handleRoute);

    // Lightbox buttons
    lbCloseBtn.addEventListener('click', closeLightbox);
    lbPrevBtn.addEventListener('click', prevPhoto);
    lbNextBtn.addEventListener('click', nextPhoto);
    lbFullscreenBtn.addEventListener('click', toggleFullscreen);

    // Lightbox backdrop click to close
    lightbox.addEventListener('click', e => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-stage') || e.target.classList.contains('lightbox-img-wrapper')) {
        closeLightbox();
      }
    });

    // Keyboard navigation
    window.addEventListener('keydown', e => {
      if (lightbox.classList.contains('active')) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          nextPhoto();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          prevPhoto();
        }
        if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      } else if (activeProject && e.key === 'Escape') {
        closeProject();
      }
    });

    // Touch swipe gestures on mobile
    lightbox.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    lightbox.addEventListener('touchend', e => {
      const diffX = e.changedTouches[0].screenX - touchStartX;
      const diffY = e.changedTouches[0].screenY - touchStartY;
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX < 0) {
          nextPhoto(); // Swipe left
        } else {
          prevPhoto(); // Swipe right
        }
      }
    }, { passive: true });
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
