/* «Колос» — демонстрационная модель ИИ-агента отдела продаж.
   Детерминированный движок: работает без API и интернета. */
(function () {
  'use strict';

  const KB = window.AGRO_KB;
  if (!KB) throw new Error('Не загружена база знаний. Запустите tools/build_kb.py');

  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const money = (n) => `${nf.format(Math.round(n))} ₽`;
  const num = (n) => nf.format(n);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9\s.,%/+-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const TERMS = KB.terms;
  const PRODUCTS = KB.products;
  const ZONES = TERMS.deliveryZones;

  function productById(id) {
    return PRODUCTS.find((p) => p.id === id) || null;
  }

  function findProduct(text) {
    let best = null;
    let bestScore = 0;
    for (const p of PRODUCTS) {
      for (const kw of p.keywords) {
        const k = norm(kw);
        if (!k) continue;
        if (text.includes(k)) {
          const score = k.length + (k.includes(' ') ? 4 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
      }
    }
    // «пшеница» без уточнения класса — продовольственная, 3 класс
    if (best && best.id === 'wheat4' && /пшениц/.test(text) && !/4\s*класс|четверт/.test(text)) {
      best = productById('wheat3');
    }
    return best;
  }

  function findZone(text) {
    let best = null;
    let bestScore = 0;
    for (const z of ZONES) {
      for (const kw of z.keywords) {
        const k = norm(kw);
        if (k && text.includes(k) && k.length > bestScore) {
          bestScore = k.length;
          best = z;
        }
      }
    }
    return best;
  }

  function findVolume(text) {
    const m = text.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(тонн(?:ы|у|а)?|т|кг|килограмм(?:а|ов)?)(?=\s|$|[,.;!?])/i);
    if (m) {
      let value = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (!isFinite(value) || value <= 0) return null;
      if (/^кг|^килограмм/.test(m[2])) value = value / 1000;
      return Math.round(value * 1000) / 1000;
    }
    return null;
  }

  function findBareVolume(text) {
    const m = text.match(/(?:^|\s)(\d{2,4})(?=\s*(?:$|\?|!|\.|,))/);
    if (!m) return null;
    const value = parseInt(m[1], 10);
    if (value < 20 || value > 5000) return null;
    return value;
  }

  function findPayment(text) {
    if (/(50\s*\/\s*50|пополам|половина)/.test(text)) return 'half';
    if (/(предоплат|100\s*%|полная оплат)/.test(text)) return 'prepay';
    if (/отсрочк/.test(text)) return /30/.test(text) ? 'deferred30' : /14/.test(text) ? 'deferred14' : 'deferred14';
    return null;
  }

  function findWhen(text) {
    const months = [
      ['январ', 'января'], ['феврал', 'февраля'], ['март', 'марта'], ['апрел', 'апреля'],
      ['ма[йя]', 'мая'], ['июн', 'июня'], ['июл', 'июля'], ['август', 'августа'],
      ['сентябр', 'сентября'], ['октябр', 'октября'], ['ноябр', 'ноября'], ['декабр', 'декабря'],
    ];
    for (const [re, label] of months) {
      if (new RegExp(re).test(text)) return label;
    }
    if (/срочно|как можно скорее|на этой неделе/.test(text)) return 'в ближайшее время';
    if (/до конца месяца/.test(text)) return 'до конца месяца';
    if (/следующ(ая|ей) недел/.test(text)) return 'на следующей неделе';
    return null;
  }

  function detectIntents(text) {
    const s = new Set();
    if (/(привет|здравств|добрый (день|вечер)|доброе утро|доброго дня)/.test(text)) s.add('greeting');
    if (/(коммерческ|оферт|(^|\s)кп(\s|$)|пришлите.*(?:цен|услов)|отправ.*на почт)/.test(text)) s.add('offer');
    if (/(документ|декларац|сертификат|протокол|накладн|упд|ст-1|фитосанитар)/.test(text)) s.add('docs');
    if (/(оплат|отсрочк|предоплат|рассрочк|ндс|счет|счёт|безнал|платеж)/.test(text)) s.add('payment');
    if (/(доставк|привез|логист|самовывоз|транспорт|тариф|куда воз)/.test(text)) s.add('delivery');
    if (/(отгрузк|когда (?:будет|можете|сможете)|срок поставк|когда привез)/.test(text)) s.add('shipment');
    if (/(скидк|торг|дешевле|снизить цен|снизте цен|лучше цен|цена ниже)/.test(text)) s.add('discount');
    if (/(цен[аыу]|стоимост|почем|прайс|сколько стоит|расцен)/.test(text)) s.add('price');
    if (/(налич|остат|склад|сколько (?:тонн|осталось)|в наличии)/.test(text)) s.add('stock');
    if (/(каталог|ассортимент|что есть|какие (?:у вас )?(?:товары|культуры|позиции)|что продаете|что предлагаете)/.test(text)) s.add('catalog');
    if (/(заказ|купить|оформ|беру|нужн|интересует|хочу|покупа|рассчита|расчёт|расчет|заявк|договор)/.test(text)) s.add('order');
    if (/(менеджер|позвони|связ|оператор|живой человек)/.test(text)) s.add('manager');
    if (/(качеств|белок|клейковин|влажност|лаборатор|гост|анализ|масличност|всхожест)/.test(text)) s.add('quality');
    if (/(дорого|у конкурент|конкуренты|подумаю|надо посоветоват|сравн(ю|ить))/.test(text)) s.add('objection');
    if (/(меньше \d+|минимальн|мелк(ая|ую|ой) парти|розниц)/.test(text)) s.add('minlot');
    if (/(подробн|расскаж|характеристик|что входит|состав)/.test(text)) s.add('info');
    if (/(спасибо|благодар)/.test(text)) s.add('thanks');
    if (/(пока|до свидан|всего доброго)/.test(text)) s.add('bye');
    if (/(что (?:ты )?умеешь|кто ты|возможност|помощь|как работаешь|что можешь)/.test(text)) s.add('help');
    return s;
  }

  function matchFaq(text) {
    let best = null;
    let bestScore = 0;
    for (const item of KB.faq) {
      let score = 0;
      for (const kw of item.keywords) {
        if (text.includes(norm(kw))) score += norm(kw).length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return bestScore >= 5 ? best : null;
  }

  function discountTier(volume) {
    let tier = null;
    for (const d of TERMS.discounts) {
      if (volume >= d.minTons) tier = d;
    }
    return tier;
  }

  function formatDate(d) {
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  class SalesAgent {
    constructor(kb) {
      this.kb = kb;
      this.reset();
    }

    reset() {
      this.state = {
        productId: null,
        volume: null,
        zone: null,
        pickup: false,
        payment: null,
        when: null,
        contact: null,
        leadId: null,
        stage: 'interest',
        lastQuote: null,
        offerNo: null,
        turn: 0,
      };
    }

    get product() {
      return productById(this.state.productId);
    }

    greeting() {
      const top = ['wheat3', 'sunflower', 'barleyBrew'];
      return {
        messages: [
          {
            type: 'text',
            html:
              `Здравствуйте! Я <b>«Колос»</b> — ИИ-агент отдела продаж <b>«${esc(KB.company.name)}»</b>.<br>` +
              'Помогу подобрать культуру, рассчитать партию со скидкой и доставкой, подготовить коммерческое предложение и передать заявку менеджеру.',
          },
          {
            type: 'products',
            intro: 'Чаще всего у нас берут:',
            ids: top,
          },
          {
            type: 'text',
            html: `В наличии <b>${PRODUCTS.length} позиций</b> урожая 2026 года. Напишите культуру и объём — например, «пшеница 3 класса, 500 т в Краснодар».`,
          },
        ],
        suggestions: this.suggestions(),
      };
    }

    suggestions() {
      if (this.state.contact) {
        return ['Когда отгрузка?', 'Документы на партию', 'Новый расчёт'];
      }
      if (!this.state.productId) {
        return ['Каталог и цены', 'Пшеница 3 класса', 'Подсолнечник', 'Условия доставки'];
      }
      if (!this.state.volume) {
        return ['Цена за тонну', 'Рассчитать 100 т', 'Условия оплаты', 'Качество партии'];
      }
      return ['Оформить заявку', 'Скачать КП', 'Условия оплаты', 'Скидка при объёме'];
    }

    extract(text) {
      const product = findProduct(text);
      const zone = findZone(text);
      const payment = findPayment(text);
      const volume = findVolume(text);
      const when = findWhen(text);
      const pickup = /(самовывоз|сам(?:и)? (?:забер|вывез)|заберу сам|с элеватора)/.test(text);
      return { product, zone, payment, volume, when, pickup };
    }

    computeQuote() {
      const p = this.product;
      const volume = this.state.volume;
      if (!p || !volume) return null;

      const goods = p.price * volume;
      const tier = discountTier(volume);
      const prepayPct = this.state.payment === 'prepay' ? 2 : 0;
      const discountPct = (tier ? tier.pct : 0) + prepayPct;
      const discountSum = (goods * discountPct) / 100;
      const afterDiscount = goods - discountSum;

      let zone = null;
      const pickup = this.state.pickup;
      let deliveryPending = false;
      if (pickup) {
        zone = { id: 'pickup', name: TERMS.pickup.label, rate: 0, days: 'в день оплаты', estimate: false };
      } else if (this.state.zone) {
        zone = this.state.zone;
      } else {
        deliveryPending = true;
        zone = { name: 'по расчёту', rate: null, days: '—', estimate: true };
      }
      const delivery = deliveryPending ? null : zone.rate * volume;
      const total = afterDiscount + (delivery || 0);
      const quote = {
        productId: p.id,
        productName: p.name,
        volume,
        price: p.price,
        goods,
        tierPct: tier ? tier.pct : 0,
        tierLabel: tier ? tier.label : null,
        prepayPct,
        discountPct,
        discountSum,
        afterDiscount,
        zoneName: zone.name,
        zoneDays: zone.days,
        deliveryRate: zone.rate,
        delivery,
        deliveryPending,
        deliveryEstimate: !!zone.estimate && !deliveryPending,
        pickup,
        total,
        perTon: total / volume,
        stock: p.stock,
        stockShort: volume > p.stock,
        minLot: p.minLot,
        vat: TERMS.vat,
        validityDays: TERMS.offerValidityDays,
        payment: this.state.payment,
      };
      this.state.lastQuote = quote;
      this.state.stage = this.state.contact ? 'lead' : 'quote';
      return quote;
    }

    offerNumber() {
      if (!this.state.offerNo) {
        const d = new Date();
        const tail = String(Math.floor(100 + Math.random() * 900));
        this.state.offerNo = `КП-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${tail}`;
      }
      return this.state.offerNo;
    }

    quoteMessage(quote) {
      this.state.lastQuote = quote;
      return { type: 'quote', quote };
    }

    productMessage(p, prefix) {
      return { type: 'product', productId: p.id, intro: prefix || '' };
    }

    handleFormRequest(intro) {
      const p = this.product;
      const q = this.state.lastQuote;
      return {
        messages: [
          { type: 'text', html: intro || 'Оставьте контакты — менеджер подтвердит наличие, качество партии и график отгрузки.' },
          {
            type: 'form',
            prefill: {
              product: p ? p.name : '',
              volume: this.state.volume || '',
              zone: this.state.zone ? this.state.zone.name : this.state.pickup ? 'Самовывоз' : '',
              amount: q ? q.total : null,
            },
          },
        ],
        suggestions: [],
      };
    }

    submitContact(data) {
      const name = String(data.name || '').trim().slice(0, 60);
      const company = String(data.company || '').trim().slice(0, 80);
      const phone = String(data.phone || '').trim().slice(0, 30);
      const email = String(data.email || '').trim().slice(0, 60);
      const comment = String(data.comment || '').trim().slice(0, 300);

      if (name.length < 2) {
        return { error: 'Укажите имя — так менеджеру будет проще к вам обратиться.' };
      }
      if (phone.replace(/\D/g, '').length < 10) {
        return { error: 'Проверьте номер телефона: нужно не меньше 10 цифр.' };
      }

      const p = this.product;
      const quote = this.computeQuote();
      this.state.contact = { name, company, phone, email };
      this.state.stage = 'lead';

      const lead = {
        id: `SK-${String(Date.now()).slice(-6)}`,
        createdAt: new Date().toISOString(),
        name,
        company: company || 'Компания не указана',
        phone,
        email: email || '',
        product: p ? p.name : 'Не выбран',
        volume: this.state.volume || null,
        zone: this.state.zone ? this.state.zone.name : this.state.pickup ? 'Самовывоз' : 'Не указан',
        payment: this.state.payment ? this.paymentLabel(this.state.payment) : 'Не выбран',
        when: this.state.when || 'Не указан',
        amount: quote ? quote.total : null,
        score: this.score(true),
        status: 'new',
        source: 'ИИ-агент «Колос»',
        comment,
      };
      this.state.leadId = lead.id;

      const messages = [
        {
          type: 'text',
          html:
            `Спасибо, <b>${esc(name)}</b>! Заявка <b>${lead.id}</b> принята. ` +
            `Передал её ${esc(KB.company.manager.name)} (${esc(KB.company.manager.role)}). ` +
            `Он свяжется по номеру ${esc(phone)} в течение 15 минут в рабочее время (${esc(KB.company.hours)}).`,
        },
        { type: 'summary', lead },
      ];
      return { messages, lead, suggestions: ['Когда отгрузка?', 'Документы на партию', 'Новый расчёт'] };
    }

    paymentLabel(id) {
      const opt = TERMS.payment.find((o) => o.id === id);
      return opt ? opt.label : 'Не выбран';
    }

    score(withContact) {
      let s = 20;
      if (this.product) s += 10;
      if (this.state.volume) s += 10;
      if (this.state.volume >= 100) s += 8;
      if (this.state.volume >= 500) s += 8;
      if (this.state.zone || this.state.pickup) s += 8;
      if (this.state.payment) s += 5;
      if (withContact || this.state.contact) s += 20;
      if (this.state.contact && this.state.contact.email) s += 5;
      return Math.min(100, s);
    }

    snapshot() {
      const quote = this.state.lastQuote;
      return {
        stage: this.state.stage,
        product: this.product ? this.product.name : null,
        volume: this.state.volume,
        zone: this.state.zone ? this.state.zone.name : this.state.pickup ? 'Самовывоз' : null,
        payment: this.state.payment ? this.paymentLabel(this.state.payment) : null,
        contact: this.state.contact,
        score: this.score(false),
        quote,
        leadId: this.state.leadId,
      };
    }

    handle(raw) {
      const text = norm(raw);
      if (!text) {
        return { messages: [{ type: 'text', html: 'Напишите культуру, объём и регион — рассчитаю партию.' }], suggestions: this.suggestions() };
      }

      const intents = detectIntents(text);
      const ent = this.extract(text);

      let hasNewContext = !!(ent.product || ent.volume || ent.zone || ent.pickup || ent.payment || ent.when);
      if (ent.product) this.state.productId = ent.product.id;
      if (ent.volume && !intents.has('minlot')) this.state.volume = ent.volume;
      if (this.state.lastQuote && (this.state.lastQuote.productId !== this.state.productId || this.state.lastQuote.volume !== this.state.volume)) {
        this.state.lastQuote = null;
        this.state.offerNo = null;
      }
      if (ent.zone) {
        this.state.zone = ent.zone;
        this.state.pickup = false;
      }
      if (ent.pickup) {
        this.state.pickup = true;
        this.state.zone = null;
      }
      if (ent.payment) this.state.payment = ent.payment;
      if (ent.when) this.state.when = ent.when;

      // «500» без единиц — объём, если уже обсуждаем партию
      if (!ent.volume && this.state.productId && /^(а\s+)?\d{2,4}\s*\??$/.test(text)) {
        const bare = findBareVolume(text);
        if (bare) {
          this.state.volume = bare;
          hasNewContext = true;
        }
      }

      const p = this.product;
      const volume = this.state.volume;
      const wantsLead = /(заявк|оформ|заключ|договор)/.test(text);

      if (intents.has('thanks') && intents.size === 1) {
        return {
          messages: [{ type: 'text', html: 'Рад помочь. Если понадобится пересчитать партию или подготовить КП — я здесь.' }],
          suggestions: this.suggestions(),
        };
      }
      if (intents.has('bye') && intents.size === 1) {
        return {
          messages: [{ type: 'text', html: `Спасибо за разговор! Связаться с отделом продаж можно по телефону ${esc(KB.company.phone)}.` }],
          suggestions: [],
        };
      }
      if (intents.has('greeting') && (intents.size === 1 || (intents.size === 2 && intents.has('help')))) {
        return this.greeting();
      }
      if (intents.has('help')) {
        return {
          messages: [
            {
              type: 'text',
              html:
                'Я помогаю по пяти направлениям:<br>' +
                '• подбор культуры и партии под задачу;<br>' +
                '• цена, скидки и наличие на складе;<br>' +
                '• расчёт доставки и самовывоза;<br>' +
                '• коммерческое предложение и документы;<br>' +
                '• заявка менеджеру и контроль её статуса.',
            },
            { type: 'text', html: 'Назовите культуру и объём — например, «ячмень 300 т, самовывоз».' },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('objection')) {
        const key = /конкурент/.test(text) ? 'cheaper' : /подума/.test(text) ? 'think' : 'price';
        const q = this.computeQuote();
        return {
          messages: [
            { type: 'text', html: esc(TERMS.objections[key]) },
            ...(q ? [this.quoteMessage(q)] : []),
          ],
          suggestions: this.suggestions(),
        };
      }

      if (wantsLead || intents.has('manager')) {
        if (this.state.contact) {
          const q = this.state.lastQuote;
          return {
            messages: [
              {
                type: 'text',
                html:
                  `Ваша заявка <b>${esc(this.state.leadId)}</b> уже у ${esc(KB.company.manager.name)}. ` +
                  `Если нужно срочно — прямой номер: <b>${esc(KB.company.manager.phone)}</b>.` +
                  (q ? `<br>Расчёт по партии сохранён: ${money(q.total)}.` : ''),
              },
            ],
            suggestions: this.suggestions(),
          };
        }
        if (p && volume) this.computeQuote();
        return this.handleFormRequest(
          p && volume
            ? `Зафиксирую запрос: <b>${esc(p.name)}, ${num(volume)} т</b>${this.state.zone ? `, доставка: ${esc(this.state.zone.name)}` : ''}. Оставьте контакты — менеджер подтвердит условия и пришлёт документы.`
            : 'Оставьте контакты — менеджер уточнит детали и подготовит расчёт. Это займёт не больше 15 минут в рабочее время.'
        );
      }

      if (intents.has('offer')) {
        if (!p || !volume) {
          return {
            messages: [
              {
                type: 'text',
                html: !p
                  ? 'Подготовлю КП за минуту. Укажите культуру и объём — например, «подсолнечник 200 т».'
                  : `По ${esc(p.name)} нужен объём: от ${num(p.minLot)} т. Назовите цифру — сразу сформирую КП.`,
              },
            ],
            suggestions: this.suggestions(),
          };
        }
        const q = this.computeQuote();
        return {
          messages: [
            {
              type: 'text',
              html:
                `Сформировал коммерческое предложение <b>${this.offerNumber()}</b> на ${esc(p.name)} — ${num(volume)} т. Оно действует ${TERMS.offerValidityDays} дней.` +
                (q.deliveryPending ? ' Доставку добавлю в расчёт после уточнения региона.' : ''),
            },
            { type: 'offer', quote: q, number: this.offerNumber(), company: KB.company, terms: TERMS },
          ],
          suggestions: ['Оформить заявку', 'Условия оплаты', 'Уточнить качество'],
        };
      }

      if (intents.has('docs')) {
        return {
          messages: [
            {
              type: 'text',
              html:
                `К каждой партии прилагаем полный пакет:<br>` +
                TERMS.docs.map((d) => `• ${esc(d)}`).join('<br>') +
                '<br><br>Документы готовим к отгрузке; копии можем прислать заранее.',
            },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('quality')) {
        if (p) {
          const q = this.computeQuote();
          return {
            messages: [
              { type: 'text', html: `Показатели партии <b>${esc(p.name)}</b> — из протокола испытаний:` },
              this.productMessage(p),
              { type: 'text', html: 'Лаборатория аккредитована, отбор проб по ГОСТ 13586.3. При расхождении качества на приёмке делаем независимый анализ и пересчитываем партию.' },
              ...(q ? [this.quoteMessage(q)] : []),
            ],
            suggestions: this.suggestions(),
          };
        }
        const faq = matchFaq(text) || KB.faq.find((f) => f.keywords.includes('качество'));
        return {
          messages: [{ type: 'text', html: faq ? esc(faq.a) : 'Уточните культуру — пришлю показатели партии из протокола.' }],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('payment')) {
        const q = this.computeQuote();
        const intro = q
          ? `По партии ${esc(q.productName)} (${num(q.volume)} т) доступны такие варианты:`
          : 'Работаем по четырём схемам:';
        return {
          messages: [
            { type: 'text', html: intro },
            { type: 'payment', options: TERMS.payment, quote: q },
            ...(q
              ? [
                  {
                    type: 'text',
                    html:
                      this.state.payment === 'prepay'
                        ? `Скидка 2% за предоплату уже учтена: <b>${money(q.afterDiscount)}</b> без доставки.`
                        : `При 100% предоплате цена партии снижается на 2%: <b>${money(q.afterDiscount * 0.98)}</b> без доставки.`,
                  },
                ]
              : []),
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('shipment')) {
        return {
          messages: [
            {
              type: 'text',
              html:
                `${esc(TERMS.shipment)}<br>` +
                'При объёме от 500 т согласуем график отгрузок на неделю вперёд. ' +
                'Погрузка на элеваторе «Зерноград», весовая и лаборатория работают ежедневно с 08:00 до 19:00.',
            },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('delivery')) {
        if (p && volume && !this.state.zone && !this.state.pickup) {
          return {
            messages: [
              { type: 'text', html: `Куда доставляем партию ${esc(p.name.toLowerCase())}, ${num(volume)} т? Назовите регион — посчитаю доставку.` },
              { type: 'delivery', zones: ZONES, pickup: TERMS.pickup },
            ],
            suggestions: ['Ростовская область', 'Краснодарский край', 'Самовывоз'],
          };
        }
        const q = this.computeQuote();
        if (p && volume) {
          return {
            messages: [
              {
                type: 'text',
                html: q.pickup
                  ? `Считаю партию с самовывозом: <b>${num(volume)} т</b>, отгрузка с элеватора «Зерноград».`
                  : `Считаю доставку в регион «${esc(q.zoneName)}»${q.deliveryEstimate ? ' (ориентировочно — точный тариф подтвердит менеджер)' : ''}.`,
              },
              this.quoteMessage(q),
              {
                type: 'text',
                html: `${q.pickup ? 'Самовывоз' : 'Самовывоз как альтернатива'}: ${esc(TERMS.pickup.note)} Пункт отгрузки — ${esc(TERMS.pickup.point)}.`,
              },
            ],
            suggestions: ['Оформить заявку', 'Скачать КП', 'Условия оплаты'],
          };
        }
        return {
          messages: [
            { type: 'text', html: 'Возим своим транспортом по югу и центру России. Тарифы за тонну:' },
            { type: 'delivery', zones: ZONES, pickup: TERMS.pickup },
            { type: 'text', html: p ? `Для расчёта по ${esc(p.name)} назовите объём и регион.` : 'Назовите культуру, объём и регион — посчитаю итоговую сумму.' },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('discount')) {
        const q = this.computeQuote();
        const tiers = TERMS.discounts.map((d) => `• ${esc(d.label)} — <b>${String(d.pct).replace('.', ',')}%</b>`).join('<br>');
        return {
          messages: [
            {
              type: 'text',
              html:
                `Скидки за объём:<br>${tiers}<br>Плюс <b>2%</b> при 100% предоплате. Скидки суммируются, максимум — 7%.` +
                (q
                  ? `<br><br>Для вашей партии ${num(q.volume)} т: скидка <b>${String(q.discountPct).replace('.', ',')}%</b>, итог с доставкой — <b>${money(q.total)}</b>.`
                  : '<br><br>Назовите объём — покажу точный расчёт.'),
            },
            ...(q ? [this.quoteMessage(q)] : []),
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('stock')) {
        if (p) {
          return {
            messages: [
              {
                type: 'text',
                html: `На складе <b>${num(p.stock)} т</b> ${esc(p.name.toLowerCase())} (${esc(p.harvest)}). Минимальная партия — ${num(p.minLot)} т, отгрузка 1–3 рабочих дня.`,
              },
              this.productMessage(p),
            ],
            suggestions: this.suggestions(),
          };
        }
        return {
          messages: [
            { type: 'text', html: 'Остатки по культурам на 9 ноября 2026:' },
            { type: 'stock', ids: PRODUCTS.slice(0, 6).map((x) => x.id) },
            { type: 'text', html: 'Уточнить партию и срок отгрузки могу сразу после выбора культуры.' },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('catalog')) {
        return {
          messages: [
            { type: 'text', html: `В наличии ${PRODUCTS.length} позиций: зерновые, масличные, семена, корма и побочная продукция.` },
            { type: 'products', intro: 'Основные позиции:', ids: ['wheat3', 'wheat4', 'barleyBrew', 'corn', 'sunflower', 'seedsWheat'] },
            { type: 'text', html: 'Могу отфильтровать по культуре, классу, объёму или региону доставки.' },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('minlot')) {
        const faq = KB.faq.find((f) => f.keywords.includes('20 тонн'));
        return {
          messages: [{ type: 'text', html: esc(faq.a) }],
          suggestions: this.suggestions(),
        };
      }

      if (!hasNewContext && intents.size === 0) {
        const faq = matchFaq(text);
        if (faq) {
          return { messages: [{ type: 'text', html: esc(faq.a) }], suggestions: this.suggestions() };
        }
      }

      if (intents.has('price')) {
        if (p && volume) {
          const q = this.computeQuote();
          return {
            messages: [
              { type: 'text', html: `Расчёт на <b>${num(volume)} т</b> ${esc(p.name.toLowerCase())}${this.state.zone ? ` с доставкой: ${esc(this.state.zone.name)}` : ''}:` },
              this.quoteMessage(q),
            ],
            suggestions: this.suggestions(),
          };
        }
        if (p) {
          return {
            messages: [
              this.productMessage(p, `Цена — <b>${money(p.price)}/т</b>, в наличии ${num(p.stock)} т.`),
              { type: 'text', html: `Скидка начинается от 100 т. Назовите объём — посчитаю партию с доставкой.` },
            ],
            suggestions: this.suggestions(),
          };
        }
        return {
          messages: [
            { type: 'text', html: 'Цены на основные позиции (с НДС 10%, ноябрь 2026):' },
            { type: 'pricelist', ids: ['wheat3', 'wheat4', 'barleyBrew', 'barleyFeed', 'corn', 'sunflower'] },
            { type: 'text', html: 'Скажите культуру и объём — рассчитаю точную сумму со скидкой и доставкой.' },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (p && volume && hasNewContext) {
        const q = this.computeQuote();
        const lowNote = volume < p.minLot
          ? `<br><br><b>Минимальная партия — ${num(p.minLot)} т.</b> Могу передать запрос менеджеру: иногда собираем сборную партию.`
          : '';
        return {
          messages: [
            { type: 'text', html: `Считаю: <b>${esc(p.name)}</b>, ${num(volume)} т${this.state.zone ? `, доставка: ${esc(this.state.zone.name)}` : this.state.pickup ? ', самовывоз' : ''}.` },
            this.quoteMessage(q),
            {
              type: 'text',
              html:
                (q.stockShort
                  ? `В наличии ${num(q.stock)} т — на остаток согласуем график следующей партии.<br>`
                  : '') +
                `Цена действует ${TERMS.offerValidityDays} дней. ${esc(TERMS.shipment)}` +
                lowNote,
            },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (p && (ent.product || intents.has('info'))) {
        const hint = volume
          ? ''
          : `Укажите объём — от ${num(p.minLot)} т.`;
        return {
          messages: [
            this.productMessage(p, `${esc(p.name)} — <b>${money(p.price)}/т</b>, на складе ${num(p.stock)} т.`),
            { type: 'text', html: `${esc(p.description)} ${hint}` },
          ],
          suggestions: this.suggestions(),
        };
      }

      if (intents.has('order') && !p) {
        return {
          messages: [
            { type: 'text', html: 'Помогу с заказом. Что интересует — зерно, масличные, семена или корма?' },
            { type: 'products', intro: 'Выберите позицию или напишите название:', ids: ['wheat3', 'barleyFeed', 'corn', 'sunflower', 'seedsWheat', 'bran'] },
          ],
          suggestions: this.suggestions(),
        };
      }

      const faq = matchFaq(text);
      if (faq) {
        return { messages: [{ type: 'text', html: esc(faq.a) }], suggestions: this.suggestions() };
      }

      return {
        messages: [
          {
            type: 'text',
            html:
              'Уточните, пожалуйста, три вещи: <b>культуру</b>, <b>объём</b> и <b>регион доставки</b> — так я сразу посчитаю партию.' +
              '<br>Например: «кукуруза, 300 т, Ростовская область».',
          },
        ],
        suggestions: this.suggestions(),
      };
    }
  }

  window.SalesAgent = SalesAgent;
  window.AGENT_HELPERS = { money, num, esc, norm, plural };
})();
