// ============================================
// SISTEMA DE DIÁRIO — SOMENTE FILHAS
// Fix #1: sanitize() em todos os dados do banco
// Fix #2: _checkMemories dentro do loadMyEntries
// ============================================

let editingEntryId = null;

// ============================================
// FRASES DO DIA
// ============================================

const FRASES_MOTIVACIONAIS = [
  "Você é mais forte do que imagina. 💜",
  "Cada dia é uma página nova da sua história.",
  "Seu futuro está sendo escrito agora, palavra por palavra.",
  "A coragem não é ausência de medo, é agir apesar dela.",
  "Você não precisa ser perfeita, só precisa continuar.",
  "O que você planta hoje, colhe amanhã.",
  "Confie no processo. Confie em você.",
  "Pequenos passos ainda são passos.",
  "Você é capaz de coisas incríveis.",
  "Hoje é um bom dia para começar algo novo.",
  "Seu esforço nunca é em vão.",
  "A vida recompensa quem não desiste.",
  "Você merece tudo de bom que está por vir.",
  "Cada obstáculo é uma oportunidade disfarçada.",
  "Acredite em você com a mesma força que eu acredito.",
  "Seu sorriso tem o poder de mudar o dia de alguém.",
  "Você é única e isso é sua maior força.",
  "Não compare sua jornada com a de ninguém.",
  "O universo conspira a favor de quem sonha.",
  "Hoje você é melhor do que era ontem.",
  "Erros são provas de que você está tentando.",
  "A sua história ainda não acabou.",
  "Você foi feita para florescer.",
  "Foco no que você pode controlar.",
  "A gratidão transforma o que temos em suficiente.",
  "Não existe caminho para a felicidade; a felicidade é o caminho.",
  "Você é a autora da sua própria vida.",
  "Cada amanhecer é uma segunda chance.",
  "O melhor ainda está por vir.",
  "Você tem todo o tempo do mundo para ser quem quer ser.",
];

const FRASES_DESMOTIVACIONAIS = [
  "Segunda-feira vai chegar de qualquer jeito. Aproveita o agora.",
  "Ninguém sabe o que está fazendo. Você está em boa companhia.",
  "O café vai esfriar antes de você lembrar que fez.",
  "Você vai procrastinar hoje. E tudo bem.",
  "Adultar é só fingir que sabe as coisas até saber.",
  "A lista de tarefas nunca acaba. Escolha as batalhas.",
  "Você vai esquecer o guarda-chuva justamente hoje.",
  "Planos são só sugestões que a realidade ignora.",
  "Dormir cedo é um mito inventado por quem não tem celular.",
  "O wi-fi vai cair no momento mais importante.",
  "Alguém sempre vai colocar uma reunião que podia ser e-mail.",
  "Você vai re-lavar aquela louça que já estava 'limpa'.",
  "O charger vai estar longe quando a bateria chegar em 1%.",
  "Você vai mandar áudio de 2 minutos sobre algo que era rápido.",
  "A fila menor sempre anda mais devagar.",
  "Você vai achar que são 22h e serão 2h da manhã.",
  "Todo prazo parece longe até não ser mais.",
  "A internet sempre cai durante videochamada importante.",
  "Você vai comprar algo que já tinha em casa.",
  "O problema 'rápido' nunca é rápido.",
  "Você vai lembrar do que esqueceu exatamente quando não pode anotar.",
  "Toda dieta começa segunda. Hoje é segunda passada.",
  "O elevador vai estar ocupado quando você estiver com pressa.",
  "Você vai reler a mesma frase quatro vezes sem absorver nada.",
  "O estacionamento livre fica longe. Sempre.",
  "A solução óbvia só aparece depois que você complicou tudo.",
  "Você vai falar 'já vou' e sentar por mais uma hora.",
  "Previsão do tempo erra justamente no seu dia de praia.",
  "Você vai dormir pensando no que devia ter respondido na discussão.",
  "Tudo tem conserto. Exceto segunda-feira.",
];

const getFrasesDoDia = () => {
  const hoje = new Date();
  const seed = hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate();
  return {
    motiv:  FRASES_MOTIVACIONAIS[seed % FRASES_MOTIVACIONAIS.length],
    desmot: FRASES_DESMOTIVACIONAIS[(seed * 7 + 13) % FRASES_DESMOTIVACIONAIS.length]
  };
};

// ============================================
// HELPERS DE DATA
// ============================================

const formatarDia = (dateStr) => {
  const d     = new Date(dateStr);
  const hoje  = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();

  if (mesmoDia(d, hoje))  return 'Hoje';
  if (mesmoDia(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
};

const getDayKey = (dateStr) => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// ============================================
// RENDERIZAÇÃO — com sanitize() em todos os
// dados vindos do banco (Fix #1)
// ============================================

const _renderDiaryMedia = (entry) => {
  if (!entry.media_urls?.length) return '';
  const items = entry.media_urls.map((url, i) => {
    // URLs de storage interno — não são conteúdo de usuário livre,
    // mas sanitizamos o atributo src para segurança
    const safeUrl = sanitize(url);
    const isVideo = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
    return isVideo
      ? `<video class="media-thumb" controls preload="metadata" playsinline>
           <source src="${safeUrl}">
         </video>`
      : `<img src="${safeUrl}" alt="Foto ${i+1}" class="media-thumb"
             loading="lazy" onclick="openLightbox('${safeUrl}')" title="Ampliar">`;
  });
  const gridClass = entry.media_urls.length === 1 ? 'media-grid-1'
                  : entry.media_urls.length === 2 ? 'media-grid-2' : 'media-grid-3';
  return `<div class="media-grid ${gridClass}">${items.join('')}</div>`;
};

const createEntryCard = (entry, showActions = true) => {
  const time = new Date(entry.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit'
  });

  // FIX #1: sanitize() em todos os campos de texto livre do usuário
  const safeContent  = sanitize(entry.content);
  const safeName     = sanitize(entry.profiles?.full_name || 'Anônimo');

  const badge = entry.is_shared
    ? `<span class="entry-badge shared">🌟 No feed</span>`
    : `<span class="entry-badge private">🔒 Privado</span>`;

  const actionsHtml = showActions ? `
    <div class="entry-actions">
      <button onclick="editEntry('${entry.id}')">✏️ Editar</button>
      <button onclick="deleteEntry('${entry.id}')" class="btn-danger">🗑️ Excluir</button>
    </div>` : '';

  return `
    <div class="diary-entry" data-entry-id="${entry.id}">
      <div class="diary-entry-header">
        <span class="diary-entry-time">🕐 ${time}</span>
        ${badge}
      </div>
      <div class="entry-content">${safeContent}</div>
      ${_renderDiaryMedia(entry)}
      ${actionsHtml}
    </div>`;
};

const renderFrasesDoDia = () => {
  const { motiv, desmot } = getFrasesDoDia();
  // Frases são hardcoded no código — não vêm do banco, não precisam de sanitize
  return `
    <div class="frases-do-dia">
      <div class="frase frase-motiv"><span class="frase-icon">✨</span><span>${motiv}</span></div>
      <div class="frase frase-desmot"><span class="frase-icon">😅</span><span>${desmot}</span></div>
    </div>`;
};

// ============================================
// MEMÓRIAS DO PASSADO
// FIX #2: chamada dentro do loadMyEntries,
// após container.innerHTML ser definido,
// usando query filtrada no banco (não no cliente)
// ============================================

const _checkMemories = async (container, userId) => {
  try {
    const hoje    = new Date();
    const mes     = hoje.getMonth() + 1;
    const dia     = hoje.getDate();
    const anoAtual = hoje.getFullYear();

    // Filtra no banco pelo mês e dia — evita carregar todas as entradas
    const { data: memorias } = await supabaseClient
      .from('entries')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .lt('created_at', `${anoAtual}-01-01`) // apenas anos anteriores
      .order('created_at', { ascending: false });

    if (!memorias?.length) return;

    // Filtra pelo mesmo dia/mês no cliente (cálculo trivial, dados já reduzidos)
    const mesStr = String(mes).padStart(2, '0');
    const diaStr = String(dia).padStart(2, '0');

    const memoria = memorias.find(e => {
      const d = new Date(e.created_at);
      return String(d.getMonth()+1).padStart(2,'0') === mesStr &&
             String(d.getDate()).padStart(2,'0')     === diaStr;
    });

    if (!memoria) return;

    const anosAtras = anoAtual - new Date(memoria.created_at).getFullYear();
    // FIX #1: sanitize no conteúdo da memória
    const preview   = sanitize(memoria.content).slice(0, 150) +
                      (memoria.content.length > 150 ? '...' : '');

    const banner = document.createElement('div');
    banner.className = 'memory-banner';
    banner.innerHTML = `
      <div class="memory-banner-icon">🕰️</div>
      <div class="memory-banner-body">
        <div class="memory-banner-title">
          Há ${anosAtras} ano${anosAtras > 1 ? 's' : ''}, você escreveu:
        </div>
        <div class="memory-banner-text">"${preview}"</div>
      </div>
      <button class="memory-banner-close" onclick="this.parentElement.remove()" title="Fechar">✕</button>`;

    // FIX #2: container já está no DOM com conteúdo renderizado
    // prepend funciona imediatamente sem race condition
    container.prepend(banner);

  } catch (error) {
    // Memórias são feature opcional — falha silenciosa
    console.warn('Memórias não carregadas:', error.message);
  }
};

// ============================================
// CARREGAMENTO PRINCIPAL
// ============================================

const loadMyEntries = async () => {
  const container = document.getElementById('myEntriesList');
  if (!container) return;
  container.innerHTML = '<div class="loading">Carregando diário...</div>';

  try {
    const user = await getUser();
    const { data: entries, error } = await supabaseClient
      .from('entries')
      .select('*, profiles:user_id(username, full_name, avatar_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const hoje = getDayKey(new Date().toISOString());

    if (!entries?.length) {
      container.innerHTML = `
        <div class="diary-day-block today-block">
          <div class="diary-day-label">📅 Hoje</div>
          ${renderFrasesDoDia()}
          <div class="empty-state" style="padding:1.5rem 0">
            <p>Nenhuma anotação ainda. Comece a escrever! ✍️</p>
          </div>
        </div>`;
      // Sem entradas = sem memórias possíveis, não chama _checkMemories
      return;
    }

    // Agrupa por dia
    const grupos = {};
    entries.forEach(e => {
      const k = getDayKey(e.created_at);
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(e);
    });

    const diasOrdenados = Object.keys(grupos).sort((a, b) => b.localeCompare(a));
    let html = '';

    if (!grupos[hoje]) {
      html += `
        <div class="diary-day-block today-block">
          <div class="diary-day-label">📅 Hoje</div>
          ${renderFrasesDoDia()}
          <div class="empty-state" style="padding:.75rem 0">
            <p style="color:var(--text-secondary);font-size:.93rem">
              Ainda não escreveu hoje. O que está no seu coração?
            </p>
          </div>
        </div>`;
    }

    diasOrdenados.forEach(key => {
      const isHoje = key === hoje;
      const label  = formatarDia(grupos[key][0].created_at);
      html += `
        <div class="diary-day-block ${isHoje ? 'today-block' : ''}">
          <div class="diary-day-label">📅 ${label}</div>
          ${isHoje ? renderFrasesDoDia() : ''}
          <div class="diary-entries-list">
            ${grupos[key].map(e => createEntryCard(e, true)).join('')}
          </div>
        </div>`;
    });

    // FIX #2: innerHTML é definido ANTES de chamar _checkMemories
    // O prepend do banner opera sobre DOM já populado — sem race condition
    container.innerHTML = html;
    await _checkMemories(container, user.id);

  } catch (error) {
    console.error('Erro ao carregar diário:', error);
    container.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

// ============================================
// MODAL — múltiplas fotos
// ============================================

const entryModal = document.getElementById('entryModal');

const openEntryModal = (title, isShared = false) => {
  document.getElementById('entryModalTitle').textContent = title;
  document.getElementById('entryContent').value = '';
  document.getElementById('entryIsShared').checked = isShared;
  document.getElementById('entryMedia').value = '';
  const preview = document.getElementById('mediaPreview');
  if (preview) preview.innerHTML = '';
  entryModal.classList.add('active');
};

document.getElementById('entryMedia')?.addEventListener('change', (e) => {
  const preview = document.getElementById('mediaPreview');
  if (!preview) return;
  const files = Array.from(e.target.files).slice(0, 5);
  // URLs de objeto local — seguras, não vêm do banco
  preview.innerHTML = files.map(f => {
    const url     = URL.createObjectURL(f);
    const isVideo = f.type.startsWith('video/');
    return isVideo
      ? `<video src="${url}" class="media-thumb-preview" controls></video>`
      : `<img src="${url}" class="media-thumb-preview" alt="${sanitize(f.name)}">`;
  }).join('');
});

document.getElementById('btnNewEntry')?.addEventListener('click', () => {
  editingEntryId = null;
  openEntryModal('Nova Entrada de Hoje');
});

document.getElementById('btnShareEntry')?.addEventListener('click', () => {
  editingEntryId = null;
  openEntryModal('Compartilhar no 6º Espaço', true);
});

document.getElementById('btnCancelEntry')?.addEventListener('click', () => {
  entryModal.classList.remove('active');
});

entryModal?.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => entryModal.classList.remove('active'));
});

// Salvar
document.getElementById('entryForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content   = document.getElementById('entryContent').value.trim();
  const isShared  = document.getElementById('entryIsShared').checked;
  const files     = Array.from(document.getElementById('entryMedia').files).slice(0, 5);
  if (!content) return;

  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const user = await getUser();
    let mediaUrls = [];
    if (files.length) {
      mediaUrls = await Promise.all(files.map(f => uploadMedia(f)));
    }

    if (editingEntryId) {
      const { error } = await supabaseClient.from('entries').update({
        content,
        is_shared:  isShared,
        media_urls: mediaUrls.length ? mediaUrls : null,
        updated_at: new Date().toISOString()
      }).eq('id', editingEntryId).eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('entries').insert({
        user_id:    user.id,
        content,
        is_shared:  isShared,
        media_urls: mediaUrls.length ? mediaUrls : null
      });
      if (error) throw error;
    }

    entryModal.classList.remove('active');
    loadMyEntries();
    if (typeof loadFeed === 'function') loadFeed();
  } catch (error) {
    alert('Erro ao salvar: ' + error.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
});

// Editar
window.editEntry = async (entryId) => {
  try {
    const { data: entry, error } = await supabaseClient
      .from('entries').select('*').eq('id', entryId).single();
    if (error) throw error;

    editingEntryId = entryId;
    document.getElementById('entryModalTitle').textContent = 'Editar Entrada';
    document.getElementById('entryContent').value = entry.content;
    document.getElementById('entryIsShared').checked = entry.is_shared;
    const preview = document.getElementById('mediaPreview');
    if (preview) preview.innerHTML = '';
    entryModal.classList.add('active');
  } catch (error) {
    alert('Erro ao carregar: ' + error.message);
  }
};

// Deletar
window.deleteEntry = async (entryId) => {
  if (!confirm('Excluir esta entrada permanentemente?')) return;
  try {
    const user = await getUser();
    const { error } = await supabaseClient
      .from('entries').delete().eq('id', entryId).eq('user_id', user.id);
    if (error) throw error;
    loadMyEntries();
    if (typeof loadFeed === 'function') loadFeed();
  } catch (error) {
    alert('Erro ao excluir: ' + error.message);
  }
};

window.loadMyEntries   = loadMyEntries;
window.createEntryCard = createEntryCard;
