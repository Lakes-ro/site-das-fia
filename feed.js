// ============================================
// 6º ESPAÇO — FEED COLETIVO + SOCIAL
// Curtidas, comentários, lightbox, preview de vídeo.
// RLS no banco filtra o que cada usuário pode ver.
// ============================================

let _currentUserId   = null;
let _currentUserRole = null;
let _currentUserName = null;

// ---- Bootstrap: carrega identidade uma vez ----

const _initFeedIdentity = async () => {
  if (_currentUserId) return;
  const user    = await getUser();
  const profile = await getProfile(user.id);
  _currentUserId   = user.id;
  _currentUserRole = profile.role;
  _currentUserName = profile.full_name || profile.username || 'Você';
};

// ============================================
// RENDERIZAÇÃO DE CARDS
// ============================================

const _renderMedia = (entry) => {
  if (!entry.media_urls?.length) return '';
  const url = entry.media_urls[0];
  const isVideo = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

  if (isVideo) {
    return `
      <div class="entry-media-wrap">
        <video class="entry-media entry-video" controls preload="metadata" playsinline>
          <source src="${url}">
          Seu navegador não suporta vídeo.
        </video>
      </div>`;
  }
  return `
    <div class="entry-media-wrap">
      <img
        src="${url}"
        alt="Foto do post"
        class="entry-media entry-photo"
        loading="lazy"
        onclick="openLightbox('${url}')"
        title="Clique para ampliar"
      >
    </div>`;
};

const createFeedCard = (entry, reactions, comments, userReacted) => {
  const profile    = entry.profiles;
  const date       = new Date(entry.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const initials   = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  const likeCount  = reactions?.length || 0;
  const commentCount = comments?.length || 0;

  const showPrivateBadge = _currentUserRole === 'pai' && !entry.is_shared;
  const badgeClass = showPrivateBadge ? 'private' : 'shared';
  const badgeText  = showPrivateBadge ? '🔒 Privado' : '🌟 Compartilhado';

  // Comentários renderizados
  const commentsHtml = comments?.length
    ? comments.map(c => {
        const ci = c.profiles?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
        const cd = new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const canDelete = _currentUserRole === 'pai' || c.user_id === _currentUserId;
        return `
          <div class="comment-item" data-comment-id="${c.id}">
            <div class="comment-avatar">${ci}</div>
            <div class="comment-body">
              <div class="comment-author">${c.profiles?.full_name || 'Anônimo'} <span class="comment-time">${cd}</span></div>
              <div class="comment-text">${c.content}</div>
            </div>
            ${canDelete ? `<button class="comment-delete" onclick="deleteComment('${c.id}','${entry.id}')" title="Excluir">✕</button>` : ''}
          </div>`;
      }).join('')
    : '';

  return `
    <div class="entry-card social-card" data-entry-id="${entry.id}">
      <div class="entry-header">
        <div class="entry-author">
          <div class="entry-avatar">${initials}</div>
          <div class="entry-meta">
            <div class="entry-name">${profile?.full_name || 'Anônimo'}</div>
            <div class="entry-date">${date}</div>
          </div>
        </div>
        <span class="entry-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div class="entry-content">${entry.content}</div>

      ${_renderMedia(entry)}

      <!-- Barra de ações sociais -->
      <div class="social-bar">
        <button
          class="social-btn like-btn ${userReacted ? 'liked' : ''}"
          onclick="toggleReaction('${entry.id}')"
          title="${userReacted ? 'Remover curtida' : 'Curtir'}"
        >
          <span class="like-icon">${userReacted ? '❤️' : '🤍'}</span>
          <span class="like-count">${likeCount > 0 ? likeCount : ''}</span>
        </button>
        <button
          class="social-btn comment-toggle-btn"
          onclick="toggleComments('${entry.id}')"
          title="Comentários"
        >
          💬 <span>${commentCount > 0 ? commentCount : ''}</span>
        </button>
      </div>

      <!-- Seção de comentários (colapsável) -->
      <div class="comments-section" id="comments-${entry.id}" style="display:none;">
        <div class="comments-list" id="comments-list-${entry.id}">
          ${commentsHtml}
        </div>
        <div class="comment-form">
          <div class="comment-input-row">
            <div class="comment-self-avatar">${_currentUserName.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}</div>
            <input
              type="text"
              class="comment-input"
              id="comment-input-${entry.id}"
              placeholder="Escreva um comentário..."
              maxlength="1000"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitComment('${entry.id}')}"
            >
            <button class="comment-submit-btn" onclick="submitComment('${entry.id}')">Enviar</button>
          </div>
        </div>
      </div>
    </div>
  `;
};

// ============================================
// CARREGAMENTO DO FEED
// ============================================

const loadFeed = async () => {
  const feedList = document.getElementById('feedList');
  if (!feedList) return;

  feedList.innerHTML = '<div class="loading">Carregando feed...</div>';

  try {
    await _initFeedIdentity();

    // Entradas — RLS filtra automaticamente por role
    const { data: entries, error: entriesError } = await supabaseClient
      .from('entries')
      .select('*, profiles:user_id(username, full_name, avatar_url)')
      .order('created_at', { ascending: false });

    if (entriesError) throw entriesError;

    if (!entries?.length) {
      feedList.innerHTML = `
        <div class="empty-state">
          <h3>O 6º Espaço está vazio</h3>
          <p>Seja o primeiro a compartilhar algo!</p>
        </div>`;
      return;
    }

    const entryIds = entries.map(e => e.id);

    // Busca reações e comentários em paralelo
    const [{ data: allReactions }, { data: allComments }] = await Promise.all([
      supabaseClient
        .from('reactions')
        .select('id, entry_id, user_id, emoji')
        .in('entry_id', entryIds),
      supabaseClient
        .from('comments')
        .select('id, entry_id, user_id, content, created_at, profiles:user_id(full_name)')
        .in('entry_id', entryIds)
        .order('created_at', { ascending: true })
    ]);

    // Agrupa por entry_id para acesso O(1)
    const reactionsMap = {};
    const commentsMap  = {};
    (allReactions || []).forEach(r => {
      if (!reactionsMap[r.entry_id]) reactionsMap[r.entry_id] = [];
      reactionsMap[r.entry_id].push(r);
    });
    (allComments || []).forEach(c => {
      if (!commentsMap[c.entry_id]) commentsMap[c.entry_id] = [];
      commentsMap[c.entry_id].push(c);
    });

    feedList.innerHTML = entries.map(e => {
      const reactions    = reactionsMap[e.id] || [];
      const comments     = commentsMap[e.id]  || [];
      const userReacted  = reactions.some(r => r.user_id === _currentUserId);
      return createFeedCard(e, reactions, comments, userReacted);
    }).join('');

  } catch (error) {
    console.error('Erro ao carregar feed:', error);
    feedList.innerHTML = `<div class="error-message">Erro ao carregar o feed: ${error.message}</div>`;
  }
};

// ============================================
// CURTIDAS
// ============================================

window.toggleReaction = async (entryId) => {
  try {
    await _initFeedIdentity();

    // Verifica se já curtiu
    const { data: existing } = await supabaseClient
      .from('reactions')
      .select('id')
      .eq('entry_id', entryId)
      .eq('user_id', _currentUserId)
      .maybeSingle();

    if (existing) {
      await supabaseClient.from('reactions').delete().eq('id', existing.id);
    } else {
      await supabaseClient.from('reactions').insert({
        entry_id: entryId,
        user_id:  _currentUserId,
        emoji:    '❤️'
      });
    }

    // Atualização otimista do botão sem recarregar o feed inteiro
    _refreshCardReactions(entryId);

  } catch (error) {
    console.error('Erro ao reagir:', error);
  }
};

// Atualiza só o botão de like do card sem re-renderizar tudo
const _refreshCardReactions = async (entryId) => {
  const { data: reactions } = await supabaseClient
    .from('reactions')
    .select('id, user_id')
    .eq('entry_id', entryId);

  const card = document.querySelector(`[data-entry-id="${entryId}"]`);
  if (!card) return;

  const btn        = card.querySelector('.like-btn');
  const icon       = card.querySelector('.like-icon');
  const count      = card.querySelector('.like-count');
  const userReacted = (reactions || []).some(r => r.user_id === _currentUserId);
  const likeCount  = reactions?.length || 0;

  if (btn)   btn.classList.toggle('liked', userReacted);
  if (icon)  icon.textContent = userReacted ? '❤️' : '🤍';
  if (count) count.textContent = likeCount > 0 ? likeCount : '';
};

// ============================================
// COMENTÁRIOS
// ============================================

window.toggleComments = (entryId) => {
  const section = document.getElementById(`comments-${entryId}`);
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    document.getElementById(`comment-input-${entryId}`)?.focus();
  }
};

window.submitComment = async (entryId) => {
  const input   = document.getElementById(`comment-input-${entryId}`);
  const content = input?.value.trim();
  if (!content) return;

  const btn = input?.nextElementSibling;
  if (btn) btn.disabled = true;
  input.value = '';

  try {
    await _initFeedIdentity();
    const { error } = await supabaseClient.from('comments').insert({
      entry_id: entryId,
      user_id:  _currentUserId,
      content
    });
    if (error) throw error;
    await _refreshCardComments(entryId);
  } catch (error) {
    console.error('Erro ao comentar:', error);
    if (input) input.value = content; // devolve o texto se falhou
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.deleteComment = async (commentId, entryId) => {
  if (!confirm('Excluir este comentário?')) return;
  try {
    const { error } = await supabaseClient
      .from('comments').delete().eq('id', commentId);
    if (error) throw error;
    await _refreshCardComments(entryId);
  } catch (error) {
    console.error('Erro ao excluir comentário:', error);
  }
};

// Recarrega só os comentários de um card específico
const _refreshCardComments = async (entryId) => {
  const list = document.getElementById(`comments-list-${entryId}`);
  if (!list) return;

  const { data: comments } = await supabaseClient
    .from('comments')
    .select('id, entry_id, user_id, content, created_at, profiles:user_id(full_name)')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });

  // Atualiza badge de contagem no botão
  const card = document.querySelector(`[data-entry-id="${entryId}"]`);
  const commentBtn = card?.querySelector('.comment-toggle-btn span');
  if (commentBtn) commentBtn.textContent = comments?.length || '';

  if (!comments?.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = comments.map(c => {
    const ci = c.profiles?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
    const cd = new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const canDelete = _currentUserRole === 'pai' || c.user_id === _currentUserId;
    return `
      <div class="comment-item" data-comment-id="${c.id}">
        <div class="comment-avatar">${ci}</div>
        <div class="comment-body">
          <div class="comment-author">${c.profiles?.full_name || 'Anônimo'} <span class="comment-time">${cd}</span></div>
          <div class="comment-text">${c.content}</div>
        </div>
        ${canDelete ? `<button class="comment-delete" onclick="deleteComment('${c.id}','${entryId}')" title="Excluir">✕</button>` : ''}
      </div>`;
  }).join('');

  // Scroll suave para o último comentário
  list.scrollTop = list.scrollHeight;
};

// ============================================
// LIGHTBOX
// ============================================

window.openLightbox = (url) => {
  let lb = document.getElementById('lightbox-overlay');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox-overlay';
    lb.innerHTML = `
      <div id="lightbox-backdrop"></div>
      <div id="lightbox-content">
        <img id="lightbox-img" src="" alt="Foto ampliada">
        <button id="lightbox-close" title="Fechar (Esc)">✕</button>
      </div>`;
    document.body.appendChild(lb);

    document.getElementById('lightbox-backdrop').onclick = closeLightbox;
    document.getElementById('lightbox-close').onclick    = closeLightbox;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  document.getElementById('lightbox-img').src = url;
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeLightbox = () => {
  const lb = document.getElementById('lightbox-overlay');
  if (lb) lb.classList.remove('active');
  document.body.style.overflow = '';
};

// ============================================
// REALTIME
// ============================================

const subscribeToFeed = () => {
  const feedView = document.getElementById('feedView');
  const isActive = () => feedView?.classList.contains('active');

  // Entradas novas/editadas
  supabaseClient.channel('feed-entries')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
      if (isActive()) loadFeed();
    })
    .subscribe();

  // Reações em tempo real
  supabaseClient.channel('feed-reactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
      if (isActive()) {
        const entryId = payload.new?.entry_id || payload.old?.entry_id;
        if (entryId) _refreshCardReactions(entryId);
      }
    })
    .subscribe();

  // Comentários em tempo real
  supabaseClient.channel('feed-comments')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
      if (isActive()) {
        const entryId = payload.new?.entry_id || payload.old?.entry_id;
        if (entryId) _refreshCardComments(entryId);
      }
    })
    .subscribe();
};

// Exportar
window.loadFeed        = loadFeed;
window.subscribeToFeed = subscribeToFeed;
window.createFeedCard  = createFeedCard;