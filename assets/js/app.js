/* Интерфейс демонстрационной модели «Колос». */
(function () {
  'use strict';

  const KB = window.AGRO_KB;
  const agent = new window.SalesAgent(KB);
  const { money, num, esc } = window.AGENT_HELPERS;
  const TERMS = KB.terms;

  const $ = (sel) => document.querySelector(sel);
  const els = {
    workspace: $('#workspace'),
    messages: $('#messages'),
    chatScroll: $('#chat-scroll'),
    suggestions: $('#suggestions'),
    composer: $('#composer'),
    input: $('#input'),
    send: $('.send-btn'),
    reset: $('#reset-btn'),
    tabs: document.querySelectorAll('.tab'),
    leadsCount: $('#leads-count'),
    dealStage: $('#deal-stage'),
    dealProduct: $('#deal-product'),
    dealProductSub: $('#deal-product-sub'),
    dealVolume: $('#deal-volume'),
    dealZone: $('#deal-zone'),
    dealPayment: $('#deal-payment'),
    dealDiscount: $('#deal-discount'),
    dealTotal: $('#deal-total'),
    dealTotalLabel: $('#deal-total-label'),
    dealTotalSub: $('#deal-total-sub'),
    scoreRing: $('#score-ring'),
    scoreVal: $('#score-val'),
    scoreLabel: $('#score-label'),
    dealCta: $('#deal-cta'),
    steps: $('#deal-steps'),
    leadsBody: $('#leads-body'),
    exportCsv: $('#export-csv'),
    kbSearch: $('#kb-search'),
    kbCats: $('#kb-cats'),
    kbBody: $('#kb-body'),
    faqList: $('#faq-list'),
    termsGrid: $('#terms-grid'),
    offerModal: $('#offer-modal'),
    offerDoc: $('#offer-doc'),
    offerPrint: $('#offer-print'),
    offerDownload: $('#offer-download'),
    chatDay: $('#chat-day'),
  };

  const state = {
    busy: false,
    chain: Promise.resolve(),
    typing: null,
    offers: {},
    currentOffer: null,
    kbCategory: 'all',
    kbQuery: '',
    initial: true,
    generation: 0,
  };

  const STORAGE_KEY = 'sk_leads_v1';
  const STATUS_LABELS = {
    new: 'Новый',
    inwork: 'В работе',
    offer: 'КП отправлено',
    deal: 'Сделка',
    lost: 'Закрыт',
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pct = (n) => String(n).replace('.', ',');

  function categoryLabel(id) {
    const c = KB.categories.find((x) => x.id === id);
    return c ? c.label : '';
  }

  function productById(id) {
    return KB.products.find((p) => p.id === id);
  }

  function scrollBottom() {
    els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  }

  function updateComposer() {
    els.input.disabled = state.busy;
    els.send.disabled = state.busy;
  }

  /* ---------- Отрисовка сообщений ---------- */

  function productCardHTML(p) {
    const specs = p.specs.slice(0, 3).map((s) => `${s.label} ${s.value}`).join(' · ');
    return `
      <article class="p-card">
        <div class="p-top">
          <span class="p-cat">${esc(categoryLabel(p.category))}</span>
          ${p.badge ? `<span class="p-badge">${esc(p.badge)}</span>` : ''}
        </div>
        <h4>${esc(p.name)}</h4>
        <div class="p-price">${num(p.price)} ₽ <span>/т</span></div>
        <div class="p-meta"><span>В наличии ${num(p.stock)} т</span><span>от ${num(p.minLot)} т</span></div>
        <div class="p-specs">${esc(specs)}</div>
        <button class="p-ask" type="button" data-prompt="Рассчитать 100 т: ${esc(p.name)}">Рассчитать 100 т →</button>
      </article>`;
  }

  function quoteHTML(q) {
    const validUntil = new Date(Date.now() + q.validityDays * 86400000);
    const validLabel = validUntil.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
    const discountParts = [];
    if (q.tierPct) discountParts.push(`${pct(q.tierPct)}% за объём${q.tierLabel ? ` ${q.tierLabel}` : ''}`);
    if (q.prepayPct) discountParts.push('2% за предоплату');
    const deliveryLabel = q.pickup
      ? 'Самовывоз · элеватор «Зерноград»'
      : q.deliveryPending
        ? 'регион не указан'
        : `${q.zoneName} · ${num(q.deliveryRate)} ₽/т${q.deliveryEstimate ? ' (ориентир)' : ''}`;
    const deliveryValue = q.deliveryPending ? 'по расчёту' : q.delivery ? money(q.delivery) : '0 ₽';
    const totalLabel = q.deliveryPending ? 'Итого без доставки' : 'Итого с НДС 10%';
    const deliveryFoot = q.pickup ? 'самовывоз' : q.deliveryPending ? 'доставка по расчёту' : 'доставка включена';
    const warns = [];
    if (q.stockShort) warns.push(`В наличии ${num(q.stock)} т. На остаток согласуем отдельный график поставки.`);
    if (q.volume < q.minLot) warns.push(`Минимальная партия — ${num(q.minLot)} т. Возможна сборная партия по согласованию.`);
    if (q.deliveryPending) warns.push('Укажите регион доставки — добавлю логистику в расчёт.');
    const warn = warns.join(' ');

    return `
      <div class="quote-card">
        <div class="quote-head">
          <div>
            <span>Расчёт партии</span>
            <b>${esc(q.productName)} · ${num(q.volume)} т</b>
          </div>
          <span class="quote-valid">действует до ${esc(validLabel)}</span>
        </div>
        <div class="q-lines">
          <div class="q-line"><span>Цена за тонну</span><b>${money(q.price)}</b></div>
          <div class="q-line"><span>Стоимость партии</span><b>${money(q.goods)}</b></div>
          ${discountParts.length ? `<div class="q-line discount"><span>Скидка · ${esc(discountParts.join(' + '))}</span><b>−${money(q.discountSum)}</b></div>` : ''}
          <div class="q-line"><span>Доставка<span class="q-note">${esc(deliveryLabel)}</span></span><b>${deliveryValue}</b></div>
        </div>
        <div class="q-total">
          <span>${totalLabel}</span>
          <b>${money(q.total)}</b>
          <small>${money(q.perTon)} за тонну · отгрузка 1–3 дня после оплаты</small>
        </div>
        ${warn ? `<div class="q-warn">${esc(warn)}</div>` : ''}
        <div class="q-foot"><span>Цена зафиксирована на ${q.validityDays} дней</span><span>${deliveryFoot}</span></div>
      </div>`;
  }

  function priceTableHTML(ids, mode) {
    const rows = ids
      .map((id) => productById(id))
      .filter(Boolean)
      .map(
        (p) => `
        <tr>
          <td class="pt-name">${esc(p.name)}</td>
          <td>${mode === 'stock' ? `${num(p.stock)} т` : `${num(p.price)} ₽/т`}</td>
          <td><button type="button" data-prompt="Цена: ${esc(p.name)}">Спросить</button></td>
        </tr>`
      )
      .join('');
    return `
      <table class="price-table">
        <thead><tr><th>Позиция</th><th>${mode === 'stock' ? 'Остаток' : 'Цена'}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function paymentHTML(m) {
    const q = m.quote;
    const options = m.options
      .map((o) => {
        const amount = q ? q.goods * (1 - (q.tierPct + o.discountPct) / 100) + (q.delivery || 0) : null;
        const highlight = o.id === 'prepay';
        return `
          <div class="pay-opt ${highlight ? 'is-highlight' : ''}">
            <b>${esc(o.label)}${o.discountPct ? `<span class="pay-tag">−${pct(o.discountPct)}%</span>` : ''}</b>
            ${amount ? `<span class="pay-amount">${money(amount)}</span>` : ''}
            <span>${esc(o.note)}</span>
          </div>`;
      })
      .join('');
    return `<div class="pay-card">${options}${q ? `<div class="q-foot" style="padding:2px 0 0"><span>${q.deliveryPending ? 'Суммы указаны без доставки, НДС 10% включён' : 'Суммы указаны с доставкой и НДС 10%'}</span></div>` : ''}</div>`;
  }

  function deliveryHTML(m) {
    const rows = m.zones
      .map(
        (z) => `
        <tr>
          <td>${esc(z.name)}</td>
          <td class="day">${esc(z.days)}</td>
          <td>${num(z.rate)} ₽/т</td>
        </tr>`
      )
      .join('');
    return `
      <table class="delivery-table">
        <thead><tr><th>Регион</th><th class="day">Срок</th><th>Тариф</th></tr></thead>
        <tbody>
          ${rows}
          <tr><td>Самовывоз, элеватор «Зерноград»</td><td class="day">в день оплаты</td><td>0 ₽</td></tr>
        </tbody>
      </table>`;
  }

  function formHTML(m) {
    const pre = m.prefill || {};
    const context = [
      pre.product,
      pre.volume ? `${num(pre.volume)} т` : '',
      pre.zone,
      pre.amount ? money(pre.amount) : '',
    ].filter(Boolean);
    return `
      <form class="lead-form" data-lead-form novalidate>
        ${context.length ? `<div class="form-context">${context.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
        <div class="form-grid">
          <label>Имя *<input name="name" required minlength="2" placeholder="Как к вам обращаться"></label>
          <label>Компания<input name="company" placeholder="ООО «...»"></label>
          <label>Телефон *<input name="phone" type="tel" required placeholder="+7 (___) ___-__-__"></label>
          <label>Email<input name="email" type="email" placeholder="name@company.ru"></label>
        </div>
        <label class="wide">Комментарий<textarea name="comment" rows="2" placeholder="Удобное время звонка, пожелания по партии"></textarea></label>
        <div class="form-error" hidden></div>
        <div class="form-foot">
          <small>Демо-форма: данные сохраняются только в вашем браузере.</small>
          <button class="btn primary" type="submit">Отправить заявку</button>
        </div>
      </form>`;
  }

  function summaryHTML(lead) {
    const scoreClass = lead.score >= 75 ? 'hot' : lead.score >= 55 ? 'warm' : 'cold';
    return `
      <div class="summary-card">
        <div class="summary-top">
          <b>Заявка ${esc(lead.id)}</b>
          <span class="score-badge ${scoreClass}">${lead.score} / 100</span>
        </div>
        <div class="summary-grid">
          <div><span>Клиент</span><b>${esc(lead.name)}${lead.company ? ` · ${esc(lead.company)}` : ''}</b></div>
          <div><span>Телефон</span><b>${esc(lead.phone)}</b></div>
          <div><span>Продукт</span><b>${esc(lead.product)}${lead.volume ? ` · ${num(lead.volume)} т` : ''}</b></div>
          <div><span>Регион</span><b>${esc(lead.zone)}</b></div>
          <div><span>Оплата</span><b>${esc(lead.payment)}</b></div>
          <div><span>Срок</span><b>${esc(lead.when)}</b></div>
        </div>
        <div class="summary-total"><span>Расчёт агента</span><b>${lead.amount ? money(lead.amount) : 'уточняется'}</b></div>
      </div>`;
  }

  function offerHTML(m) {
    state.offers[m.number] = {
      quote: m.quote,
      number: m.number,
      company: m.company,
      terms: m.terms,
      contact: agent.state.contact,
    };
    return `
      <div class="offer-card">
        <div class="offer-ico">КП</div>
        <div class="offer-text">
          <b>Коммерческое предложение ${esc(m.number)}</b>
          <span>${esc(m.quote.productName)} · ${num(m.quote.volume)} т · ${money(m.quote.total)}</span>
        </div>
        <button type="button" data-action="open-offer" data-number="${esc(m.number)}">Открыть КП</button>
      </div>`;
  }

  function renderMessage(m) {
    const el = document.createElement('div');

    if (m.type === 'text') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body"><div class="bubble">${m.html}</div></div>`;
    } else if (m.type === 'product') {
      const p = productById(m.productId);
      if (!p) return null;
      el.className = 'msg agent';
      el.innerHTML = `
        <div class="msg-avatar">К</div>
        <div class="msg-body">
          ${m.intro ? `<div class="bubble msg-intro">${m.intro}</div>` : ''}
          ${productCardHTML(p)}
        </div>`;
    } else if (m.type === 'products') {
      const cards = m.ids.map((id) => productById(id)).filter(Boolean).map(productCardHTML).join('');
      el.className = 'msg agent';
      el.innerHTML = `
        <div class="msg-avatar">К</div>
        <div class="msg-body">
          ${m.intro ? `<div class="bubble msg-intro">${m.intro}</div>` : ''}
          <div class="p-grid">${cards}</div>
        </div>`;
    } else if (m.type === 'pricelist' || m.type === 'stock') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${priceTableHTML(m.ids, m.type === 'stock' ? 'stock' : 'price')}</div>`;
    } else if (m.type === 'quote') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${quoteHTML(m.quote)}</div>`;
    } else if (m.type === 'payment') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${paymentHTML(m)}</div>`;
    } else if (m.type === 'delivery') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${deliveryHTML(m)}</div>`;
    } else if (m.type === 'form') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${formHTML(m)}</div>`;
    } else if (m.type === 'summary') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${summaryHTML(m.lead)}</div>`;
    } else if (m.type === 'offer') {
      el.className = 'msg agent';
      el.innerHTML = `<div class="msg-avatar">К</div><div class="msg-body">${offerHTML(m)}</div>`;
    } else {
      return null;
    }

    els.messages.appendChild(el);
    return el;
  }

  function showTyping() {
    if (state.typing) return;
    const el = document.createElement('div');
    el.className = 'typing';
    el.innerHTML = '<div class="msg-avatar">К</div><div class="bubble"><i></i><i></i><i></i></div>';
    els.messages.appendChild(el);
    state.typing = el;
    scrollBottom();
  }

  function hideTyping() {
    if (!state.typing) return;
    state.typing.remove();
    state.typing = null;
  }

  function renderSuggestions(list) {
    els.suggestions.innerHTML = '';
    if (!list || !list.length) return;
    list.forEach((text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.prompt = text;
      b.textContent = text;
      els.suggestions.appendChild(b);
    });
  }

  function typingDelay(m) {
    if (m.type === 'text') {
      const len = (m.html || '').replace(/<[^>]+>/g, '').length;
      return 350 + Math.min(650, len * 4);
    }
    return 480;
  }

  async function processMessages(messages, suggestions, generation) {
    for (const m of messages) {
      if (generation !== state.generation) return;
      showTyping();
      await wait(typingDelay(m));
      if (generation !== state.generation) return;
      hideTyping();
      renderMessage(m);
      scrollBottom();
      await wait(60);
    }
    if (generation !== state.generation) return;
    if (suggestions !== undefined) renderSuggestions(suggestions);
    updateDeal();
    updateTabCount();
    if (state.initial) {
      state.initial = false;
      els.chatScroll.scrollTop = 0;
    }
  }

  function feed(messages, suggestions) {
    if (!messages || !messages.length) return;
    const generation = state.generation;
    state.busy = true;
    updateComposer();
    state.chain = state.chain
      .then(() => processMessages(messages, suggestions, generation))
      .catch((err) => console.error(err))
      .finally(() => {
        if (generation !== state.generation) return;
        state.busy = false;
        updateComposer();
      });
  }

  function appendUser(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="msg-avatar">Вы</div><div class="msg-body"><div class="bubble">${esc(text).replace(/\n/g, '<br>')}</div></div>`;
    els.messages.appendChild(el);
    scrollBottom();
  }

  function send(text) {
    const value = String(text || '').trim();
    if (!value || state.busy) return;
    state.initial = false;
    appendUser(value);
    const res = agent.handle(value);
    els.input.value = '';
    autoGrow();
    feed(res.messages, res.suggestions);
  }

  /* ---------- Карточка сделки ---------- */

  function setText(el, value, empty) {
    el.textContent = value;
    el.classList.toggle('is-empty', !!empty);
  }

  function updateDeal() {
    const s = agent.snapshot();
    const q = s.quote;

    setText(els.dealProduct, s.product || 'Пока не выбран', !s.product);
    els.dealProductSub.textContent = s.product
      ? q
        ? `Расчёт на ${num(q.volume)} т · ${money(q.price)}/т`
        : 'Укажите объём, чтобы получить расчёт'
      : 'Начните с культуры и объёма';

    setText(els.dealVolume, s.volume ? `${num(s.volume)} т` : '—', !s.volume);
    setText(els.dealZone, s.zone || '—', !s.zone);
    setText(els.dealPayment, s.payment || '—', !s.payment);
    setText(els.dealDiscount, q && q.discountPct ? `${pct(q.discountPct)}%` : '—', !q || !q.discountPct);

    if (q) {
      els.dealTotal.textContent = money(q.total);
      els.dealTotalLabel.textContent = q.deliveryPending ? 'Сумма без доставки' : 'Сумма с доставкой';
      els.dealTotalSub.textContent = `${money(q.perTon)}/т · ${q.deliveryPending ? 'доставка по расчёту' : 'НДС 10% включён'}`;
    } else {
      els.dealTotal.textContent = '—';
      els.dealTotalLabel.textContent = 'Сумма с доставкой';
      els.dealTotalSub.textContent = 'Появится после расчёта партии';
    }

    const stage = s.contact ? 'lead' : q ? 'quote' : s.product ? 'interest' : 'new';
    els.dealStage.textContent = stage === 'lead' ? 'Заявка' : stage === 'quote' ? 'Расчёт' : stage === 'interest' ? 'Интерес' : 'Новый';
    els.dealStage.className = `stage-pill ${stage === 'lead' ? 'is-lead' : stage === 'quote' ? 'is-quote' : ''}`;

    const score = s.score;
    els.scoreRing.style.setProperty('--score', score);
    els.scoreVal.textContent = score;
    els.scoreLabel.textContent = score >= 75 ? 'Горячий лид' : score >= 55 ? 'Тёплый лид' : s.product ? 'Есть интерес' : 'Соберите вводные';

    els.steps.querySelectorAll('.step').forEach((step) => {
      const id = step.dataset.step;
      step.classList.remove('is-active', 'is-done');
      if (stage === 'lead') {
        step.classList.add('is-done');
        if (id === 'lead') step.classList.add('is-active');
      } else if (stage === 'quote') {
        if (id === 'interest') step.classList.add('is-done');
        if (id === 'quote') step.classList.add('is-active');
      } else if (stage === 'interest') {
        if (id === 'interest') step.classList.add('is-active');
      }
    });

    if (s.contact) {
      els.dealCta.textContent = 'Заявка создана';
      els.dealCta.disabled = true;
    } else {
      els.dealCta.textContent = 'Оформить заявку';
      els.dealCta.disabled = false;
    }
  }

  /* ---------- Лиды ---------- */

  function seedLeads() {
    const now = Date.now();
    return [
      {
        id: 'SK-482910',
        createdAt: new Date(now - 2 * 86400000).toISOString(),
        name: 'Ирина Соколова',
        company: 'ООО «Донская мельница»',
        phone: '+7 (863) 244-18-90',
        email: 'sokolova@donmill.demo',
        product: 'Пшеница озимая, 3 класс',
        volume: 600,
        zone: 'Краснодарский край',
        payment: '100% предоплата',
        when: 'в ноябре',
        amount: 11256000,
        score: 85,
        status: 'inwork',
        source: 'ИИ-агент «Колос»',
        comment: 'Нужна партия с белком от 12,5%, отгрузка двумя машинами.',
      },
      {
        id: 'SK-482877',
        createdAt: new Date(now - 1 * 86400000).toISOString(),
        name: 'Пётр Мельник',
        company: 'КФХ «Юг-Агро»',
        phone: '+7 (928) 771-05-44',
        email: '',
        product: 'Ячмень фуражный',
        volume: 120,
        zone: 'Ростовская область',
        payment: '50/50',
        when: 'на следующей неделе',
        amount: 1752780,
        score: 70,
        status: 'offer',
        source: 'ИИ-агент «Колос»',
        comment: 'Сравнивает с предложением другого поставщика.',
      },
      {
        id: 'SK-482901',
        createdAt: new Date(now - 3 * 3600000).toISOString(),
        name: 'Алексей Гринёв',
        company: 'ООО «МаслоПром»',
        phone: '+7 (861) 203-77-12',
        email: 'grinev@masloprom.demo',
        product: 'Подсолнечник, маслосемена',
        volume: 250,
        zone: 'Самовывоз',
        payment: 'Отсрочка 14 дней',
        when: 'до конца месяца',
        amount: 8495625,
        score: 78,
        status: 'new',
        source: 'ИИ-агент «Колос»',
        comment: 'Интересует масличность от 48%.',
      },
    ];
  }

  function readLeads() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('Не удалось прочитать лиды', err);
    }
    const seeded = seedLeads();
    writeLeads(seeded);
    return seeded;
  }

  function writeLeads(leads) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    } catch (err) {
      console.warn('Не удалось сохранить лиды', err);
    }
  }

  function addLead(lead) {
    const leads = readLeads();
    leads.unshift(lead);
    writeLeads(leads.slice(0, 60));
  }

  function updateTabCount() {
    const count = readLeads().length;
    els.leadsCount.textContent = count;
  }

  function renderKpis(leads) {
    const sum = leads.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
    const avg = leads.length ? Math.round(leads.reduce((acc, l) => acc + (Number(l.score) || 0), 0) / leads.length) : 0;
    const hot = leads.filter((l) => Number(l.score) >= 75).length;
    $('#kpi-leads').textContent = leads.length;
    $('#kpi-sum').textContent = money(sum);
    $('#kpi-score').textContent = avg;
    $('#kpi-hot').textContent = hot;
  }

  function formatLeadDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function renderLeads() {
    const leads = readLeads().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderKpis(leads);
    updateTabCount();

    if (!leads.length) {
      els.leadsBody.innerHTML = '<tr><td colspan="7" class="leads-empty">Пока нет заявок. Начните диалог и оставьте контакты.</td></tr>';
      return;
    }

    els.leadsBody.innerHTML = leads
      .map((l) => {
        const scoreClass = l.score >= 75 ? 'hot' : l.score >= 55 ? 'warm' : 'cold';
        return `
          <tr>
            <td><span class="lead-id">${esc(l.id)}</span><span class="lead-date">${formatLeadDate(l.createdAt)}</span></td>
            <td class="lead-client"><b>${esc(l.name)}</b><span>${esc(l.company)}</span></td>
            <td class="lead-product"><b>${esc(l.product)}</b><span>${l.volume ? `${num(l.volume)} т · ${esc(l.zone)}` : esc(l.zone)}</span></td>
            <td>${l.volume ? `${num(l.volume)} т` : '—'}</td>
            <td class="lead-amount">${l.amount ? money(l.amount) : '—'}<small>${esc(l.payment)}</small></td>
            <td><span class="score-badge ${scoreClass}">${l.score}</span></td>
            <td>
              <select class="status-select status-${esc(l.status)}" data-lead-id="${esc(l.id)}" aria-label="Статус заявки ${esc(l.id)}">
                ${Object.entries(STATUS_LABELS)
                  .map(([value, label]) => `<option value="${value}" ${l.status === value ? 'selected' : ''}>${label}</option>`)
                  .join('')}
              </select>
            </td>
          </tr>`;
      })
      .join('');
  }

  function exportCsv() {
    const leads = readLeads();
    const header = ['ID', 'Дата', 'Клиент', 'Компания', 'Телефон', 'Email', 'Продукт', 'Объём, т', 'Регион', 'Оплата', 'Сумма, ₽', 'Скоринг', 'Статус', 'Комментарий'];
    const rows = leads.map((l) => [
      l.id,
      new Date(l.createdAt).toLocaleString('ru-RU'),
      l.name,
      l.company,
      l.phone,
      l.email,
      l.product,
      l.volume || '',
      l.zone,
      l.payment,
      l.amount || '',
      l.score,
      STATUS_LABELS[l.status] || l.status,
      l.comment || '',
    ]);
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-stepnoy-kontur.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- База знаний ---------- */

  function renderKbChips() {
    const items = [{ id: 'all', label: 'Все позиции' }, ...KB.categories];
    els.kbCats.innerHTML = items
      .map(
        (c) =>
          `<button type="button" data-cat="${esc(c.id)}" class="${state.kbCategory === c.id ? 'is-active' : ''}">${esc(c.label)}</button>`
      )
      .join('');
  }

  function renderKbTable() {
    const q = state.kbQuery.trim().toLowerCase();
    const list = KB.products.filter((p) => {
      const inCat = state.kbCategory === 'all' || p.category === state.kbCategory;
      if (!inCat) return false;
      if (!q) return true;
      const haystack = [p.name, p.description, p.shortName, ...p.specs.map((s) => `${s.label} ${s.value}`), ...p.keywords]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    if (!list.length) {
      els.kbBody.innerHTML = '<tr><td colspan="6" class="leads-empty">Ничего не найдено. Попробуйте «пшеница», «белок» или «семена».</td></tr>';
      return;
    }

    els.kbBody.innerHTML = list
      .map(
        (p) => `
        <tr>
          <td class="kb-name"><b>${esc(p.name)}</b><span>${esc(p.specs.slice(0, 2).map((s) => `${s.label}: ${s.value}`).join(' · '))}</span></td>
          <td class="kb-muted">${esc(categoryLabel(p.category))}</td>
          <td class="kb-price">${num(p.price)} ₽</td>
          <td class="kb-muted">${num(p.stock)} т</td>
          <td class="kb-muted">${num(p.minLot)} т</td>
          <td><button class="kb-ask" type="button" data-prompt="Цена: ${esc(p.name)}">Спросить</button></td>
        </tr>`
      )
      .join('');
  }

  function renderKbStatic() {
    els.faqList.innerHTML = KB.faq
      .map(
        (f) => `
        <details class="faq-item">
          <summary>${esc(f.q)}</summary>
          <p>${esc(f.a)}</p>
        </details>`
      )
      .join('');

    els.termsGrid.innerHTML = `
      <div class="term-card">
        <b>Оплата</b>
        ${TERMS.payment.map((o) => `<div class="term-row"><span>${esc(o.label)}</span><b>${o.discountPct ? `−${pct(o.discountPct)}%` : 'стандарт'}</b></div>`).join('')}
      </div>
      <div class="term-card">
        <b>Доставка</b>
        ${TERMS.deliveryZones
          .slice(0, 5)
          .map((z) => `<div class="term-row"><span>${esc(z.name)}</span><b>${num(z.rate)} ₽/т</b></div>`)
          .join('')}
        <div class="term-row"><span>Самовывоз</span><b>0 ₽</b></div>
      </div>
      <div class="term-card">
        <b>Документы и качество</b>
        <p>${TERMS.docs.slice(0, 4).map(esc).join(' · ')}. Лаборатория аккредитована, отбор проб по ГОСТ 13586.3.</p>
      </div>`;
  }

  function renderKb() {
    renderKbChips();
    renderKbTable();
  }

  /* ---------- КП ---------- */

  function offerNumberDate(rec) {
    return new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function offerBodyHTML(rec) {
    const q = rec.quote;
    const c = rec.contact || {};
    const validUntil = new Date(Date.now() + q.validityDays * 86400000).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const today = offerNumberDate(rec);
    const deliveryRow = q.pickup
      ? ''
      : q.deliveryPending
        ? '<tr><td class="item"><b>Доставка</b><span>регион уточняется</span></td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">по расчёту</td></tr>'
        : `<tr><td class="item"><b>Доставка</b><span>${esc(q.zoneName)}</span></td><td class="num">${num(q.volume)} т</td><td class="num">${num(q.deliveryRate)} ₽/т</td><td class="num">—</td><td class="num">${money(q.delivery)}</td></tr>`;
    const grandLabel = q.deliveryPending ? 'Итого без доставки' : 'Итого с НДС 10%';
    const buyer = c.name
      ? `<b>${esc(c.company || c.name)}</b> · ${esc(c.name)}${c.phone ? ` · ${esc(c.phone)}` : ''}`
      : '<b>Покупатель:</b> ______________________________ (заполняется при подтверждении)';

    return `
      <div class="offer-head">
        <div class="offer-logo">
          <div class="offer-mark">С</div>
          <div><b>ООО «Степной контур»</b><span>Растениеводство · элеватор · логистика</span></div>
        </div>
        <div class="offer-req">
          <b>${esc(KB.company.region)}</b><br>
          ${esc(KB.company.phone)} · ${esc(KB.company.email)}<br>
          ${esc(KB.company.hours)}
        </div>
      </div>

      <div class="offer-title">
        <div>
          <h2>Коммерческое предложение</h2>
          <div class="offer-no">№ ${esc(rec.number)} от ${esc(today)}</div>
        </div>
        <div class="offer-date">Действует до <b>${esc(validUntil)}</b><br>Менеджер: ${esc(KB.company.manager.name)}</div>
      </div>

      <div class="offer-buyer">${buyer}</div>

      <table class="offer-table">
        <thead>
          <tr><th>Наименование</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Скидка</th><th class="num">Сумма</th></tr>
        </thead>
        <tbody>
          <tr>
            <td class="item"><b>${esc(q.productName)}</b><span>НДС 10% включён · урожай 2026 · протокол испытаний прилагается</span></td>
            <td class="num">${num(q.volume)} т</td>
            <td class="num">${money(q.price)}</td>
            <td class="num">${q.discountPct ? `−${pct(q.discountPct)}%` : '—'}</td>
            <td class="num">${money(q.afterDiscount)}</td>
          </tr>
          ${deliveryRow}
        </tbody>
      </table>

      <div class="offer-totals">
        <div class="offer-total-row"><span>Стоимость товара</span><b>${money(q.goods)}</b></div>
        ${q.discountSum ? `<div class="offer-total-row discount"><span>Скидка${q.discountPct ? ` (${pct(q.discountPct)}%)` : ''}</span><b>−${money(q.discountSum)}</b></div>` : ''}
        <div class="offer-total-row"><span>Доставка${q.pickup ? ' (самовывоз)' : ''}</span><b>${q.deliveryPending ? 'по расчёту' : q.delivery ? money(q.delivery) : '0 ₽'}</b></div>
        <div class="offer-total-row grand"><span>${grandLabel}</span><b>${money(q.total)}</b></div>
      </div>

      <div class="offer-terms">
        <div><b>Оплата:</b> ${esc(q.payment ? agent.paymentLabel(q.payment) : '100% предоплата или 50/50')}</div>
        <div><b>Отгрузка:</b> 1–3 рабочих дня после оплаты</div>
        <div><b>Доставка:</b> ${esc(q.pickup ? 'самовывоз, элеватор «Зерноград»' : q.deliveryPending ? 'рассчитывается после уточнения региона' : `${q.zoneName}, ${q.zoneDays}`)}</div>
        <div><b>Качество:</b> протокол испытаний аккредитованной лаборатории</div>
      </div>

      <div class="offer-foot">
        <div class="offer-sign">
          Руководитель отдела продаж<br>
          <span class="line"></span> / ${esc(KB.company.manager.name)} /
        </div>
        <div class="offer-manager">
          <b>${esc(KB.company.manager.name)}</b><br>
          ${esc(KB.company.manager.phone)}<br>
          ${esc(KB.company.manager.email)}
        </div>
      </div>

      <div class="offer-note">Демонстрационный документ, подготовлен ИИ-агентом «Колос». Не является публичной офертой. Цены и условия вымышлены и требуют подтверждения менеджером.</div>`;
  }

  function openOffer(number) {
    const rec = state.offers[number];
    if (!rec) return;
    state.currentOffer = rec;
    els.offerDoc.innerHTML = offerBodyHTML(rec);
    els.offerModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeOffer() {
    els.offerModal.hidden = true;
    document.body.style.overflow = '';
    state.currentOffer = null;
  }

  function downloadOffer() {
    if (!state.currentOffer) return;
    const rec = state.currentOffer;
    const body = offerBodyHTML(rec);
    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>КП ${esc(rec.number)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: "Segoe UI", Arial, sans-serif; color: #1a2a20; font-size: 12px; max-width: 820px; margin: 0 auto; padding: 24px; }
        * { box-sizing: border-box; }
        .offer-head { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #124b37; }
        .offer-logo { display: flex; align-items: center; gap: 10px; }
        .offer-mark { width: 42px; height: 42px; border-radius: 10px; background: #124b37; color: #f5e7bd; display: grid; place-items: center; font-family: Georgia, serif; font-size: 20px; }
        .offer-logo b { display: block; font-family: Georgia, serif; font-size: 16px; color: #12382a; }
        .offer-logo span { display: block; font-size: 8px; letter-spacing: 1.1px; text-transform: uppercase; color: #8b9489; margin-top: 2px; }
        .offer-req { text-align: right; font-size: 9px; line-height: 1.6; color: #7b857a; }
        .offer-req b { color: #34463a; }
        .offer-title { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin: 22px 0 14px; }
        .offer-title h2 { font-family: Georgia, serif; font-size: 23px; font-weight: 600; color: #102f23; margin: 0; }
        .offer-title .offer-no { font-size: 9px; color: #8b9489; margin-top: 3px; }
        .offer-title .offer-date { text-align: right; font-size: 9px; color: #8b9489; line-height: 1.6; white-space: nowrap; }
        .offer-title .offer-date b { color: #34463a; }
        .offer-buyer { margin-bottom: 16px; padding: 10px 12px; border-radius: 8px; background: #f6f3e9; font-size: 10px; line-height: 1.6; color: #4f5e53; }
        .offer-buyer b { color: #24382c; }
        .offer-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .offer-table th { background: #eef2e8; border: 1px solid #dde4d5; padding: 7px 9px; font-size: 8px; letter-spacing: 0.6px; color: #657263; text-align: left; }
        .offer-table td { border: 1px solid #e6e2d6; padding: 8px 9px; font-size: 10px; }
        .offer-table .num { text-align: right; white-space: nowrap; }
        .offer-table .item b { display: block; font-size: 10px; color: #20352a; }
        .offer-table .item span { display: block; font-size: 8px; color: #8b9489; margin-top: 2px; }
        .offer-totals { width: 310px; margin-left: auto; }
        .offer-total-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 10px; color: #637063; }
        .offer-total-row b { color: #24382c; }
        .offer-total-row.grand { margin-top: 5px; padding: 9px 0 4px; border-top: 2px solid #124b37; font-size: 11px; color: #24382c; }
        .offer-total-row.grand b { font-family: Georgia, serif; font-size: 18px; color: #0f3d2c; }
        .offer-total-row.discount, .offer-total-row.discount b { color: #8a6716; }
        .offer-terms { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-top: 18px; padding-top: 12px; border-top: 1px solid #e6e2d6; font-size: 9px; color: #6b766b; }
        .offer-terms b { color: #34463a; }
        .offer-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-top: 26px; }
        .offer-sign { font-size: 9px; color: #6b766b; line-height: 1.8; }
        .offer-sign .line { display: inline-block; width: 130px; border-bottom: 1px solid #aeb6aa; margin: 0 6px; }
        .offer-manager { text-align: right; font-size: 9px; line-height: 1.6; color: #6b766b; }
        .offer-manager b { color: #24382c; }
        .offer-note { margin-top: 18px; padding: 8px 10px; border-radius: 6px; background: #fbf3df; font-size: 8px; line-height: 1.5; color: #8a7337; }
      </style></head><body>${body}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `КП-${rec.number}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Переключение разделов ---------- */

  function switchView(view) {
    els.workspace.dataset.view = view;
    els.tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    if (view === 'leads') renderLeads();
    if (view === 'kb') renderKb();
    if (view === 'chat') requestAnimationFrame(scrollBottom);
  }

  /* ---------- Инициализация ---------- */

  function autoGrow() {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(120, els.input.scrollHeight)}px`;
  }

  function init() {
    const now = new Date();
    els.chatDay.textContent = `Сегодня, ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;

    renderKbStatic();
    updateTabCount();
    updateDeal();

    els.tabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

    els.composer.addEventListener('submit', (event) => {
      event.preventDefault();
      send(els.input.value);
    });

    els.input.addEventListener('input', autoGrow);
    els.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        els.composer.requestSubmit();
      }
    });

    document.addEventListener('click', (event) => {
      const promptEl = event.target.closest('[data-prompt]');
      if (promptEl) {
        event.preventDefault();
        send(promptEl.dataset.prompt);
        return;
      }
      const actionEl = event.target.closest('[data-action]');
      if (actionEl && actionEl.dataset.action === 'open-offer') {
        event.preventDefault();
        openOffer(actionEl.dataset.number);
        return;
      }
      if (event.target.closest('[data-close-offer]')) {
        closeOffer();
      }
    });

    els.reset.addEventListener('click', () => {
      agent.reset();
      state.offers = {};
      state.generation += 1;
      state.chain = Promise.resolve();
      state.busy = false;
      state.initial = true;
      hideTyping();
      els.messages.innerHTML = '';
      renderSuggestions([]);
      updateComposer();
      updateDeal();
      const greeting = agent.greeting();
      feed(greeting.messages, greeting.suggestions);
    });

    els.dealCta.addEventListener('click', () => {
      if (!els.dealCta.disabled) send('Оформить заявку');
    });

    els.messages.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-lead-form]');
      if (!form) return;
      event.preventDefault();
      if (form.dataset.sent === '1') return;

      const data = Object.fromEntries(new FormData(form).entries());
      const res = agent.submitContact(data);
      if (res.error) {
        const err = form.querySelector('.form-error');
        err.hidden = false;
        err.textContent = res.error;
        return;
      }

      form.dataset.sent = '1';
      form.classList.add('is-sent');
      form.querySelectorAll('input, textarea, button').forEach((el) => {
        el.disabled = true;
      });
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Заявка отправлена';

      addLead(res.lead);
      renderLeads();
      feed(res.messages, res.suggestions);
    });

    els.leadsBody.addEventListener('change', (event) => {
      const select = event.target.closest('.status-select');
      if (!select) return;
      const leads = readLeads();
      const lead = leads.find((l) => l.id === select.dataset.leadId);
      if (!lead) return;
      lead.status = select.value;
      writeLeads(leads);
      select.className = `status-select status-${select.value}`;
      renderKpis(leads);
    });

    els.exportCsv.addEventListener('click', exportCsv);

    els.kbSearch.addEventListener('input', () => {
      state.kbQuery = els.kbSearch.value;
      renderKbTable();
    });

    els.kbCats.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-cat]');
      if (!btn) return;
      state.kbCategory = btn.dataset.cat;
      renderKbChips();
      renderKbTable();
    });

    els.offerPrint.addEventListener('click', () => window.print());
    els.offerDownload.addEventListener('click', downloadOffer);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.offerModal.hidden) closeOffer();
    });

    renderLeads();

    const greeting = agent.greeting();
    feed(greeting.messages, greeting.suggestions);
  }

  init();
})();
