// ============================================
// ORQUESTRADOR PRINCIPAL
// ============================================

let currentUser    = null;
let currentProfile = null;

// ---- Acesso secreto ao painel do pai ----
// Clique 3x no logo da navbar em < 2s
let _secretTapCount = 0;
let _secretTapTimer = null;

const _initSecretAccess = () => {
  const brand = document.querySelector('.nav-brand');
  if (!brand) return;

  brand.addEventListener('click', () => {
    if (currentProfile?.role !== 'pai') return;

    _secretTapCount++;
    clearTimeout(_secretTapTimer);

    if (_secretTapCount >= 3) {
      _secretTapCount = 0;
      switchView('admin');
      return;
    }

    _secretTapTimer = setTimeout(() => { _secretTapCount = 0; }, 2000);
  });
};

// ============================================
// INICIALIZAÇÃO
// ============================================

const initApp = async () => {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) { window.location.href = 'fias.html'; return; }

    currentUser    = user;
    currentProfile = await getProfile(user.id);
    if (!currentProfile) throw new Error('Perfil não encontrado.');

    document.getElementById('navUsername').textContent =
      currentProfile.username || currentProfile.full_name || 'Usuário';

    await loadUserTheme(user.id);
    setupMenu();
    _initSecretAccess();

    if (currentProfile.role === 'pai') {
      switchView('feed');
    } else {
      await loadMyEntries();
      _checkMemories(); // "Há X anos você escreveu..."
    }

    subscribeToFeed();
    subscribeToChatMessages(user.id);
    await updateUnreadCount();

    // Toggle dark/light mode
    _initThemeToggle();

    console.log(`✅ App | ${currentProfile.username} | ${currentProfile.role}`);
  } catch (error) {
    console.error('❌', error);
    alert(`Erro: ${error.message}`);
    window.location.href = 'fias.html';
  }
};

// ============================================
// MENU
// ============================================

const setupMenu = () => {
  const adminMenu     = document.getElementById('adminMenu');
  const chatMenuLabel = document.getElementById('chatMenuLabel');
  const myDiaryItem   = document.querySelector('[data-view="my-space"]');

  if (currentProfile?.role === 'pai') {
    // Painel do pai COMPLETAMENTE oculto do menu
    // Acesso apenas pelo toque secreto no logo (3x)
    if (adminMenu)     adminMenu.style.display = 'none';
    if (chatMenuLabel) chatMenuLabel.textContent = 'Chat';
    if (myDiaryItem)   myDiaryItem.style.display = 'none';
  } else {
    if (adminMenu)     adminMenu.style.display = 'none';
    if (chatMenuLabel) chatMenuLabel.textContent = 'Chat';
    if (myDiaryItem)   myDiaryItem.style.display = 'flex';
  }
};

// ============================================
// DARK / LIGHT MODE TOGGLE
// ============================================

const _initThemeToggle = () => {
  const btn = document.getElementById('navThemeToggle');
  if (!btn) return;

  // Lê preferência salva
  const saved = localStorage.getItem('colorScheme') || 'dark';
  _applyColorScheme(saved);
  btn.textContent = saved === 'dark' ? '☀️' : '🌙';

  btn.addEventListener('click', () => {
    const current = localStorage.getItem('colorScheme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('colorScheme', next);
    _applyColorScheme(next);
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
};

const _applyColorScheme = (scheme) => {
  if (scheme === 'light') {
    document.documentElement.setAttribute('data-scheme', 'light');
  } else {
    document.documentElement.removeAttribute('data-scheme');
  }
};

// ============================================
// NAVEGAÇÃO
// ============================================

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
    'my-space':   () => { showView('mySpaceView');  loadMyEntries(); },
    'feed':       () => { showView('feedView');     loadFeed(); },
    'chat':       () => { showView('chatView');     initChatView(); },
    'birthdays':  () => { showView('birthdaysView'); loadBirthdays(); },
    'timecapsule':() => { showView('timecapsuleView'); loadTimeCapsules(); },
    'admin':      () => {
      if (currentProfile?.role !== 'pai') return;
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

// ============================================
// CHAT LAYOUT
// ============================================

const initChatView = () => {
  const contactsPanel = document.getElementById('chatContactsPanel');
  if (currentProfile?.role === 'pai') {
    if (contactsPanel) contactsPanel.style.display = 'flex';
  } else {
    if (contactsPanel) contactsPanel.style.display = 'none';
  }
  loadChatSelector();
};

// ============================================
// MEMÓRIAS DO PASSADO
// ============================================

const _checkMemories = async () => {
  try {
    const user = await getUser();
    const hoje = new Date();
    const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    const diaAtual = String(hoje.getDate()).padStart(2, '0');

    // Busca entradas do mesmo dia/mês em anos anteriores
    const { data: entries } = await supabaseClient
      .from('entries')
      .select('id, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!entries?.length) return;

    const memorias = entries.filter(e => {
      const d = new Date(e.created_at);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return mes === mesAtual && dia === diaAtual && ano < hoje.getFullYear();
    });

    if (!memorias.length) return;

    const memoria = memorias[0];
    const anosAtras = hoje.getFullYear() - new Date(memoria.created_at).getFullYear();
    const preview   = sanitize(memoria.content).slice(0, 150) + (memoria.content.length > 150 ? '...' : '');

    // Injeta banner no topo do diário
    const container = document.getElementById('myEntriesList');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'memory-banner';
    banner.innerHTML = `
      <div class="memory-banner-icon">🕰️</div>
      <div class="memory-banner-body">
        <div class="memory-banner-title">Há ${anosAtras} ano${anosAtras > 1 ? 's' : ''}, você escreveu:</div>
        <div class="memory-banner-text">"${preview}"</div>
      </div>
      <button class="memory-banner-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.prepend(banner);
  } catch (_) {}
};

// ============================================
// ANIVERSÁRIOS
// ============================================

const loadBirthdays = async () => {
  const view = document.getElementById('birthdaysView');
  if (!view) return;

  const content = view.querySelector('.birthdays-content') || view;

  try {
    const user = await getUser();

    const { data: birthdays, error } = await supabaseClient
      .from('birthdays')
      .select('*')
      .eq('user_id', user.id)
      .order('month').order('day');

    if (error) throw error;

    const hoje   = new Date();
    const hojeMes = hoje.getMonth() + 1;
    const hojeDia = hoje.getDate();

    const hoje7 = new Date(hoje);
    hoje7.setDate(hoje7.getDate() + 7);

    const proximosIds = new Set(
      (birthdays || []).filter(b => {
        const bDate = new Date(hoje.getFullYear(), b.month - 1, b.day);
        return bDate >= hoje && bDate <= hoje7;
      }).map(b => b.id)
    );

    content.innerHTML = `
      <div class="birthdays-list">
        ${(birthdays || []).length === 0
          ? '<div class="empty-state"><p>Nenhum aniversário cadastrado.</p></div>'
          : (birthdays || []).map(b => {
              const isBday = b.month === hojeMes && b.day === hojeDia;
              const isProx = proximosIds.has(b.id);
              return `
                <div class="birthday-item ${isBday ? 'today' : ''} ${isProx && !isBday ? 'soon' : ''}">
                  <div class="birthday-avatar">🎂</div>
                  <div class="birthday-info">
                    <div class="birthday-name">${sanitize(b.name)}</div>
                    <div class="birthday-date">${String(b.day).padStart(2,'0')}/${String(b.month).padStart(2,'0')}</div>
                  </div>
                  ${isBday ? '<span class="birthday-tag today-tag">🎉 Hoje!</span>' : ''}
                  ${isProx && !isBday ? '<span class="birthday-tag soon-tag">Em breve</span>' : ''}
                  <button class="birthday-delete" onclick="deleteBirthday('${b.id}')">🗑️</button>
                </div>`;
            }).join('')}
      </div>
      <div class="birthday-form">
        <h3>Adicionar Aniversário</h3>
        <div class="birthday-input-row">
          <input type="text"    id="bdName"  placeholder="Nome" maxlength="60">
          <input type="number"  id="bdDay"   placeholder="Dia"   min="1" max="31" style="width:70px">
          <input type="number"  id="bdMonth" placeholder="Mês"   min="1" max="12" style="width:70px">
          <button class="btn-primary" style="width:auto;padding:.6rem 1.2rem" onclick="addBirthday()">Salvar</button>
        </div>
      </div>`;
  } catch (error) {
    content.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

window.addBirthday = async () => {
  const name  = document.getElementById('bdName')?.value.trim();
  const day   = parseInt(document.getElementById('bdDay')?.value);
  const month = parseInt(document.getElementById('bdMonth')?.value);

  if (!name || !day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
    alert('Preencha todos os campos corretamente.'); return;
  }
  try {
    const user = await getUser();
    const { error } = await supabaseClient.from('birthdays')
      .insert({ user_id: user.id, name, day, month });
    if (error) throw error;
    loadBirthdays();
  } catch (e) { alert('Erro: ' + e.message); }
};

window.deleteBirthday = async (id) => {
  if (!confirm('Excluir este aniversário?')) return;
  try {
    const { error } = await supabaseClient.from('birthdays').delete().eq('id', id);
    if (error) throw error;
    loadBirthdays();
  } catch (e) { alert('Erro: ' + e.message); }
};

// ============================================
// CÁPSULA DO TEMPO
// ============================================

const loadTimeCapsules = async () => {
  const view = document.getElementById('timecapsuleView');
  if (!view) return;
  const content = view.querySelector('.capsule-content') || view;

  try {
    const user = await getUser();
    const hoje = new Date().toISOString().split('T')[0];

    const { data: capsules, error } = await supabaseClient
      .from('time_capsules')
      .select('*')
      .eq('user_id', user.id)
      .order('reveal_date', { ascending: true });

    if (error) throw error;

    const locked   = (capsules || []).filter(c => c.reveal_date > hoje);
    const unlocked = (capsules || []).filter(c => c.reveal_date <= hoje);

    content.innerHTML = `
      ${unlocked.length ? `
        <div class="capsule-section">
          <h3>🔓 Prontas para Abrir</h3>
          ${unlocked.map(c => `
            <div class="capsule-card unlocked">
              <div class="capsule-date">Criada para: ${new Date(c.reveal_date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
              <div class="capsule-content-text">${sanitize(c.content)}</div>
              <button class="btn-secondary" style="width:auto;margin-top:.75rem;padding:.4rem .9rem;font-size:.85rem"
                onclick="deleteCapsule('${c.id}')">Arquivar</button>
            </div>`).join('')}
        </div>` : ''}

      <div class="capsule-section">
        <h3>🔒 Lacradas</h3>
        ${locked.length
          ? locked.map(c => `
            <div class="capsule-card locked">
              <div class="capsule-icon">🔒</div>
              <div class="capsule-info">
                <div class="capsule-label">Mensagem lacrada</div>
                <div class="capsule-date">Abre em: ${new Date(c.reveal_date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
              </div>
              <button class="capsule-delete" onclick="deleteCapsule('${c.id}')">🗑️</button>
            </div>`).join('')
          : '<div class="empty-state" style="padding:1rem 0"><p>Nenhuma cápsula lacrada.</p></div>'}
      </div>

      <div class="capsule-form">
        <h3>✍️ Criar Nova Cápsula</h3>
        <div class="form-group">
          <label>Mensagem (só você lerá, na data que escolher)</label>
          <textarea id="capsuleContent" rows="4" placeholder="Querida eu do futuro..."></textarea>
        </div>
        <div class="form-group">
          <label>Revelar em:</label>
          <input type="date" id="capsuleDate" min="${hoje}">
        </div>
        <button class="btn-primary" style="width:auto;padding:.7rem 1.5rem" onclick="saveCapsule()">Lacrar 🔒</button>
      </div>`;
  } catch (error) {
    content.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

window.saveCapsule = async () => {
  const content     = document.getElementById('capsuleContent')?.value.trim();
  const reveal_date = document.getElementById('capsuleDate')?.value;
  const hoje        = new Date().toISOString().split('T')[0];

  if (!content || !reveal_date) { alert('Preencha todos os campos.'); return; }
  if (reveal_date <= hoje)       { alert('A data deve ser no futuro.'); return; }

  try {
    const user = await getUser();
    const { error } = await supabaseClient.from('time_capsules')
      .insert({ user_id: user.id, content, reveal_date });
    if (error) throw error;
    loadTimeCapsules();
  } catch (e) { alert('Erro: ' + e.message); }
};

window.deleteCapsule = async (id) => {
  if (!confirm('Excluir esta cápsula permanentemente?')) return;
  try {
    await supabaseClient.from('time_capsules').delete().eq('id', id);
    loadTimeCapsules();
  } catch (e) { alert('Erro: ' + e.message); }
};

// ============================================
// PAINEL ADMIN (acesso secreto — título neutro)
// ============================================

const loadAdminPanel = async () => {
  if (currentProfile?.role !== 'pai') return;

  const familyMembersList = document.getElementById('familyMembersList');
  const allEntriesList    = document.getElementById('allEntriesList');
  if (!familyMembersList || !allEntriesList) return;

  familyMembersList.innerHTML = '<div class="loading">Carregando...</div>';
  allEntriesList.innerHTML    = '<div class="loading">Carregando...</div>';

  try {
    const { data: members, error: membersError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, username, role')
      .order('role', { ascending: false })
      .order('full_name', { ascending: true });

    if (membersError) throw membersError;

    const totalFilhas = members.filter(m => m.role === 'filha').length;

    familyMembersList.innerHTML = `
      <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:0.9rem;">
        ${members.length} membro(s) — ${totalFilhas} filha(s)
      </p>
      ${members.map(m => {
        const initials = m.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
        return `
          <div class="family-member">
            <div class="member-avatar">${initials}</div>
            <div class="member-info">
              <div class="member-name">${sanitize(m.full_name || '—')}</div>
              <div class="member-username">@${sanitize(m.username || '—')}</div>
            </div>
            <span class="member-role">${m.role === 'pai' ? '👑' : '👧'}</span>
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
    console.error('Erro no admin:', error);
    familyMembersList.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

// ============================================
// LOGOUT
// ============================================

document.getElementById('navLogout')?.addEventListener('click', async () => {
  if (!confirm('Deseja realmente sair?')) return;
  try { await supabaseClient.auth.signOut(); } finally {
    window.location.href = 'fias.html';
  }
});

document.getElementById('navNotifications')?.addEventListener('click', () => {
  switchView('chat');
});

document.addEventListener('DOMContentLoaded', initApp);
