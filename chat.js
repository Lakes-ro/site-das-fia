// ============================================
// SISTEMA DE CHAT COMPLETO
//
// Modelos de conversa:
//   filha ↔ pai    — direto, como antes
//   filha ↔ filha  — via tabela conversations
//   pai (observador) — vê TODAS as conversas via RLS
//
// O pai não participa das conversas entre filhas,
// apenas lê. As filhas não sabem disso.
// ============================================

let chatWithUserId     = null;  // ID do outro participante visível
let chatConversationId = null;  // ID da conversa atual (filha↔filha)
let chatIsPaiObserver  = false; // pai lendo conversa entre filhas
let chatSubscription   = null;

// ============================================
// RENDERIZAÇÃO
// ============================================

const createMessageBubble = (message, currentUserId) => {
  const isPaiObserving = chatIsPaiObserver;
  // No modo observador, o pai nunca enviou nada — tudo é "received"
  const isSent   = !isPaiObserving && message.from_user_id === currentUserId;
  const profile  = message.from_profile;
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  const time     = new Date(message.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit'
  });
  // No modo observador, mostra o nome do remetente em cada bolha
  const nameLabel = isPaiObserving
    ? `<div class="message-sender">${sanitize(profile?.full_name || 'Anônimo')}</div>`
    : '';

  return `
    <div class="message ${isSent ? 'sent' : 'received'} ${isPaiObserving ? 'observer-mode' : ''}">
      <div class="message-avatar">${initials}</div>
      <div class="message-content">
        ${nameLabel}
        <div class="message-text">${sanitize(message.content)}</div>
        <div class="message-time">${time}</div>
      </div>
    </div>
  `;
};

// Lista de contatos para o pai — inclui filhas E conversas entre filhas
const renderContactList = async (daughters, currentUserId) => {
  const contactList = document.getElementById('chatContactList');
  if (!contactList) return;

  // Não lidas nas conversas diretas com o pai
  const { data: unreadData } = await supabaseClient
    .from('messages')
    .select('from_user_id')
    .eq('to_user_id', currentUserId)
    .eq('is_read', false)
    .is('conversation_id', null); // só mensagens diretas pai↔filha

  const unreadMap = {};
  (unreadData || []).forEach(m => {
    unreadMap[m.from_user_id] = (unreadMap[m.from_user_id] || 0) + 1;
  });

  // Conversas entre filhas
  const { data: convs } = await supabaseClient
    .from('conversations')
    .select('id, participant_a, participant_b, profiles_a:participant_a(full_name), profiles_b:participant_b(full_name)');

  let html = '';

  // Seção: conversas diretas com o pai
  html += `<div class="contact-section-label">💬 Chat com Filhas</div>`;
  html += daughters.map(contact => {
    const initials = contact.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
    const unread   = unreadMap[contact.id] || 0;
    const isActive = !chatIsPaiObserver && contact.id === chatWithUserId;
    return `
      <div class="chat-contact ${isActive ? 'active' : ''}"
           data-user-id="${contact.id}"
           onclick="selectContact('${contact.id}')">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-info">
          <div class="contact-name">${sanitize(contact.full_name)}</div>
          <div class="contact-username">@${sanitize(contact.username || '—')}</div>
        </div>
        ${unread > 0 ? `<span class="contact-unread">${unread}</span>` : ''}
      </div>`;
  }).join('');

  // Seção: conversas entre filhas (modo observador)
  if (convs?.length) {
    html += `<div class="contact-section-label" style="margin-top:1rem;">👁️ Entre Filhas</div>`;
    html += convs.map(conv => {
      const nameA    = sanitize(conv.profiles_a?.full_name || '?');
      const nameB    = sanitize(conv.profiles_b?.full_name || '?');
      const initA    = nameA.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,1);
      const initB    = nameB.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,1);
      const isActive = chatIsPaiObserver && chatConversationId === conv.id;
      return `
        <div class="chat-contact conv-observer ${isActive ? 'active' : ''}"
             data-conv-id="${conv.id}"
             onclick="selectConversation('${conv.id}','${nameA} & ${nameB}')">
          <div class="contact-avatar-double">
            <span>${initA}</span><span>${initB}</span>
          </div>
          <div class="contact-info">
            <div class="contact-name" style="font-size:0.85rem;">${nameA} & ${nameB}</div>
            <div class="contact-username">conversa privada</div>
          </div>
        </div>`;
    }).join('');
  }

  contactList.innerHTML = html;
};

// ============================================
// SELEÇÃO DE CONTATO
// ============================================

// Pai seleciona uma filha (chat direto)
window.selectContact = async (userId) => {
  try {
    const user    = await getUser();
    const profile = await getProfile(user.id);
    if (profile.role !== 'pai') return;

    chatIsPaiObserver  = false;
    chatConversationId = null;

    document.querySelectorAll('.chat-contact').forEach(el => {
      el.classList.toggle('active',
        !el.dataset.convId && el.dataset.userId === userId
      );
    });
    loadChat(userId);
  } catch (error) {
    console.error('Erro em selectContact:', error);
  }
};

// Pai seleciona uma conversa entre filhas (modo observador)
window.selectConversation = async (convId, label) => {
  try {
    const user    = await getUser();
    const profile = await getProfile(user.id);
    if (profile.role !== 'pai') return;

    chatIsPaiObserver  = true;
    chatConversationId = convId;
    chatWithUserId     = null;

    document.querySelectorAll('.chat-contact').forEach(el => {
      el.classList.toggle('active',
        el.dataset.convId === convId
      );
    });

    await _loadConversationMessages(convId, label);
  } catch (error) {
    console.error('Erro em selectConversation:', error);
  }
};

// Carrega mensagens de uma conversa entre filhas (pai observa)
const _loadConversationMessages = async (convId, label) => {
  const chatMessages = document.getElementById('chatMessages');
  const chatTitle    = document.getElementById('chatTitle');
  const chatForm     = document.getElementById('chatForm');
  if (!chatMessages) return;

  if (chatTitle) chatTitle.textContent = `👁️ ${label}`;
  if (chatForm)  chatForm.style.display = 'none'; // pai não escreve aqui
  chatMessages.innerHTML = '<div class="loading">Carregando conversa...</div>';

  const { data: messages, error } = await supabaseClient
    .from('messages')
    .select('*, from_profile:from_user_id(full_name, username)')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (error) {
    chatMessages.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
    return;
  }

  if (!messages?.length) {
    chatMessages.innerHTML = `
      <div class="empty-state">
        <p>Ainda não há mensagens nesta conversa.</p>
      </div>`;
    return;
  }

  const user = await getUser();
  chatMessages.innerHTML = messages.map(m => createMessageBubble(m, user.id)).join('');
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

// ============================================
// CHAT DIRETO (pai ↔ filha  ou  filha ↔ pai)
// ============================================

const loadChat = async (otherUserId) => {
  const chatMessages = document.getElementById('chatMessages');
  const chatTitle    = document.getElementById('chatTitle');
  const chatForm     = document.getElementById('chatForm');
  if (!chatMessages) return;

  chatWithUserId     = otherUserId;
  chatIsPaiObserver  = false;
  chatConversationId = null;

  if (chatForm) chatForm.style.display = 'flex';

  try {
    const [otherProfile, user] = await Promise.all([
      getProfile(otherUserId),
      getUser()
    ]);

    if (chatTitle) chatTitle.textContent = `Chat com ${otherProfile.full_name}`;
    chatMessages.innerHTML = '<div class="loading">Carregando mensagens...</div>';

    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*, from_profile:from_user_id(username, full_name)')
      .or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${otherUserId}),` +
        `and(from_user_id.eq.${otherUserId},to_user_id.eq.${user.id})`
      )
      .is('conversation_id', null) // apenas mensagens diretas
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!messages?.length) {
      chatMessages.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma mensagem ainda.<br>Comece a conversa! 💬</p>
        </div>`;
    } else {
      chatMessages.innerHTML = messages.map(m => createMessageBubble(m, user.id)).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    await supabaseClient
      .from('messages')
      .update({ is_read: true })
      .eq('to_user_id', user.id)
      .eq('from_user_id', otherUserId)
      .is('conversation_id', null);

    await updateUnreadCount();
    await _refreshContactBadges(user.id);

  } catch (error) {
    console.error('Erro ao carregar chat:', error);
    chatMessages.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

// ============================================
// CHAT ENTRE FILHAS
// ============================================

// Garante que existe uma conversa entre duas filhas, retorna o id
const _getOrCreateConversation = async (userIdA, userIdB) => {
  // Tenta buscar existente
  const { data: existing } = await supabaseClient
    .from('conversations')
    .select('id')
    .or(
      `and(participant_a.eq.${userIdA},participant_b.eq.${userIdB}),` +
      `and(participant_a.eq.${userIdB},participant_b.eq.${userIdA})`
    )
    .maybeSingle();

  if (existing) return existing.id;

  // Cria nova
  const { data: created, error } = await supabaseClient
    .from('conversations')
    .insert({ participant_a: userIdA, participant_b: userIdB })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
};

// Carrega chat entre filhas (para as próprias filhas)
const loadSisterChat = async (otherUserId) => {
  const chatMessages = document.getElementById('chatMessages');
  const chatTitle    = document.getElementById('chatTitle');
  const chatForm     = document.getElementById('chatForm');
  if (!chatMessages) return;

  chatWithUserId     = otherUserId;
  chatIsPaiObserver  = false;

  if (chatForm) chatForm.style.display = 'flex';

  try {
    const [otherProfile, user] = await Promise.all([
      getProfile(otherUserId),
      getUser()
    ]);

    if (chatTitle) chatTitle.textContent = `Chat com ${otherProfile.full_name}`;
    chatMessages.innerHTML = '<div class="loading">Carregando...</div>';

    // Garante conversa criada
    chatConversationId = await _getOrCreateConversation(user.id, otherUserId);

    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*, from_profile:from_user_id(full_name, username)')
      .eq('conversation_id', chatConversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!messages?.length) {
      chatMessages.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma mensagem ainda.<br>Comece a conversa! 💬</p>
        </div>`;
    } else {
      chatMessages.innerHTML = messages.map(m => createMessageBubble(m, user.id)).join('');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

  } catch (error) {
    console.error('Erro no chat entre filhas:', error);
    chatMessages.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

// ============================================
// ENVIAR MENSAGEM
// ============================================

document.getElementById('chatForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const chatInput = document.getElementById('chatInput');
  const content   = chatInput.value.trim();
  if (!content) return;

  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  try {
    const user = await getUser();

    if (chatConversationId) {
      // Mensagem em conversa entre filhas
      const { error } = await supabaseClient.from('messages').insert({
        from_user_id:    user.id,
        to_user_id:      chatWithUserId,
        content,
        conversation_id: chatConversationId
      });
      if (error) throw error;
      chatInput.value = '';
      await loadSisterChat(chatWithUserId);
    } else {
      // Mensagem direta (filha ↔ pai)
      const { error } = await supabaseClient.from('messages').insert({
        from_user_id: user.id,
        to_user_id:   chatWithUserId,
        content
      });
      if (error) throw error;
      chatInput.value = '';
      await loadChat(chatWithUserId);
    }
  } catch (error) {
    alert('Erro ao enviar: ' + error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

// ============================================
// REALTIME
// ============================================

const subscribeToChatMessages = (userId) => {
  if (chatSubscription) { chatSubscription.unsubscribe(); chatSubscription = null; }

  chatSubscription = supabaseClient
    .channel(`chat-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        const msg = payload.new;

        // Mensagem direta para este usuário
        if (msg.to_user_id === userId && !msg.conversation_id) {
          if (chatWithUserId === msg.from_user_id && !chatIsPaiObserver) {
            loadChat(chatWithUserId);
          } else {
            updateUnreadCount();
            await _refreshContactBadges(userId);
          }
          return;
        }

        // Mensagem em conversa entre filhas — atualiza se estiver aberta
        if (msg.conversation_id) {
          if (chatConversationId === msg.conversation_id) {
            if (chatIsPaiObserver) {
              // Pai recarrega a conversa observada
              const chatTitle = document.getElementById('chatTitle');
              await _loadConversationMessages(msg.conversation_id, chatTitle?.textContent?.replace('👁️ ','') || '');
            } else if (msg.to_user_id === userId || msg.from_user_id === userId) {
              loadSisterChat(chatWithUserId);
            }
          } else {
            updateUnreadCount();
          }
        }
      }
    )
    .subscribe();
};

// ============================================
// HELPERS
// ============================================

const _refreshContactBadges = async (userId) => {
  const profile = await getProfile(userId);
  if (profile.role === 'pai') {
    const { data: daughters } = await supabaseClient
      .from('profiles').select('*').eq('role', 'filha').order('full_name');
    if (daughters?.length) renderContactList(daughters, userId);
  }
};

const updateUnreadCount = async () => {
  try {
    const user = await getUser();
    const { count, error } = await supabaseClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;

    const badge      = document.querySelector('.unread-badge');
    const notifBadge = document.querySelector('.notification-badge');

    if (count > 0) {
      if (badge)      { badge.textContent = count;      badge.style.display = 'block'; }
      if (notifBadge) { notifBadge.textContent = count; notifBadge.style.display = 'flex'; }
    } else {
      if (badge)      badge.style.display = 'none';
      if (notifBadge) notifBadge.style.display = 'none';
    }
  } catch (error) {
    console.error('Erro no contador:', error);
  }
};

// ============================================
// SELETOR INICIAL
// ============================================

const loadChatSelector = async () => {
  const chatForm = document.getElementById('chatForm');
  try {
    const user    = await getUser();
    const profile = await getProfile(user.id);

    if (profile.role === 'pai') {
      const { data: daughters, error } = await supabaseClient
        .from('profiles').select('*').eq('role', 'filha').order('full_name');

      if (error) throw error;

      if (!daughters?.length) {
        document.getElementById('chatMessages').innerHTML = `
          <div class="empty-state">
            <h3>Nenhuma filha cadastrada ainda</h3>
            <p>As filhas aparecerão aqui assim que criarem conta.</p>
          </div>`;
        if (chatForm) chatForm.style.display = 'none';
        return;
      }

      if (chatForm) chatForm.style.display = 'none';
      await renderContactList(daughters, user.id);
      loadChat(daughters[0].id);

    } else {
      // Filha: vê o pai + outras filhas
      const [{ data: pai }, { data: sisters }] = await Promise.all([
        supabaseClient.from('profiles').select('*').eq('role', 'pai').limit(1).single(),
        supabaseClient.from('profiles').select('*').eq('role', 'filha')
          .neq('id', user.id).order('full_name')
      ]);

      // Monta lista de contatos da filha
      const contactList = document.getElementById('chatContactList');
      const contactsPanel = document.getElementById('chatContactsPanel');
      const allContacts = [];

      if (pai) allContacts.push({ ...pai, _isPai: true });
      if (sisters?.length) allContacts.push(...sisters);

      // Se há mais de um contato, mostra painel lateral para a filha também
      if (allContacts.length > 1 && contactsPanel) {
        contactsPanel.style.display = 'flex';

        let html = `<div class="contact-section-label">👨 Pai</div>`;
        if (pai) {
          const initials = pai.full_name?.split(' ').map(n=>n[0]).join('').toUpperCase() || '?';
          html += `
            <div class="chat-contact active" data-user-id="${pai.id}" onclick="selectFilhaContact('${pai.id}','pai')">
              <div class="contact-avatar">${initials}</div>
              <div class="contact-info">
                <div class="contact-name">${sanitize(pai.full_name)}</div>
                <div class="contact-username">@${sanitize(pai.username || '—')}</div>
              </div>
            </div>`;
        }

        if (sisters?.length) {
          html += `<div class="contact-section-label" style="margin-top:1rem;">👧 Irmãs</div>`;
          html += sisters.map(s => {
            const initials = s.full_name?.split(' ').map(n=>n[0]).join('').toUpperCase() || '?';
            return `
              <div class="chat-contact" data-user-id="${s.id}" onclick="selectFilhaContact('${s.id}','filha')">
                <div class="contact-avatar">${initials}</div>
                <div class="contact-info">
                  <div class="contact-name">${sanitize(s.full_name)}</div>
                  <div class="contact-username">@${sanitize(s.username || '—')}</div>
                </div>
              </div>`;
          }).join('');
        }

        if (contactList) contactList.innerHTML = html;
        if (chatForm) chatForm.style.display = 'none';
      }

      // Abre direto o chat com o pai inicialmente
      if (pai) loadChat(pai.id);
    }

  } catch (error) {
    console.error('Erro ao carregar seletor:', error);
  }
};

// Filha seleciona um contato (pai ou irmã)
window.selectFilhaContact = (userId, tipo) => {
  document.querySelectorAll('.chat-contact').forEach(el => {
    el.classList.toggle('active', el.dataset.userId === userId);
  });
  const chatForm = document.getElementById('chatForm');
  if (chatForm) chatForm.style.display = 'flex';

  if (tipo === 'pai') {
    chatConversationId = null;
    loadChat(userId);
  } else {
    loadSisterChat(userId);
  }
};

window.loadChat                = loadChat;
window.loadSisterChat          = loadSisterChat;
window.subscribeToChatMessages = subscribeToChatMessages;
window.updateUnreadCount       = updateUnreadCount;
window.loadChatSelector        = loadChatSelector;
