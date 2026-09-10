(() => {
    'use strict';

    const CASES = [
      { id: 'recoil',     name: 'Recoil Case',            cost: 10,    bonus: 1,
        image: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApdO4YmlhxYQknCRvCo04DEVlxkKgpot221FAR17PLfYQJD_9W7m5S0mvLwOq7c2GoI68Fw2bGVpN6t3FTk-hc4YW3wdY6LcoKBqVXsw-_s0Ma8u5iu1J-dkHpnF4U/360fx360f' },
      { id: 'revolution', name: 'Revolution Case',        cost: 50,    bonus: 5,
        image: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApdO4YmlhxYQknCRvCo04DEVlxkKgpot221FAR17PLfYQJD_9W7m5S0mvLwOq7cqWdQ-sJ0xOqTp9Ws2Afk8hY5Zm6mJoSLMlRoNAvR_VS9xL_nh8S8uMifziBmvygh4n7D30VgKqY/360fx360f' },
      { id: 'dreams',     name: 'Dreams & Nightmares',    cost: 200,   bonus: 20,
        image: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApdO4YmlhxYQknCRvCo04DEVlxkKgpot221FAR17PLfYQJD_9W7m5S0mvLwOq7c2GoI6sEsj3r0po9323gLt-RI4ZjzydIeVegFqNVuD-AK9wea606_u6JpbMXep/360fx360f' },
      { id: 'kilowatt',   name: 'Kilowatt Case',          cost: 750,   bonus: 75,
        image: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApdO4YmlhxYQknCRvCo04DEVlxkKgpot221FAR17PLfYQJD_9W7m5S0mvLwOq7c2DwA65Yt2-2Xp9732VS3phI5NTrwdY-VdlRqZRuD-gC_wO3n15K_up_AuHJr/360fx360f' },
      { id: 'fracture',   name: 'Fracture Case',          cost: 2500,  bonus: 250,
        image: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApdO4YmlhxYQknCRvCo04DEVlxkKgpot221FAR17PLfYQJD_9W7m5S0mvLwOq7c2GoI6sEsj3r0po9323lW_8hc4YW37d9ecIVoYA6D-FC9xO_q0JO7uszJnCc97XCg7fiMoX-IUYE/360fx360f' },
      { id: 'riptide',    name: 'Operation Riptide Case', cost: 10000, bonus: 1000,
        image: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApdO4YmlhxYQknCRvCo04DEVlxkKgpot221FAR17PLfYQJD_9W7m5S0mvLwOq7c2GoI6sEsj3r0po9323lW_8hc4YW3yIdbcJQ46MV_Y-AC6w-q-m5e86s2lQV8/360fx360f' }
    ];

    const SAVE_KEY = 'csclicker_save_v1';
    const DEFAULT_STATE = { euros: 0, epc: 1, totalCases: 0, totalClicks: 0, inventory: {} };
    let state = loadState();

    // Anti-autoclicker
    let clickTimes = [];
    let lastClick = 0;
    let cooldown = 80;          // randomized after each click
    let frozen = false;
    let frozenUntil = 0;
    let warnInterval = null;
    let hitbox = { x: 0, y: 0 };

    const $ = id => document.getElementById(id);
    const caseBtn = $('case-btn'), caseImg = $('case-img');
    const botWarning = $('bot-warning'), warnTimer = $('warn-timer');

    buildShop();
    updateCaseImage();
    randomiseHitbox();
    render();

    caseBtn.addEventListener('click', e => {
      const now = Date.now();

      if (frozen) {
        if (now < frozenUntil) return;
        unfreeze();
      }

      // randomized cooldown between valid clicks
      if (now - lastClick < cooldown) return;

      // rate check: >10 clicks in any rolling second = bot
      clickTimes.push(now);
      clickTimes = clickTimes.filter(t => now - t <= 1000);
      if (clickTimes.length > 10) { freeze(5); return; }

      // hitbox check: click must land near the (slightly offset) case center
      const r = caseBtn.getBoundingClientRect();
      const cx = r.left + r.width / 2 + hitbox.x;
      const cy = r.top + r.height / 2 + hitbox.y;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      if (dx * dx + dy * dy > 95 * 95) { randomiseHitbox(); return; }

      lastClick = now;
      cooldown = 70 + Math.random() * 50;   // 70–120 ms
      state.euros += state.epc;
      state.totalClicks++;

      spawnPop(e.clientX, e.clientY, state.epc);
      caseBtn.classList.remove('clicked');
      void caseBtn.offsetWidth;
      caseBtn.classList.add('clicked');
      randomiseHitbox();

      save();
      render();
    });

    function freeze(seconds) {
      frozen = true;
      frozenUntil = Date.now() + seconds * 1000;
      clickTimes = [];
      botWarning.classList.add('active');
      let left = seconds;
      warnTimer.textContent = left;
      clearInterval(warnInterval);
      warnInterval = setInterval(() => {
        left--;
        warnTimer.textContent = Math.max(left, 0);
        if (left <= 0) { clearInterval(warnInterval); unfreeze(); }
      }, 1000);
    }
    function unfreeze() {
      frozen = false;
      botWarning.classList.remove('active');
      clearInterval(warnInterval);
    }

    function randomiseHitbox() {
      hitbox.x = (Math.random() - 0.5) * 44;
      hitbox.y = (Math.random() - 0.5) * 44;
      caseImg.style.transform = `translate(${hitbox.x}px, ${hitbox.y}px)`;
    }

    function spawnPop(x, y, amount) {
      const el = document.createElement('div');
      el.className = 'euro-pop';
      el.textContent = '+€' + fmt(amount);
      el.style.left = (x - 22) + 'px';
      el.style.top = (y - 12) + 'px';
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }

    function buildShop() {
      const list = $('shop-list');
      list.innerHTML = '';
      CASES.forEach(c => {
        const el = document.createElement('div');
        el.className = 'shop-item';
        el.id = 'shop-' + c.id;
        el.innerHTML = `
          <img src="${c.image}" alt="${c.name}" loading="lazy">
          <div>
            <div class="shop-name">${c.name}</div>
            <div class="shop-details">+€${fmt(c.bonus)} per click</div>
            <div class="shop-cost" id="cost-${c.id}">€ ${fmt(c.cost)}</div>
          </div>
          <button class="buy-btn" id="buy-${c.id}">Buy</button>`;
        el.querySelector('button').addEventListener('click', () => buy(c.id));
        list.appendChild(el);
      });
    }

    function buy(id) {
      const c = CASES.find(x => x.id === id);
      if (!c || state.euros < c.cost) return;
      state.euros -= c.cost;
      state.epc += c.bonus;
      state.totalCases++;
      state.inventory[id] = (state.inventory[id] || 0) + 1;
      updateCaseImage();
      save();
      render();
    }

    // clicker shows your best owned case (or the starter Recoil)
    function updateCaseImage() {
      let best = CASES[0];
      for (const c of CASES) if ((state.inventory[c.id] || 0) > 0) best = c;
      caseImg.src = best.image;
    }

    function render() {
      $('stat-euros').textContent = '€ ' + fmt(Math.floor(state.euros));
      $('stat-epc').textContent = '€ ' + fmt(state.epc);
      $('stat-cases').textContent = fmt(state.totalCases);
      $('stat-clicks').textContent = fmt(state.totalClicks);

      // inventory
      const inv = $('inventory-grid');
      const owned = CASES.filter(c => (state.inventory[c.id] || 0) > 0);
      if (!owned.length) {
        inv.innerHTML = '<span class="inv-empty">No cases yet — buy your first one from the shop!</span>';
      } else {
        inv.innerHTML = owned.map(c => `
          <div class="inv-item">
            <img src="${c.image}" alt="${c.name}">
            <div class="inv-name">${c.name}</div>
            <div class="inv-count">×${state.inventory[c.id]}</div>
          </div>`).join('');
      }

      // shop affordability
      CASES.forEach(c => {
        const ok = state.euros >= c.cost;
        $('shop-' + c.id).classList.toggle('affordable', ok);
        $('cost-' + c.id).classList.toggle('can-afford', ok);
        const btn = $('buy-' + c.id);
        btn.classList.toggle('can-afford', ok);
        btn.disabled = !ok;
      });
    }

    $('reset-btn').addEventListener('click', () => {
      if (!confirm('Reset all progress? This cannot be undone.')) return;
      state = { ...DEFAULT_STATE, inventory: {} };
      localStorage.removeItem(SAVE_KEY);
      updateCaseImage();
      render();
    });

    function save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
    }
    function loadState() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          return { ...DEFAULT_STATE, ...s, inventory: s.inventory || {} };
        }
      } catch (_) {}
      return { ...DEFAULT_STATE, inventory: {} };
    }

    function fmt(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
      return n.toLocaleString('en-US');
    }
  })();
