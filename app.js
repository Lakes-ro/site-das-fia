// ============================================
// ORQUESTRADOR PRINCIPAL DA APLICAÇÃO
// Só executa após DOM + scripts carregados (DOMContentLoaded).
// ============================================

let currentUser    = null;
let currentProfile = null;

// ---- Inicialização ----

const initApp = async () => {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
      window.location.href = 'fias.html';
      return;
    }

    currentUser    = user;
    currentProfile = await getProfile(user.id);

    if (!currentProfile) {
      throw new Error('Perfil não encontrado. Contate o administrador.');
    }

    document.getElementById('navUsername').textContent =
      currentProfile.username || currentProfile.full_name || 'Usuário';

    // Tema carrega primeiro — evita flash de cor errada
    await loadUserTheme(user.id);

    setupMenu();
    await loadMyEntries();

    // Realtime e contadores
    subscribeToFeed();
    subscribeToChatMessages(user.id);
    await updateUnreadCount();

    console.log(`✅ App iniciado | usuário: ${currentProfile.username} | role: ${currentProfile.role}`);

  } catch (error) {
    console.error('❌ Falha ao inicializar:', error);
    alert(`Erro ao carregar o aplicativo: ${error.message}\nRedirecionando para login...`);
    window.location.href = 'fias.html';
  }
};

// ---- Menu por Role ----

const setupMenu = () => {
  const adminMenu     = document.getElementById('adminMenu');
  const chatMenuLabel = document.getElementById('chatMenuLabel');

  if (currentProfile?.role === 'pai') {
    if (adminMenu)     adminMenu.style.display = 'block';
    if (chatMenuLabel) chatMenuLabel.textContent = 'Chat com Filhas';
  } else {
    if (adminMenu)     adminMenu.style.display = 'none';
    if (chatMenuLabel) chatMenuLabel.textContent = 'Chat com Pai';
  }
};

// ---- Navegação (event delegation) ----

document.querySelector('.sidebar-menu')?.addEventListener('click', (e) => {
  const item = e.target.closest('.menu-item');
  if (!item) return;
  e.preventDefault();
  const viewName = item.getAttribute('data-view');
  if (viewName) switchView(viewName);
});

const switchView = (viewName) => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const actions = {
    'my-space': () => { showView('mySpaceView');  loadMyEntries(); },
    'feed':     () => { showView('feedView');     loadFeed(); },
    'chat':     () => { showView('chatView');     initChatView(); },
    'admin':    () => {
      if (currentProfile?.role !== 'pai') {
        console.warn('Acesso negado: painel admin requer role=pai');
        return;
      }
      showView('adminView');
      loadAdminPanel();
    }
  };

  actions[viewName]?.();
};

const showView = (id) => {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
};

// ---- Chat: layout por role ----

const initChatView = () => {
  const contactsPanel = document.getElementById('chatContactsPanel');

  if (currentProfile?.role === 'pai') {
    if (contactsPanel) contactsPanel.style.display = 'flex';
  } else {
    if (contactsPanel) contactsPanel.style.display = 'none';
  }

  loadChatSelector();
};

// ---- Painel Admin ----

const loadAdminPanel = async () => {
  if (currentProfile?.role !== 'pai') return;

  const familyMembersList = document.getElementById('familyMembersList');
  const allEntriesList    = document.getElementById('allEntriesList');
  if (!familyMembersList || !allEntriesList) return;

  familyMembersList.innerHTML = '<div class="loading">Carregando membros...</div>';
  allEntriesList.innerHTML    = '<div class="loading">Carregando entradas...</div>';

  try {
    const { data: members, error: membersError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, username, role, created_at')
      .order('role', { ascending: false })
      .order('full_name', { ascending: true });

    if (membersError) throw membersError;

    const totalFilhas = members.filter(m => m.role === 'filha').length;

    familyMembersList.innerHTML = `
      <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">
        ${members.length} membro(s) — ${totalFilhas} filha(s)
      </p>
      ${members.map(member => {
        const initials = member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
        return `
          <div class="family-member">
            <div class="member-avatar">${initials}</div>
            <div class="member-info">
              <div class="member-name">${member.full_name || '—'}</div>
              <div class="member-username">@${member.username || '—'}</div>
            </div>
            <span class="member-role">${member.role === 'pai' ? '👑 Pai' : '👧 Filha'}</span>
          </div>`;
      }).join('')}`;

    const { data: entries, error: entriesError } = await supabaseClient
      .from('entries')
      .select('*, profiles:user_id(username, full_name, avatar_url)')
      .order('created_at', { ascending: false });

    if (entriesError) throw entriesError;

    allEntriesList.innerHTML = entries?.length
      ? entries.map(e => createEntryCard(e, false)).join('')
      : '<div class="empty-state"><p>Nenhuma entrada ainda.</p></div>';

  } catch (error) {
    console.error('Erro ao carregar painel admin:', error);
    familyMembersList.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
    allEntriesList.innerHTML    = '';
  }
};

// ---- Logout ----

document.getElementById('navLogout')?.addEventListener('click', async () => {
  if (!confirm('Deseja realmente sair?')) return;
  try {
    await supabaseClient.auth.signOut();
  } finally {
    window.location.href = 'fias.html';
  }
});

// ---- Notificações → abre chat ----

document.getElementById('navNotifications')?.addEventListener('click', () => {
  switchView('chat');
});

// ---- Boot ----

document.addEventListener('DOMContentLoaded', initApp);