// ============================================
// SISTEMA DE DIÁRIO PRIVADO
// ============================================

let editingEntryId = null;

// Criar card de entrada (usado também pelo admin)
const createEntryCard = (entry, showActions = true) => {
  const profile = entry.profiles;
  const date = new Date(entry.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  const mediaHtml = entry.media_urls?.length
    ? `<img src="${entry.media_urls[0]}" alt="Mídia" class="entry-media" loading="lazy">`
    : '';
  const actionsHtml = showActions ? `
    <div class="entry-actions">
      <button onclick="editEntry('${entry.id}')">Editar</button>
      <button onclick="deleteEntry('${entry.id}')">Excluir</button>
    </div>` : '';

  return `
    <div class="entry-card" data-entry-id="${entry.id}">
      <div class="entry-header">
        <div class="entry-author">
          <div class="entry-avatar">${initials}</div>
          <div class="entry-meta">
            <div class="entry-name">${profile?.full_name || 'Anônimo'}</div>
            <div class="entry-date">${date}</div>
          </div>
        </div>
        <span class="entry-badge ${entry.is_shared ? 'shared' : 'private'}">
          ${entry.is_shared ? '🌟 Compartilhado' : '🔒 Privado'}
        </span>
      </div>
      <div class="entry-content">${entry.content}</div>
      ${mediaHtml}
      ${actionsHtml}
    </div>
  `;
};

// Carregar entradas privadas
const loadMyEntries = async () => {
  const myEntriesList = document.getElementById('myEntriesList');
  if (!myEntriesList) return;

  myEntriesList.innerHTML = '<div class="loading">Carregando...</div>';

  try {
    const user = await getUser();
    const { data: entries, error } = await supabaseClient
      .from('entries')
      .select('*, profiles:user_id(username, full_name, avatar_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!entries?.length) {
      myEntriesList.innerHTML = `
        <div class="empty-state">
          <h3>Seu diário está vazio</h3>
          <p>Comece a escrever suas memórias!</p>
        </div>`;
      return;
    }

    myEntriesList.innerHTML = entries.map(e => createEntryCard(e, true)).join('');
  } catch (error) {
    console.error('Erro ao carregar entradas:', error);
    myEntriesList.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

// ---- Modal ----
const entryModal = document.getElementById('entryModal');

const openEntryModal = (title, isShared = false) => {
  document.getElementById('entryModalTitle').textContent = title;
  document.getElementById('entryContent').value = '';
  document.getElementById('entryIsShared').checked = isShared;
  document.getElementById('entryMedia').value = '';
  entryModal.classList.add('active');
};

document.getElementById('btnNewEntry')?.addEventListener('click', () => {
  editingEntryId = null;
  openEntryModal('Nova Entrada', false);
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

// Salvar entrada
document.getElementById('entryForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const content = document.getElementById('entryContent').value;
  const isShared = document.getElementById('entryIsShared').checked;
  const mediaFile = document.getElementById('entryMedia').files[0];

  try {
    const user = await getUser();
    let mediaUrls = [];

    if (mediaFile) {
      const url = await uploadMedia(mediaFile);
      mediaUrls.push(url);
    }

    if (editingEntryId) {
      const { error } = await supabaseClient
        .from('entries')
        .update({ content, is_shared: isShared, media_urls: mediaUrls.length ? mediaUrls : null, updated_at: new Date().toISOString() })
        .eq('id', editingEntryId)
        .eq('user_id', user.id); // segurança extra
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('entries')
        .insert({ user_id: user.id, content, is_shared: isShared, media_urls: mediaUrls.length ? mediaUrls : null });
      if (error) throw error;
    }

    entryModal.classList.remove('active');
    loadMyEntries();
    if (typeof loadFeed === 'function') loadFeed();
  } catch (error) {
    alert('Erro ao salvar entrada: ' + error.message);
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
    entryModal.classList.add('active');
  } catch (error) {
    alert('Erro ao carregar entrada: ' + error.message);
  }
};

// Deletar
window.deleteEntry = async (entryId) => {
  if (!confirm('Tem certeza que deseja excluir esta entrada?')) return;
  try {
    const user = await getUser();
    const { error } = await supabaseClient
      .from('entries').delete().eq('id', entryId).eq('user_id', user.id);
    if (error) throw error;
    loadMyEntries();
    if (typeof loadFeed === 'function') loadFeed();
  } catch (error) {
    alert('Erro ao excluir entrada: ' + error.message);
  }
};

// Exportar
window.loadMyEntries = loadMyEntries;
window.createEntryCard = createEntryCard;