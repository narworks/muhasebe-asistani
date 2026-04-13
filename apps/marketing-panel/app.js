const STORAGE_KEY = 'muhasebeAsistaniMarketingOS.v1';

const contentSeed = [
  [1, 'Pazartesi', 'LinkedIn', 'Metin post', 'E-tebligat kontrolünü manuel yapmak neden yoğun dönemlerde riskli?', '14 gün ücretsiz deneyebilirsiniz.', 'Problem odaklı başlangıç'],
  [1, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Muhasebe Asistanı nedir? 60 saniyelik genel akış', 'Demo videosunu yorumlara bırakıyorum.', 'Temel demo'],
  [1, 'Cuma', 'LinkedIn', 'Checklist', 'Mali müşavirler için haftalık e-tebligat kontrol listesi', 'Kontrol listesini isteyenlere gönderebilirim.', 'Kaydedilebilir içerik'],
  [1, 'Cuma', 'Blog', 'SEO yazısı', 'E-Tebligat Takibi Nasıl Yapılır?', '14 gün ücretsiz deneyin.', 'Brief 1'],
  [2, 'Pazartesi', 'LinkedIn', 'Metin post', '5-50 mükellefli bürolarda en çok zaman kaybettiren 3 rutin iş', 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'ICP odaklı'],
  [2, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', "Bir banka ekstresini Excel'e dönüştürme", '14 gün ücretsiz deneyebilirsiniz.', 'Excel Asistanı'],
  [2, 'Cuma', 'LinkedIn', 'Doküman post', 'Banka ekstresi düzenlerken kontrol edilmesi gereken sütunlar', 'Demo videosunu yorumlara bırakıyorum.', 'Pratik rehber'],
  [2, 'Cuma', 'Blog', 'SEO yazısı', "Banka Ekstresi Excel'e Nasıl Çevrilir?", '14 gün ücretsiz deneyin.', 'Brief 2'],
  [3, 'Pazartesi', 'LinkedIn', 'Metin post', 'Veri cihazınızda kalınca muhasebe bürosu için ne değişir?', 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'Güven mesajı'],
  [3, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'E-tebligat tarama ekranı: mükellef bazlı takip', '14 gün ücretsiz deneyebilirsiniz.', 'E-Tebligat'],
  [3, 'Cuma', 'LinkedIn', 'Checklist', 'Denemeye başlayan büronun ilk gün yapması gereken 5 şey', 'İsterseniz birlikte kurulum yapabiliriz.', 'Onboarding'],
  [3, 'Cuma', 'Blog', 'SEO yazısı', 'Mali Müşavirler İçin Otomasyon Araçları', '14 gün ücretsiz deneyin.', 'Brief 3'],
  [4, 'Pazartesi', 'LinkedIn', 'Metin post', 'Manuel e-tebligat takibinde kaçan küçük işler nasıl büyür?', 'E-tebligat modülünü birlikte test edebiliriz.', 'Risk anlatımı'],
  [4, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'PDF/CSV/Excel dosyasında şablonla dönüşüm örneği', 'Demo videosunu yorumlara bırakıyorum.', 'Excel şablon'],
  [4, 'Cuma', 'LinkedIn', 'Doküman post', 'Haftalık e-tebligat kontrol listesi: 10 madde', 'Kontrol listesini isteyenlere gönderebilirim.', 'Kaydedilebilir içerik'],
  [4, 'Cuma', 'Blog', 'SEO yazısı', 'E-Tebligat Kontrol Listesi', '14 gün ücretsiz deneyin.', 'Brief 4'],
  [5, 'Pazartesi', 'LinkedIn', 'Metin post', 'Bir SMMM bürosunda otomasyon önce hangi işten başlamalı?', '14 gün ücretsiz deneyebilirsiniz.', 'Karar rehberi'],
  [5, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Tarama sonrası yeni tebligatları filtreleme', 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'E-Tebligat'],
  [5, 'Cuma', 'LinkedIn', 'Metin post', 'Banka ekstresi düzenleme işinde asıl zaman kaybı nerede?', 'Excel modülünü birlikte test edebiliriz.', 'Problem analizi'],
  [5, 'Cuma', 'Blog', 'SEO yazısı', 'Muhasebe Bürolarında En Çok Zaman Kaybettiren 5 Rutin İş', '14 gün ücretsiz deneyin.', 'Brief 5'],
  [6, 'Pazartesi', 'LinkedIn', 'Metin post', 'Mükellef verisi neden mümkün olduğunca yerelde kalmalı?', 'Detayları merak ederseniz yazabilirsiniz.', 'Güven'],
  [6, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Mükellef ekleme ve e-tebligat kontrolüne hazırlık', '14 gün ücretsiz deneyebilirsiniz.', 'Kurulum'],
  [6, 'Cuma', 'LinkedIn', 'Checklist', 'Mükellef verisi güvenliği için küçük büro kontrol listesi', 'Kontrol listesini isteyenlere gönderebilirim.', 'Güven checklist'],
  [6, 'Cuma', 'Blog', 'SEO yazısı', 'Mükellef Verisi Nerede Saklanmalı?', '14 gün ücretsiz deneyin.', 'Brief 6'],
  [7, 'Pazartesi', 'LinkedIn', 'Metin post', 'Çok mükellefli bürolarda e-tebligat takibi neden ayrı bir sistem ister?', 'E-tebligat modülünü birlikte test edebiliriz.', 'ICP odaklı'],
  [7, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Toplu mükellef aktarımı ve tarama hazırlığı', 'Demo videosunu yorumlara bırakıyorum.', 'Toplu akış'],
  [7, 'Cuma', 'LinkedIn', 'Doküman post', 'Çok mükellefli bürolar için günlük takip akışı', 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'Süreç'],
  [7, 'Cuma', 'Blog', 'SEO yazısı', 'Çok Mükellefli Bürolarda GİB E-Tebligat Takibi Nasıl Yönetilir?', '14 gün ücretsiz deneyin.', 'Brief 7'],
  [8, 'Pazartesi', 'LinkedIn', 'Metin post', 'Excel şablonları muhasebe sürecinde neden küçük ama güçlü bir kaldıraçtır?', 'Excel modülünü birlikte test edebiliriz.', 'Excel'],
  [8, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Borç/alacak ayrı sütun dönüşümü', '14 gün ücretsiz deneyebilirsiniz.', 'Excel şablon'],
  [8, 'Cuma', 'LinkedIn', 'Checklist', 'Excel çıktısını muhasebeye aktarmadan önce kontrol edilecek 7 madde', 'Kontrol listesini isteyenlere gönderebilirim.', 'Kaydedilebilir'],
  [8, 'Cuma', 'Blog', 'SEO yazısı', 'Excel Şablonları Muhasebe Sürecini Nasıl Hızlandırır?', '14 gün ücretsiz deneyin.', 'Brief 8'],
  [9, 'Pazartesi', 'LinkedIn', 'Metin post', 'E-tebligat arşivinde mükellef bazlı düzen neden önemlidir?', 'E-tebligat modülünü birlikte test edebiliriz.', 'Arşiv'],
  [9, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Tebligat dokümanını görüntüleme ve arşivleme', 'Demo videosunu yorumlara bırakıyorum.', 'Doküman'],
  [9, 'Cuma', 'LinkedIn', 'Doküman post', 'E-tebligat arşivleme için klasör ve kayıt düzeni', 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'Arşiv rehberi'],
  [9, 'Cuma', 'Blog', 'SEO yazısı', 'E-Tebligat Arşivleme Nasıl Yapılmalı?', '14 gün ücretsiz deneyin.', 'Brief 9'],
  [10, 'Pazartesi', 'LinkedIn', 'Metin post', 'Yapay zeka muhasebe Excel işlerinde nerede işe yarar, nerede insan kontrolü gerekir?', 'Excel modülünü birlikte test edebiliriz.', 'AI'],
  [10, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'KDV ayıklama şablonu ile örnek dönüşüm', '14 gün ücretsiz deneyebilirsiniz.', 'AI + Excel'],
  [10, 'Cuma', 'LinkedIn', 'Metin post', 'AI destekli dönüşümde çıktı kontrolü nasıl yapılmalı?', 'Demo videosunu yorumlara bırakıyorum.', 'Güvenli kullanım'],
  [10, 'Cuma', 'Blog', 'SEO yazısı', 'Mali Müşavirler İçin Yapay Zeka Destekli Excel İşleri', '14 gün ücretsiz deneyin.', 'Brief 10'],
  [11, 'Pazartesi', 'LinkedIn', 'Metin post', '14 günlük denemede ilk gün ne test edilmeli?', 'İsterseniz birlikte kurulum yapabiliriz.', 'Deneme'],
  [11, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Deneme hesabında ilk işlem: e-tebligat veya Excel akışı', '14 gün ücretsiz deneyebilirsiniz.', 'Onboarding'],
  [11, 'Cuma', 'LinkedIn', 'Checklist', '14 günlük deneme planı: gün gün kontrol listesi', 'Kontrol listesini isteyenlere gönderebilirim.', 'Satışa bağlama'],
  [11, 'Cuma', 'Blog', 'SEO yazısı', 'SMMM Büroları İçin 14 Günlük Otomasyon Deneme Planı', '14 gün ücretsiz deneyin.', 'Brief 11'],
  [12, 'Pazartesi', 'LinkedIn', 'Metin post', 'E-tebligat programı seçerken yalnızca fiyat neden yeterli kriter değil?', 'E-tebligat modülünü birlikte test edebiliriz.', 'Satın alma'],
  [12, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'E-tebligat modülünde yeni tebligat paneli', 'Demo videosunu yorumlara bırakıyorum.', 'Ürün detayı'],
  [12, 'Cuma', 'LinkedIn', 'Doküman post', 'E-tebligat programı seçerken bakılacak 8 kriter', 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'Karar rehberi'],
  [12, 'Cuma', 'Blog', 'SEO yazısı', 'E-Tebligat Programı Seçerken Nelere Bakılmalı?', '14 gün ücretsiz deneyin.', 'Brief 12'],
  [13, 'Pazartesi', 'LinkedIn', 'Metin post', 'Son 12 haftada en çok konuşulan muhasebe otomasyonu sorunları', '14 gün ücretsiz deneyebilirsiniz.', 'Öğrenim paylaşımı'],
  [13, 'Çarşamba', 'YouTube Shorts + LinkedIn Video', 'Kısa demo', 'Tam Paket: Excel Asistanı + E-Tebligat Kontrol birlikte nasıl çalışır?', 'Demo videosunu yorumlara bırakıyorum.', 'Tam Paket'],
  [13, 'Cuma', 'LinkedIn', 'Metin post', "Muhasebe Asistanı'nı deneyen bürolardan öğrendiklerimiz", 'Kurulumda destek isterseniz mesaj atabilirsiniz.', 'Kanıt ve öğrenim'],
  [13, 'Cuma', 'Operasyon', 'Skor kartı', '90 gün değerlendirmesi ve sonraki 30 gün planı', 'Deneme ve demo akışını güçlendirin.', 'Retrospektif'],
];

const templateSeed = [
  {
    title: 'LinkedIn Bağlantı Mesajı',
    body: 'Merhaba {ad}, mali müşavir büroları için e-tebligat kontrolü ve Excel/ekstre dönüşümünü hızlandıran bir masaüstü araç geliştiriyorum. 14 günlük ücretsiz deneme açtık. Uygun olursa kısa bir demo linki paylaşabilirim.',
  },
  {
    title: 'Bağlantı Kabul Sonrası',
    body: 'Merhaba {ad}, teşekkür ederim.\n\nMuhasebe Asistanı şu iki işi hızlandırmak için geliştirildi:\n\n- GİB e-tebligat kontrolü ve mükellef bazlı takip.\n- PDF/Excel/CSV ekstreleri muhasebeye hazır formata dönüştürme.\n\nVeriler kullanıcının cihazında kalıyor; bulut tarafı yalnızca lisans kontrolü için kullanılıyor. İsterseniz 14 günlük deneme linkini paylaşayım.',
  },
  {
    title: 'Kısa Demo Daveti',
    body: 'Merhaba {ad}, bu hafta 10 dakikalık kısa bir demo gösterebilirim. Özellikle e-tebligat kontrolü veya Excel/ekstre dönüştürme tarafını görmek isterseniz ekran paylaşımıyla hızlıca geçebiliriz.',
  },
  {
    title: 'Deneme 1. Gün Takibi',
    body: 'Merhaba {ad}, Muhasebe Asistanı denemenizi gördüm. İlk işlemi tamamlayabildiniz mi?\n\nİsterseniz 10 dakikalık kurulum desteğiyle e-tebligat veya Excel modülünü birlikte çalıştırabiliriz.',
  },
  {
    title: 'Deneme 7. Gün Takibi',
    body: 'Merhaba {ad}, ilk haftadaki kullanımınızla ilgili kısa bir geri bildirim rica edebilir miyim?\n\nEn faydalı bulduğunuz özellik ve eksik kaldığını düşündüğünüz bir nokta varsa ürünü geliştirmek için çok değerli olur.',
  },
  {
    title: 'Referans İsteği',
    body: 'Merhaba {ad}, Muhasebe Asistanı size fayda sağladıysa benzer iş yükü olan bir meslektaşınıza önerebilir misiniz?\n\nÖnerdiğiniz kişi deneme başlatırsa hesabınıza 1 ay ek kullanım tanımlayabiliriz.',
  },
];

const scoreFields = [
  ['linkedinPosts', 'LinkedIn post'],
  ['videos', 'Video'],
  ['seoPosts', 'SEO yazısı'],
  ['outreach', 'Birebir temas'],
  ['comments', 'LinkedIn yorum'],
  ['replies', 'Yanıt'],
  ['demoRequests', 'Demo talebi'],
  ['trials', 'Deneme'],
  ['firstActions', 'İlk işlem'],
  ['sales', 'Satış'],
  ['bestContent', 'En iyi içerik'],
  ['bestMessage', 'En iyi mesaj'],
  ['commonObjection', 'En sık itiraz'],
  ['nextDecision', 'Sonraki hafta kararı'],
];

let state = loadState();

function createInitialState() {
  return {
    currentWeek: 1,
    contentItems: contentSeed.map((item, index) => ({
      id: `content-${index + 1}`,
      week: item[0],
      day: item[1],
      channel: item[2],
      format: item[3],
      topic: item[4],
      cta: item[5],
      note: item[6],
      status: 'Taslak',
      done: false,
    })),
    contacts: [],
    templates: templateSeed.map((template, index) => ({ id: `template-${index + 1}`, ...template })),
    weeklyMetrics: Array.from({ length: 13 }, (_, index) => ({
      week: index + 1,
      linkedinPosts: 0,
      videos: 0,
      seoPosts: 0,
      outreach: 0,
      comments: 0,
      replies: 0,
      demoRequests: 0,
      trials: 0,
      firstActions: 0,
      sales: 0,
      bestContent: '',
      bestMessage: '',
      commonObjection: '',
      nextDecision: '',
    })),
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createInitialState();
    return { ...createInitialState(), ...JSON.parse(saved) };
  } catch {
    return createInitialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function setView(view) {
  $all('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $all('.view').forEach((section) => section.classList.remove('active'));
  $(`#${view}View`).classList.add('active');
  $('#viewTitle').textContent = {
    dashboard: 'Dashboard',
    content: 'İçerik Takvimi',
    contacts: 'Potansiyel Müşteriler',
    templates: 'Mesaj Şablonları',
    scorecard: 'Skor Kartı',
  }[view];
  render();
}

function renderWeekSelectors() {
  const options = Array.from({ length: 13 }, (_, index) => {
    const week = index + 1;
    return `<option value="${week}">Hafta ${week}</option>`;
  }).join('');
  $('#currentWeek').innerHTML = options;
  $('#currentWeek').value = state.currentWeek;
  $('#contentWeekFilter').innerHTML = `<option value="all">Tüm haftalar</option>${options}`;
  $('#contentWeekFilter').value = $('#contentWeekFilter').value || String(state.currentWeek);
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function getCurrentMetrics() {
  return state.weeklyMetrics.find((item) => item.week === Number(state.currentWeek));
}

function renderDashboard() {
  const currentMetrics = getCurrentMetrics();
  const weekItems = state.contentItems.filter((item) => item.week === Number(state.currentWeek));
  const completed = weekItems.filter((item) => item.done || item.status === 'Yayınlandı').length;
  const dueFollowups = getDueFollowups();

  $('#metricsGrid').innerHTML = [
    metric('İçerik', `${completed}/${weekItems.length}`),
    metric('Temas', currentMetrics.outreach),
    metric('Yanıt', currentMetrics.replies),
    metric('Demo', currentMetrics.demoRequests),
    metric('Deneme', currentMetrics.trials),
    metric('Satış', currentMetrics.sales),
  ].join('');

  $('#weekCompletion').textContent = `${completed}/${weekItems.length} tamamlandı`;
  $('#weekTasks').innerHTML = weekItems
    .map(
      (item) => `
        <div class="task-row">
          <input type="checkbox" data-content-done="${item.id}" ${item.done ? 'checked' : ''} aria-label="${escapeHtml(item.topic)} tamamlandı" />
          <div>
            <strong>${escapeHtml(item.day)} · ${escapeHtml(item.channel)}</strong>
            <div>${escapeHtml(item.topic)}</div>
            <div class="task-meta">${escapeHtml(item.format)} · ${escapeHtml(item.cta)}</div>
          </div>
          <select class="status" data-content-status="${item.id}">
            ${statusOptions(item.status)}
          </select>
        </div>
      `
    )
    .join('');

  $('#followupCount').textContent = `${dueFollowups.length} kişi`;
  $('#followupList').innerHTML =
    dueFollowups.length === 0
      ? '<p class="muted">Bugün takip bekleyen kişi yok.</p>'
      : dueFollowups
          .slice(0, 8)
          .map(
            (contact) => `
              <div class="contact-mini">
                <strong>${escapeHtml(contact.name || 'İsimsiz kişi')}</strong>
                <span class="muted">${escapeHtml(contact.company || '-')} · ${escapeHtml(contact.status || '-')}</span>
                <span>${escapeHtml(contact.nextAction || 'Takip et')}</span>
              </div>
            `
          )
          .join('');
}

function statusOptions(selected) {
  return ['Taslak', 'Hazır', 'Yayınlandı', 'Yeniden kullanılacak']
    .map((status) => `<option ${selected === status ? 'selected' : ''}>${status}</option>`)
    .join('');
}

function renderContent() {
  const weekFilter = $('#contentWeekFilter').value || 'all';
  const statusFilter = $('#contentStatusFilter').value || 'all';
  const rows = state.contentItems.filter((item) => {
    const weekMatches = weekFilter === 'all' || item.week === Number(weekFilter);
    const statusMatches = statusFilter === 'all' || item.status === statusFilter;
    return weekMatches && statusMatches;
  });

  $('#contentRows').innerHTML = rows
    .map(
      (item) => `
        <tr>
          <td>${item.week}</td>
          <td>${escapeHtml(item.day)}</td>
          <td>${escapeHtml(item.channel)}<br><span class="muted">${escapeHtml(item.format)}</span></td>
          <td><strong>${escapeHtml(item.topic)}</strong><br><span class="muted">${escapeHtml(item.note)}</span></td>
          <td>${escapeHtml(item.cta)}</td>
          <td>
            <select data-content-status="${item.id}">
              ${statusOptions(item.status)}
            </select>
          </td>
        </tr>
      `
    )
    .join('');
}

function getDueFollowups() {
  const today = new Date().toISOString().slice(0, 10);
  return state.contacts.filter((contact) => {
    return contact.nextActionDate && contact.nextActionDate <= today && !['Satın aldı', 'Uygun değil'].includes(contact.status);
  });
}

function renderContacts() {
  const search = ($('#contactSearch').value || '').toLocaleLowerCase('tr-TR');
  const rows = state.contacts.filter((contact) => {
    return [contact.name, contact.company, contact.city, contact.status, contact.note]
      .join(' ')
      .toLocaleLowerCase('tr-TR')
      .includes(search);
  });

  $('#contactRows').innerHTML =
    rows.length === 0
      ? '<tr><td colspan="7" class="muted">Henüz kişi eklenmedi.</td></tr>'
      : rows
          .map(
            (contact) => `
              <tr>
                <td>
                  <strong>${escapeHtml(contact.name || '-')}</strong><br>
                  <span class="muted">${escapeHtml(contact.email || contact.phone || '')}</span>
                </td>
                <td>${escapeHtml(contact.company || '-')}</td>
                <td>${escapeHtml(contact.city || '-')}</td>
                <td>
                  <select data-contact-field="${contact.id}" data-field="status">
                    ${contactStatusOptions(contact.status)}
                  </select>
                </td>
                <td>
                  <input type="date" value="${escapeHtml(contact.nextActionDate || '')}" data-contact-field="${contact.id}" data-field="nextActionDate" />
                  <textarea data-contact-field="${contact.id}" data-field="nextAction">${escapeHtml(contact.nextAction || '')}</textarea>
                </td>
                <td><textarea data-contact-field="${contact.id}" data-field="note">${escapeHtml(contact.note || '')}</textarea></td>
                <td><button class="button danger" type="button" data-delete-contact="${contact.id}">Sil</button></td>
              </tr>
            `
          )
          .join('');
}

function contactStatusOptions(selected) {
  return ['Araştırılacak', 'Bağlantı gönderildi', 'Yanıt bekleniyor', 'Demo istendi', 'Deneme başladı', 'Takip gerekiyor', 'Satın aldı', 'Uygun değil']
    .map((status) => `<option ${selected === status ? 'selected' : ''}>${status}</option>`)
    .join('');
}

function renderTemplates() {
  const name = $('#templateName').value || '{ad}';
  const company = $('#templateCompany').value || '{büro}';
  $('#templateGrid').innerHTML = state.templates
    .map((template) => {
      const body = template.body.replaceAll('{ad}', name).replaceAll('{büro}', company);
      return `
        <article class="template-card">
          <div class="panel-heading">
            <h4>${escapeHtml(template.title)}</h4>
            <button class="button secondary" type="button" data-copy-template="${template.id}">Kopyala</button>
          </div>
          <pre id="${template.id}-body">${escapeHtml(body)}</pre>
        </article>
      `;
    })
    .join('');
}

function renderScorecard() {
  const metrics = getCurrentMetrics();
  $('#scoreForm').innerHTML = scoreFields
    .map(([field, label]) => {
      const isText = ['bestContent', 'bestMessage', 'commonObjection', 'nextDecision'].includes(field);
      if (isText) {
        return `
          <label class="wide">
            ${label}
            <textarea name="${field}" rows="2">${escapeHtml(metrics[field])}</textarea>
          </label>
        `;
      }
      return `
        <label>
          ${label}
          <input name="${field}" type="number" min="0" value="${Number(metrics[field] || 0)}" />
        </label>
      `;
    })
    .join('') + '<button class="button primary" type="submit">Haftayı kaydet</button>';

  $('#scoreRows').innerHTML = state.weeklyMetrics
    .map(
      (item) => `
        <tr>
          <td>${item.week}</td>
          <td>${item.outreach}</td>
          <td>${item.replies}</td>
          <td>${item.demoRequests}</td>
          <td>${item.trials}</td>
          <td>${item.sales}</td>
          <td>${escapeHtml(item.nextDecision || '-')}</td>
        </tr>
      `
    )
    .join('');
}

function render() {
  renderWeekSelectors();
  renderDashboard();
  renderContent();
  renderContacts();
  renderTemplates();
  renderScorecard();
}

function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '');
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(',')
    )
    .join('\n');
}

function exportContentCsv() {
  const rows = [['Hafta', 'Gün', 'Kanal', 'Format', 'Konu', 'CTA', 'Not', 'Durum']];
  state.contentItems.forEach((item) => rows.push([item.week, item.day, item.channel, item.format, item.topic, item.cta, item.note, item.status]));
  downloadFile('marketing-icerik-takvimi.csv', toCsv(rows), 'text/csv;charset=utf-8');
}

function exportContactsCsv() {
  const rows = [['Tarih', 'Şehir', 'Büro Adı', 'Kişi Adı', 'LinkedIn', 'E-posta', 'Telefon', 'Durum', 'Sonraki Aksiyon', 'Sonraki Aksiyon Tarihi', 'Not']];
  state.contacts.forEach((contact) => rows.push([contact.createdAt, contact.city, contact.company, contact.name, contact.linkedin, contact.email, contact.phone, contact.status, contact.nextAction, contact.nextActionDate, contact.note]));
  downloadFile('marketing-potansiyel-musteriler.csv', toCsv(rows), 'text/csv;charset=utf-8');
}

function exportScorecardCsv() {
  const rows = [['Hafta', ...scoreFields.map((field) => field[1])]];
  state.weeklyMetrics.forEach((item) => rows.push([item.week, ...scoreFields.map(([field]) => item[field])]));
  downloadFile('marketing-haftalik-skor-karti.csv', toCsv(rows), 'text/csv;charset=utf-8');
}

function bindEvents() {
  $all('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  document.body.addEventListener('click', (event) => {
    const jump = event.target.closest('[data-view-jump]');
    if (jump) setView(jump.dataset.viewJump);

    const deleteButton = event.target.closest('[data-delete-contact]');
    if (deleteButton) {
      state.contacts = state.contacts.filter((contact) => contact.id !== deleteButton.dataset.deleteContact);
      saveState();
      render();
      showToast('Kişi silindi.');
    }

    const copyButton = event.target.closest('[data-copy-template]');
    if (copyButton) {
      const body = $(`#${copyButton.dataset.copyTemplate}-body`).innerText;
      navigator.clipboard.writeText(body).then(() => showToast('Mesaj kopyalandı.'));
    }
  });

  document.body.addEventListener('change', (event) => {
    const statusInput = event.target.closest('[data-content-status]');
    if (statusInput) {
      const item = state.contentItems.find((content) => content.id === statusInput.dataset.contentStatus);
      item.status = statusInput.value;
      item.done = statusInput.value === 'Yayınlandı';
      saveState();
      render();
    }

    const doneInput = event.target.closest('[data-content-done]');
    if (doneInput) {
      const item = state.contentItems.find((content) => content.id === doneInput.dataset.contentDone);
      item.done = doneInput.checked;
      item.status = doneInput.checked ? 'Yayınlandı' : 'Taslak';
      saveState();
      render();
    }

    const contactField = event.target.closest('[data-contact-field]');
    if (contactField) {
      const contact = state.contacts.find((item) => item.id === contactField.dataset.contactField);
      contact[contactField.dataset.field] = contactField.value;
      saveState();
      renderDashboard();
    }
  });

  document.body.addEventListener('input', (event) => {
    if (event.target.matches('#contactSearch')) renderContacts();
    if (event.target.matches('#templateName, #templateCompany')) renderTemplates();
  });

  $('#currentWeek').addEventListener('change', (event) => {
    state.currentWeek = Number(event.target.value);
    saveState();
    render();
  });

  $('#contentWeekFilter').addEventListener('change', renderContent);
  $('#contentStatusFilter').addEventListener('change', renderContent);

  $('#contactForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    state.contacts.unshift({
      id: `contact-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      note: '',
      ...data,
    });
    event.target.reset();
    saveState();
    render();
    showToast('Kişi eklendi.');
  });

  $('#scoreForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const metrics = getCurrentMetrics();
    scoreFields.forEach(([field]) => {
      metrics[field] = ['bestContent', 'bestMessage', 'commonObjection', 'nextDecision'].includes(field)
        ? data[field] || ''
        : Number(data[field] || 0);
    });
    saveState();
    render();
    showToast('Skor kartı kaydedildi.');
  });

  $('#exportContent').addEventListener('click', exportContentCsv);
  $('#exportContacts').addEventListener('click', exportContactsCsv);
  $('#exportScorecard').addEventListener('click', exportScorecardCsv);
  $('#exportAll').addEventListener('click', () => downloadFile('marketing-os-yedek.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8'));

  $('#importBackup').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = { ...createInitialState(), ...JSON.parse(reader.result) };
        saveState();
        render();
        showToast('Yedek yüklendi.');
      } catch {
        showToast('Yedek dosyası okunamadı.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  $('#resetData').addEventListener('click', () => {
    if (!window.confirm('Tüm panel verileri sıfırlansın mı?')) return;
    state = createInitialState();
    saveState();
    render();
    showToast('Veriler sıfırlandı.');
  });
}

bindEvents();
render();
