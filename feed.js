// ============================================
// 6º ESPAÇO — FEED COLETIVO + SOCIAL
// Fix #1: sanitize() em todos os dados do banco
// ============================================

let _currentUserId   = null;
let _currentUserRole = null;
let _currentUserName = null;

const EMOJIS = ['❤️','😂','😮','😢','🔥','👏'];

const _initFeedIdentity = async () => {
  if (_currentUserId) return;
  const user    = await getUser();
  const profile = await getProfile(user.id);
  _currentUserId   = user.id;
  _currentUserRole = profile.role;
  _currentUserName = profile.full_name || profile.username || 'Você';
};

// ============================================
// MÍDIA
// ============================================

const _renderMedia = (entry) => {
  if (!entry.media_urls?.length) return '';
  const items = entry.media_urls.map((url, i) => {
    const safeUrl = sanitize(url);
    const isVideo = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
    return isVideo
      ? `<video class="media-thumb" controls preload="metadata" playsinline>
           <source src="${safeUrl}">
         </video>`
      : `<img src="${safeUrl}" alt="Foto ${i+1}" class="media-thumb"
             loading="lazy" onclick="openLightbox('${safeUrl}')" title="Clique para ampliar">`;
  });
  const gridClass = entry.media_urls.length === 1 ? 'media-grid-1'
                  : entry.media_urls.length === 2 ? 'media-grid-2' : 'media-grid-3';
  return `<div class="media-grid ${gridClass}">${items.join('')}</div>`;
};

// ============================================
// CARD DO FEED — Fix #1
// ============================================

const createFeedCard = (entry, reactions, comments, userEmoji) => {
  const profile = entry.profiles;
  const date    = new Date(entry.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // FIX #1: sanitize em todos os campos de texto livre
  const safeName    = sanitize(profile?.full_name || 'Anônimo');
  const safeContent = sanitize(entry.content);
  const initials    = (profile?.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase();

  const commentCount = comments?.length || 0;
  const emojiCounts  = {};
  (reactions || []).forEach(r => { emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1; });
  const totalReactions = reactions?.length || 0;

  const showPrivateBadge = _currentUserRole === 'pai' && !entry.is_shared;
  const badgeClass = showPrivateBadge ? 'private' : 'shared';
  const badgeText  = showPrivateBadge ? '🔒 Privado' : '🌟 Compartilhado';

  const commentsHtml = (comments || []).map(c => _renderComment(c)).join('');

  const selfInitials = _currentUserName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return `
    <div class="entry-card social-card" data-entry-id="${entry.id}">
      <div class="entry-header">
        <div class="entry-author">
          <div class="entry-avatar">${initials}</div>
          <div class="entry-meta">
            <div class="entry-name">${safeName}</div>
            <div class="entry-date">${date}</div>
          </div>
        </div>
        <span class="entry-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div class="entry-content">${safeContent}</div>
      ${_renderMedia(entry)}

      <div class="social-bar">
        <div class="reactions-bar">
          ${Object.entries(emojiCounts).map(([emoji, count]) => `
            <span class="reaction-chip ${userEmoji === emoji ? 'mine' : ''}"
                  onclick="toggleReaction('${entry.id}','${emoji}')">
              ${emoji} ${count}
            </span>`).join('')}
          <div class="emoji-picker-wrap">
            <button class="social-btn emoji-trigger"
                    onclick="toggleEmojiPicker('${entry.id}')">
              ${userEmoji || '🤍'} ${totalReactions > 0 ? totalReactions : ''}
            </button>
            <div class="emoji-picker" id="emoji-picker-${entry.id}" style="display:none;">
              ${EMOJIS.map(e => `
                <button class="emoji-opt ${userEmoji === e ? 'selected' : ''}"
                        onclick="toggleReaction('${entry.id}','${e}')">
                  ${e}
                </button>`).join('')}
            </div>
          </div>
          <button class="social-btn comment-toggle-btn"
                  onclick="toggleComments('${entry.id}')">
            💬 <span>${commentCount > 0 ? commentCount : ''}</span>
          </button>
        </div>
      </div>

      <div class="comments-section" id="comments-${entry.id}" style="display:none;">
        <div class="comments-list" id="comments-list-${entry.id}">
          ${commentsHtml}
        </div>
        <div class="comment-form">
          <div class="comment-input-row">
            <div class="comment-self-avatar">${selfInitials}</div>
            <input type="text" class="comment-input" id="comment-input-${entry.id}"
              placeholder="Escreva um comentário..." maxlength="1000"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitComment('${entry.id}')}">
            <button class="comment-submit-btn" onclick="submitComment('${entry.id}')">Enviar</button>
          </div>
        </div>
      </div>
    </div>`;
};

// Comentário individual — centralizado para evitar duplicação
const _renderComment = (c) => {
  // FIX #1: sanitize em nome e conteúdo do comentário
  const safeName    = sanitize(c.profiles?.full_name || 'Anônimo');
  const safeContent = sanitize(c.content);
  const initials    = (c.profiles?.full_name || '?').split(' ').map(n => n[0]).join('').toUpperCase();
  const time        = new Date(c.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit'
  });
  const canDelete = _currentUserRole === 'pai' || c.user_id === _currentUserId;

  return `
    <div class="comment-item" data-comment-id="${c.id}">
      <div class="comment-avatar">${initials}</div>
      <div class="comment-body">
        <div class="comment-author">
          ${safeName} <span class="comment-time">${time}</span>
        </div>
        <div class="comment-text">${safeContent}</div>
      </div>
      ${canDelete
        ? `<button class="comment-delete"
               onclick="deleteComment('${c.id}','${c.entry_id}')"
               title="Excluir">✕</button>`
        : ''}
    </div>`;
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

    const [{ data: allReactions }, { data: allComments }] = await Promise.all([
      supabaseClient.from('reactions')
        .select('id, entry_id, user_id, emoji')
        .in('entry_id', entryIds),
      supabaseClient.from('comments')
        .select('id, entry_id, user_id, content, created_at, profiles:user_id(full_name)')
        .in('entry_id', entryIds)
        .order('created_at', { ascending: true })
    ]);

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
      const reactions  = reactionsMap[e.id] || [];
      const comments   = commentsMap[e.id]  || [];
      const myReaction = reactions.find(r => r.user_id === _currentUserId);
      return createFeedCard(e, reactions, comments, myReaction?.emoji || null);
    }).join('');

  } catch (error) {
    console.error('Erro ao carregar feed:', error);
    feedList.innerHTML = `<div class="error-message">Erro ao carregar o feed.</div>`;
  }
};

// ============================================
// REAÇÕES
// ============================================

window.toggleEmojiPicker = (entryId) => {
  document.querySelectorAll('.emoji-picker').forEach(p => {
    if (p.id !== `emoji-picker-${entryId}`) p.style.display = 'none';
  });
  const picker = document.getElementById(`emoji-picker-${entryId}`);
  if (picker) picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.emoji-picker-wrap')) {
    document.querySelectorAll('.emoji-picker').forEach(p => p.style.display = 'none');
  }
});

window.toggleReaction = async (entryId, emoji) => {
  const picker = document.getElementById(`emoji-picker-${entryId}`);
  if (picker) picker.style.display = 'none';

  try {
    await _initFeedIdentity();
    const { data: existing } = await supabaseClient
      .from('reactions').select('id, emoji')
      .eq('entry_id', entryId).eq('user_id', _currentUserId).maybeSingle();

    if (existing) {
      if (existing.emoji === emoji) {
        await supabaseClient.from('reactions').delete().eq('id', existing.id);
      } else {
        await supabaseClient.from('reactions').update({ emoji }).eq('id', existing.id);
      }
    } else {
      await supabaseClient.from('reactions').insert({
        entry_id: entryId, user_id: _currentUserId, emoji
      });
    }
    _refreshCardReactions(entryId);
  } catch (error) {
    console.error('Erro ao reagir:', error);
  }
};

const _refreshCardReactions = async (entryId) => {
  const { data: reactions } = await supabaseClient
    .from('reactions').select('id, user_id, emoji').eq('entry_id', entryId);

  const card = document.querySelector(`[data-entry-id="${entryId}"]`);
  if (!card) return;

  const myReaction     = (reactions || []).find(r => r.user_id === _currentUserId);
  const totalReactions = reactions?.length || 0;
  const emojiCounts    = {};
  (reactions || []).forEach(r => { emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1; });

  const trigger = card.querySelector('.emoji-trigger');
  if (trigger) trigger.innerHTML = `${myReaction?.emoji || '🤍'} ${totalReactions > 0 ? totalReactions : ''}`;

  const bar = card.querySelector('.reactions-bar');
  if (bar) {
    bar.querySelectorAll('.reaction-chip').forEach(c => c.remove());
    const wrap = bar.querySelector('.emoji-picker-wrap');
    Object.entries(emojiCounts).forEach(([emoji, count]) => {
      const chip = document.createElement('span');
      chip.className = `reaction-chip ${myReaction?.emoji === emoji ? 'mine' : ''}`;
      chip.setAttribute('onclick', `toggleReaction('${entryId}','${emoji}')`);
      chip.textContent = `${emoji} ${count}`;
      bar.insertBefore(chip, wrap);
    });
    bar.querySelectorAll('.emoji-opt').forEach(btn => {
      btn.classList.toggle('selected', myReaction?.emoji === btn.textContent.trim());
    });
  }
};

// ============================================
// COMENTÁRIOS
// ============================================

window.toggleComments = (entryId) => {
  const section = document.getElementById(`comments-${entryId}`);
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) document.getElementById(`comment-input-${entryId}`)?.focus();
};

window.submitComment = async (entryId) => {
  const input   = document.getElementById(`comment-input-${entryId}`);
  const content = input?.value.trim();
  if (!content) return;
  const btn = input?.nextElementSibling;
  if (btn) btn.disabled = true;
  const savedContent = content;
  input.value = '';

  try {
    await _initFeedIdentity();
    const { error } = await supabaseClient.from('comments').insert({
      entry_id: entryId, user_id: _currentUserId, content
    });
    if (error) throw error;
    await _refreshCardComments(entryId);
  } catch (error) {
    console.error('Erro ao comentar:', error);
    if (input) input.value = savedContent;
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.deleteComment = async (commentId, entryId) => {
  if (!confirm('Excluir este comentário?')) return;
  try {
    await supabaseClient.from('comments').delete().eq('id', commentId);
    await _refreshCardComments(entryId);
  } catch (error) { console.error('Erro:', error); }
};

const _refreshCardComments = async (entryId) => {
  const list = document.getElementById(`comments-list-${entryId}`);
  if (!list) return;

  const { data: comments } = await supabaseClient
    .from('comments')
    .select('id, entry_id, user_id, content, created_at, profiles:user_id(full_name)')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: true });

  const card       = document.querySelector(`[data-entry-id="${entryId}"]`);
  const commentBtn = card?.querySelector('.comment-toggle-btn span');
  if (commentBtn) commentBtn.textContent = comments?.length || '';

  // FIX #1: _renderComment já aplica sanitize internamente
  list.innerHTML = (comments || []).map(c => _renderComment(c)).join('');
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  }
  // URL já vem sanitizada de _renderMedia — segura para src
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
// BUSCA NO DIÁRIO
// ============================================

window.searchDiary = async (query) => {
  if (!query?.trim()) { loadMyEntries(); return; }
  const container = document.getElementById('myEntriesList');
  if (!container) return;

  container.innerHTML = '<div class="loading">Buscando...</div>';
  try {
    const user = await getUser();
    const { data: entries, error } = await supabaseClient
      .from('entries')
      .select('*, profiles:user_id(username, full_name, avatar_url)')
      .eq('user_id', user.id)
      .ilike('content', `%${query.trim()}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // FIX #1: sanitize na query exibida
    const safeQuery = sanitize(query.trim());

    container.innerHTML = entries?.length
      ? `<div style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">
           ${entries.length} resultado(s) para "${safeQuery}"
           <button onclick="loadMyEntries()"
             style="background:none;border:none;color:var(--primary-color);cursor:pointer;margin-left:.5rem">
             ✕ Limpar
           </button>
         </div>
         ${entries.map(e => createEntryCard(e, true)).join('')}`
      : `<div class="empty-state">
           <p>Nenhum resultado para "${safeQuery}".</p>
           <button onclick="loadMyEntries()" class="btn-secondary"
             style="width:auto;margin-top:1rem">Voltar</button>
         </div>`;
  } catch (error) {
    container.innerHTML = `<div class="error-message">Erro na busca.</div>`;
  }
};

// ============================================
// EXPORT PDF — usa nova janela com print()
// Nota: em mobile usa a API de compartilhamento
// ============================================

window.exportDiaryPDF = async () => {
  const btn = document.querySelector('[onclick="exportDiaryPDF()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando...'; }

  try {
    const user    = await getUser();
    const profile = await getProfile(user.id);
    const { data: entries, error } = await supabaseClient
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // FIX #1: sanitize em todos os campos no HTML do PDF
    const safeName = sanitize(profile.full_name || 'Usuário');
    const entriesHtml = (entries || []).map(e => `
      <div class="entry">
        <div class="entry-date">
          ${new Date(e.created_at).toLocaleDateString('pt-BR', {
            weekday:'long', day:'2-digit', month:'long',
            year:'numeric', hour:'2-digit', minute:'2-digit'
          })}
          ${e.is_shared ? '<span class="badge"> · 🌟 Compartilhado</span>' : ''}
        </div>
        <div class="entry-text">${sanitize(e.content)}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8">
      <title>Diário de ${safeName}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; color: #1a1a1a; line-height: 1.7; }
        h1   { text-align: center; color: #8B5CF6; margin-bottom: .5rem; }
        .sub { text-align: center; color: #666; margin-bottom: 2rem; font-size: .9rem; }
        .entry { border-bottom: 1px solid #ddd; padding: 1.5rem 0; }
        .entry-date { font-size: .85rem; color: #666; margin-bottom: .5rem; }
        .entry-text { font-size: 1rem; white-space: pre-wrap; word-break: break-word; }
        .badge { font-size: .75rem; color: #8B5CF6; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>📔 Diário de ${safeName}</h1>
      <div class="sub">Exportado em ${new Date().toLocaleDateString('pt-BR')}</div>
      ${entriesHtml}
      </body></html>`;

    // Tenta window.open — fallback para Blob se bloqueado
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 600);
    } else {
      // Fallback: download como arquivo HTML
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `diario-${new Date().toISOString().split('T')[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    alert('Erro ao exportar: ' + error.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Exportar PDF'; }
  }
};

// ============================================
// REALTIME
// ============================================

const subscribeToFeed = () => {
  const feedView = document.getElementById('feedView');
  const isActive = () => feedView?.classList.contains('active');

  supabaseClient.channel('feed-entries')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
      if (isActive()) loadFeed();
    }).subscribe();

  supabaseClient.channel('feed-reactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
      if (!isActive()) return;
      const entryId = payload.new?.entry_id || payload.old?.entry_id;
      if (entryId) _refreshCardReactions(entryId);
    }).subscribe();

  supabaseClient.channel('feed-comments')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
      if (!isActive()) return;
      const entryId = payload.new?.entry_id || payload.old?.entry_id;
      if (entryId) _refreshCardComments(entryId);
    }).subscribe();
};

window.loadFeed        = loadFeed;
window.subscribeToFeed = subscribeToFeed;
window.createFeedCard  = createFeedCard;
