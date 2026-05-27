// Nav: transparent at top, morphs to pill/glass on scroll
const nav = document.querySelector('nav');
function updateNav() {
  nav.classList.toggle('nav--scrolled', window.scrollY > 60);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// Active nav highlight with smooth sliding indicator
const navSectionIds = ['leader', 'engineer', 'problem-solver'];
const projectsEl = document.querySelector('.Projects');
const indicator = document.querySelector('.nav-indicator');

function moveIndicatorTo(id) {
  if (!indicator) return;
  if (!id) { indicator.style.opacity = '0'; return; }
  const link = document.querySelector(`a[href="#${id}"]`);
  if (!link) { indicator.style.opacity = '0'; return; }
  const navRect = nav.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  indicator.style.left   = (linkRect.left - navRect.left) + 'px';
  indicator.style.top    = (linkRect.top  - navRect.top)  + 'px';
  indicator.style.width  = linkRect.width  + 'px';
  indicator.style.height = linkRect.height + 'px';
  indicator.style.opacity = '1';
}

function clearActiveLinks() {
  navSectionIds.forEach(id => {
    const a = document.querySelector(`a[href="#${id}"]`);
    if (a) a.classList.remove('nav-active');
  });
}

function updateActiveLink() {
  const trigger = window.scrollY + window.innerHeight * 0.55;

  if (projectsEl && trigger >= projectsEl.offsetTop) {
    clearActiveLinks();
    moveIndicatorTo(null);
    return;
  }

  let active = null;
  for (let i = navSectionIds.length - 1; i >= 0; i--) {
    const el = document.getElementById(navSectionIds[i]);
    if (el && el.offsetTop <= trigger) { active = navSectionIds[i]; break; }
  }

  clearActiveLinks();
  if (active) {
    const a = document.querySelector(`a[href="#${active}"]`);
    if (a) a.classList.add('nav-active');
  }
  moveIndicatorTo(active);
}

window.addEventListener('scroll', updateActiveLink, { passive: true });
// Reposition indicator after nav pill transition (nav changes size on scroll)
window.addEventListener('scroll', () => {
  requestAnimationFrame(() => {
    const activeLink = document.querySelector('nav ul li a.nav-active');
    if (activeLink) moveIndicatorTo(activeLink.getAttribute('href').slice(1));
  });
}, { passive: true });
updateActiveLink();

// Accessible accordion: toggles panels, closes others, sets aria attributes
document.querySelectorAll('.panel-item').forEach(item => {
  const btn = item.querySelector('.q');
  const panel = item.querySelector('.panel');

  // helper to set open/close with smooth max-height
  function openPanel() {
    // close other open panels (optional)
    document.querySelectorAll('.panel.open').forEach(p=>{
      if(p !== panel) {
        p.classList.remove('open');
        p.style.maxHeight = null;
        p.previousElementSibling?.setAttribute('aria-expanded','false');
        p.setAttribute('aria-hidden','true');
      }
    });

    panel.classList.add('open');
    panel.style.maxHeight = panel.scrollHeight + 30 + "px"; // give some buffer
    btn.setAttribute('aria-expanded','true');
    panel.setAttribute('aria-hidden','false');
  }
  function closePanel() {
    panel.classList.remove('open');
    panel.style.maxHeight = null;
    btn.setAttribute('aria-expanded','false');
    panel.setAttribute('aria-hidden','true');
  }

  btn.addEventListener('click', ()=> {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if(expanded) closePanel(); else openPanel();
  });

  // keyboard: support Enter & Space (buttons already handle that),
  // ensure focus styles are visible (browser default is okay)
});
