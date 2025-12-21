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
