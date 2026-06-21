// <photo-deck> — retro swipeable flashcard stack.
//
// Renders a list of photos one at a time as a card you swipe (or drag with a
// mouse) to reveal the next. Built to match the Father's-Day arcade UI:
// pixel borders, drop-shadow offsets, 'Press Start 2P' / 'VT323' fonts.
//
// Attributes:
//   photos   JSON array of image URLs, e.g. photos='["a.png","b.png"]'.
//            (Falls back to a |-separated list if it isn't valid JSON.)
//
// Self-contained: no dependencies, no persistence. Drop it in via a <script>
// and place <photo-deck photos='[...]'></photo-deck> anywhere.
(() => {
  const INK = '#1d1712';      // dark outline
  const GOLD = '#f2c43d';     // accent yellow
  const RED = '#d6322e';      // accent red
  const CREAM = '#f5efe2';    // text
  const PANEL = '#15110d';    // card backing

  const css = `
    :host{display:block;width:100%;font-family:'VT323',monospace;user-select:none;-webkit-user-select:none}
    .stage{position:relative;width:100%;aspect-ratio:1/1.12;touch-action:pan-y}
    .card{position:absolute;inset:0;border:4px solid ${INK};background:${PANEL};
      box-shadow:6px 6px 0 rgba(0,0,0,.45);overflow:hidden;will-change:transform,opacity;
      touch-action:pan-y;cursor:grab}
    .card.top{cursor:grab}
    .card.dragging{cursor:grabbing}
    .card .photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
      image-rendering:auto;display:block;-webkit-user-drag:none;pointer-events:none}
    .card .inner{position:absolute;inset:4px;border:2px solid rgba(242,196,61,.55);pointer-events:none;z-index:2}
    .card .badge{position:absolute;top:7px;left:8px;z-index:3;font-family:'Press Start 2P';
      font-size:7px;color:${GOLD};text-shadow:1.5px 1.5px 0 #000;letter-spacing:1px}
    .card .heart{position:absolute;top:7px;right:9px;z-index:3;font-size:15px;color:${RED};
      text-shadow:1px 1px 0 #000;line-height:1}
    .card .cap{position:absolute;left:0;right:0;bottom:0;z-index:3;padding:6px 9px 7px;
      background:linear-gradient(transparent,rgba(8,6,4,.82) 38%);color:${CREAM};
      font-size:17px;line-height:1.05;letter-spacing:.5px;text-align:center}
    /* swipe direction tint */
    .card .stamp{position:absolute;top:50%;left:50%;z-index:3;transform:translate(-50%,-50%) rotate(-12deg);
      font-family:'Press Start 2P';font-size:13px;padding:6px 8px;border:3px solid;opacity:0;
      transition:opacity .08s;letter-spacing:1px;text-shadow:1px 1px 0 #000}
    .card .stamp.next{color:${GOLD};border-color:${GOLD}}
    .card .stamp.prev{color:${RED};border-color:${RED}}

    .bar{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px}
    .arrow{font-family:'Press Start 2P';font-size:9px;color:${INK};background:${GOLD};
      border:3px solid ${INK};box-shadow:3px 3px 0 ${INK};padding:9px 11px;cursor:pointer;
      letter-spacing:1px;line-height:1}
    .arrow:active{transform:translate(2px,2px);box-shadow:1px 1px 0 ${INK}}
    .arrow[disabled]{opacity:.35;pointer-events:none}
    .count{font-family:'Press Start 2P';font-size:8px;color:${GOLD};text-shadow:1px 1px 0 #000;
      letter-spacing:1px;min-width:54px;text-align:center}
    .hint{margin-top:9px;text-align:center;font-family:'Press Start 2P';font-size:6px;
      color:${CREAM};opacity:.7;letter-spacing:1px;transition:opacity .4s}
    .hint.gone{opacity:0}
    .dots{display:flex;gap:5px;justify-content:center;margin-top:11px}
    .dot{width:6px;height:6px;background:rgba(245,239,226,.28);border:1px solid #000}
    .dot.on{background:${GOLD}}
  `;

  class PhotoDeck extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.index = 0;
      this.photos = [];
      this._interacted = false;
      this._anim = false;
    }

    static get observedAttributes() { return ['photos']; }

    connectedCallback() { this._parse(); this._build(); }

    attributeChangedCallback() {
      if (this.shadowRoot && this.shadowRoot.childElementCount) { this._parse(); this._render(); }
    }

    _parse() {
      const raw = this.getAttribute('photos') || '[]';
      let list;
      try { list = JSON.parse(raw); } catch (e) { list = raw.split('|'); }
      this.photos = (Array.isArray(list) ? list : []).map(s => String(s).trim()).filter(Boolean);
      if (this.index >= this.photos.length) this.index = 0;
    }

    _build() {
      this.shadowRoot.innerHTML =
        '<style>' + css + '</style>' +
        '<div class="stage"></div>' +
        '<div class="dots"></div>' +
        '<div class="bar">' +
        '  <button class="arrow" data-d="-1" aria-label="Previous photo">◀</button>' +
        '  <span class="count"></span>' +
        '  <button class="arrow" data-d="1" aria-label="Next photo">▶</button>' +
        '</div>' +
        '<div class="hint">SWIPE TO REVEAL ◀ ▶</div>';
      this._stage = this.shadowRoot.querySelector('.stage');
      this._dots = this.shadowRoot.querySelector('.dots');
      this._count = this.shadowRoot.querySelector('.count');
      this._hint = this.shadowRoot.querySelector('.hint');
      this.shadowRoot.querySelectorAll('.arrow').forEach(b =>
        b.addEventListener('click', () => this.go(parseInt(b.dataset.d, 10))));
      this._render();
    }

    _pad(n) { return String(n + 1).padStart(2, '0'); }

    // Build a single card element for a given photo index.
    _card(i, isTop) {
      const card = document.createElement('div');
      card.className = 'card' + (isTop ? ' top' : '');
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = this.photos[i];
      img.alt = 'Photo ' + (i + 1);
      card.appendChild(img);
      const inner = document.createElement('div'); inner.className = 'inner'; card.appendChild(inner);
      const badge = document.createElement('div'); badge.className = 'badge';
      badge.textContent = this._pad(i); card.appendChild(badge);
      const heart = document.createElement('div'); heart.className = 'heart';
      heart.textContent = '♥'; card.appendChild(heart);
      const cap = document.createElement('div'); cap.className = 'cap';
      cap.textContent = 'baba & ding · ' + this._pad(i) + ' / ' + this._pad(this.photos.length - 1);
      card.appendChild(cap);
      const stamp = document.createElement('div'); stamp.className = 'stamp'; card.appendChild(stamp);
      card._stamp = stamp;
      return card;
    }

    _render(entering) {
      const n = this.photos.length;
      this._stage.innerHTML = '';
      if (!n) { this._stage.textContent = ''; this._count.textContent = ''; return; }

      // Peek card behind (next photo) for depth — only if more than one.
      if (n > 1) {
        const peek = this._card((this.index + 1) % n, false);
        peek.style.transform = 'translateY(10px) scale(.93)';
        peek.style.opacity = '.85';
        peek.style.filter = 'brightness(.7)';
        peek.style.pointerEvents = 'none';
        this._stage.appendChild(peek);
      }

      const top = this._card(this.index, true);
      this._stage.appendChild(top);
      this._top = top;
      if (n > 1) this._bindDrag(top);

      // Entry animation: the new top rises from the peek pose into place.
      if (entering) {
        top.style.transition = 'none';
        top.style.transform = 'translateY(10px) scale(.93)';
        top.style.opacity = '.85';
        // next frame -> animate to resting state
        requestAnimationFrame(() => requestAnimationFrame(() => {
          top.style.transition = 'transform .26s cubic-bezier(.2,.8,.3,1), opacity .26s';
          top.style.transform = '';
          top.style.opacity = '';
        }));
      }

      // counter + dots
      this._count.textContent = this._pad(this.index) + ' / ' + this._pad(n - 1);
      this._dots.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'dot' + (i === this.index ? ' on' : '');
        this._dots.appendChild(d);
      }
    }

    _dismissHint() {
      if (this._interacted) return;
      this._interacted = true;
      this._hint.classList.add('gone');
    }

    // Programmatic next/prev (arrow buttons / keyboard) with a fling animation.
    go(dir) {
      if (this._anim || this.photos.length < 2) return;
      this._dismissHint();
      this._fling(dir);
    }

    _advance(dir) {
      const n = this.photos.length;
      this.index = (this.index + dir + n) % n;
      this._render(true);
    }

    // Animate the top card off-screen in `dir`, then advance the index.
    _fling(dir) {
      this._anim = true;
      const card = this._top;
      const w = this._stage.offsetWidth || 300;
      const flyDir = -dir; // next(+1) exits left, prev(-1) exits right
      const tx = flyDir > 0 ? w * 1.4 : -w * 1.4;
      const rot = flyDir > 0 ? 18 : -18;
      card.style.transition = 'transform .28s ease-in, opacity .28s ease-in';
      card.style.transform = 'translateX(' + tx + 'px) rotate(' + rot + 'deg)';
      card.style.opacity = '0';
      const done = () => {
        card.removeEventListener('transitionend', done);
        this._anim = false;
        this._advance(dir);
      };
      card.addEventListener('transitionend', done);
      setTimeout(() => { if (this._anim) done(); }, 360); // safety net
    }

    _bindDrag(card) {
      let sx = 0, sy = 0, dx = 0, dy = 0, active = false, decided = false, captured = false;
      const w = () => this._stage.offsetWidth || 300;

      const move = (e) => {
        if (!active) return;
        dx = e.clientX - sx;
        dy = e.clientY - sy;
        if (!decided) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          // Vertical intent -> let the page scroll, abandon the swipe.
          if (Math.abs(dy) > Math.abs(dx)) { active = false; return; }
          decided = true;
          captured = true;
          try { card.setPointerCapture(e.pointerId); } catch (err) {}
          card.classList.add('dragging');
          card.style.transition = 'none';
          this._dismissHint();
        }
        const rot = dx / 18;
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + rot + 'deg)';
        const stamp = card._stamp;
        if (dx > 12) { stamp.className = 'stamp prev'; stamp.textContent = 'BACK'; stamp.style.opacity = Math.min(1, dx / 90); }
        else if (dx < -12) { stamp.className = 'stamp next'; stamp.textContent = 'NEXT'; stamp.style.opacity = Math.min(1, -dx / 90); }
        else { stamp.style.opacity = 0; }
      };

      const up = () => {
        if (!active && !decided) { cleanup(); return; }
        const threshold = Math.max(60, w() * 0.32);
        card.classList.remove('dragging');
        if (decided && Math.abs(dx) > threshold) {
          // drag left -> next, drag right -> back
          cleanup();
          this._fling(dx > 0 ? -1 : 1);
          return;
        }
        // spring back
        card.style.transition = 'transform .24s cubic-bezier(.2,.9,.3,1)';
        card.style.transform = '';
        if (card._stamp) card._stamp.style.opacity = 0;
        cleanup();
      };

      const cleanup = () => {
        active = false; decided = false;
        if (captured) { try { card.releasePointerCapture(this._pid); } catch (e) {} captured = false; }
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };

      card.addEventListener('pointerdown', (e) => {
        if (this._anim || e.button !== 0) return;
        active = true; decided = false; dx = 0; dy = 0;
        sx = e.clientX; sy = e.clientY; this._pid = e.pointerId;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }
  }

  if (!customElements.get('photo-deck')) customElements.define('photo-deck', PhotoDeck);
})();
