// ============================================
// SISTEMA DE CHAT PAI ↔ FILHAS
// Suporta número ilimitado de filhas.
// Guard de segurança: selectContact verifica role antes de carregar conversa.
// ============================================

let chatWithUserId   = null;
let chatSubscription = null;

// ---- Renderização de bolha de mensagem ----

const createMessageBubble = (message, currentUserId) => {
  const isSent   = message.from_user_id === currentUserId;
  const profile  = message.from_profile;
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  const time     = new Date(message.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit'
  });

  return `
    <div class="message ${isSent ? 'sent' : 'received'}">
      <div class="message-avatar">${initials}</div>
      <div class="message-content">
        <div class="message-text">${message.content}</div>
        <div class="message-time">${time}</div>
      </div>
    </div>
  `;
};

// ---- Renderização da lista de contatos (apenas para o pai) ----

const renderContactList = async (contacts, currentUserId) => {
  const contactList = document.getElementById('chatContactList');
  if (!contactList) return;

  const { data: unreadData } = await supabaseClient
    .from('messages')
    .select('from_user_id')
    .eq('to_user_id', currentUserId)
    .eq('is_read', false);

  const unreadMap = {};
  (unreadData || []).forEach(m => {
    unreadMap[m.from_user_id] = (unreadMap[m.from_user_id] || 0) + 1;
  });

  contactList.innerHTML = contacts.map(contact => {
    const initials = contact.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
    const unread   = unreadMap[contact.id] || 0;
    const isActive = contact.id === chatWithUserId ? 'active' : '';

    return `
      <div class="chat-contact ${isActive}" data-user-id="${contact.id}" onclick="selectContact('${contact.id}')">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-info">
          <div class="contact-name">${contact.full_name}</div>
          <div class="contact-username">@${contact.username || '—'}</div>
        </div>
        ${unread > 0 ? `<span class="contact-unread">${unread}</span>` : ''}
      </div>
    `;
  }).join('');
};

// ---- Selecionar contato (com guard de segurança) ----

window.selectContact = async (userId) => {
  try {
    // Verifica se o usuário atual é realmente o pai antes de permitir
    // navegar para a conversa de qualquer filha
    const user    = await getUser();
    const profile = await getProfile(user.id);
    if (profile.role !== 'pai') {
      console.warn('selectContact: acesso negado para role=' + profile.role);
      return;
    }

    document.querySelectorAll('.chat-contact').forEach(el => {
      el.classList.toggle('active', el.dataset.userId === userId);
    });
    loadChat(userId);
  } catch (error) {
    console.error('Erro em selectContact:', error);
  }
};

// ---- Carregar conversa ----

const loadChat = async (otherUserId) => {
  const chatMessages = document.getElementById('chatMessages');
  const chatTitle    = document.getElementById('chatTitle');
  const chatForm     = document.getElementById('chatForm');
  if (!chatMessages) return;

  chatWithUserId = otherUserId;

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
      .select('*, from_profile:from_user_id(username, full_name), to_profile:to_user_id(username, full_name)')
      .or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${otherUserId}),` +
        `and(from_user_id.eq.${otherUserId},to_user_id.eq.${user.id})`
      )
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

    // Marcar como lidas
    await supabaseClient
      .from('messages')
      .update({ is_read: true })
      .eq('to_user_id', user.id)
      .eq('from_user_id', otherUserId);

    await updateUnreadCount();

    // Atualiza badges na lista de contatos (apenas pai)
    const profile = await getProfile(user.id);
    if (profile.role === 'pai') {
      const { data: daughters } = await supabaseClient
        .from('profiles').select('*').eq('role', 'filha').order('full_name');
      if (daughters?.length) renderContactList(daughters, user.id);
    }

  } catch (error) {
    console.error('Erro ao carregar chat:', error);
    chatMessages.innerHTML = `<div class="error-message">Erro: ${error.message}</div>`;
  }
};

// ---- Enviar mensagem ----

const _setupChatForm = () => {
  const form = document.getElementById('chatForm');
  if (!form || form._chatListenerAdded) return;
  form._chatListenerAdded = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chatInput = document.getElementById('chatInput');
    const content   = chatInput.value.trim();
    if (!content || !chatWithUserId) return;

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const user = await getUser();
      const { error } = await supabaseClient.from('messages').insert({
        from_user_id: user.id,
        to_user_id:   chatWithUserId,
        content
      });
      if (error) throw error;
      chatInput.value = '';
      loadChat(chatWithUserId);
    } catch (error) {
      alert('Erro ao enviar mensagem: ' + error.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
};

document.addEventListener('DOMContentLoaded', _setupChatForm);

// ---- Realtime ----

const subscribeToChatMessages = (userId) => {
  if (chatSubscription) {
    chatSubscription.unsubscribe();
    chatSubscription = null;
  }

  chatSubscription = supabaseClient
    .channel(`chat-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_user_id=eq.${userId}` },
      async (payload) => {
        if (chatWithUserId === payload.new.from_user_id) {
          // Mensagem do contato atual: recarrega o chat
          loadChat(chatWithUserId);
        } else {
          // Mensagem de outro contato: só atualiza contador e badges
          updateUnreadCount();
          const user    = await getUser();
          const profile = await getProfile(user.id);
          if (profile.role === 'pai') {
            const { data: daughters } = await supabaseClient
              .from('profiles').select('*').eq('role', 'filha').order('full_name');
            if (daughters?.length) renderContactList(daughters, user.id);
          }
        }
      }
    )
    .subscribe();
};

// ---- Contador global de não lidas ----

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
    console.error('Erro ao atualizar contador:', error);
  }
};

// ---- Seletor inicial de conversa ----

const loadChatSelector = async () => {
  const chatForm = document.getElementById('chatForm');
  try {
    const user    = await getUser();
    const profile = await getProfile(user.id);

    if (profile.role === 'pai') {
      // Pai: carrega lista de todas as filhas
      const { data: daughters, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('role', 'filha')
        .order('full_name', { ascending: true });

      if (error) throw error;

      if (!daughters?.length) {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
          chatMessages.innerHTML = `
            <div class="empty-state">
              <h3>Nenhuma filha cadastrada ainda</h3>
              <p>As filhas aparecerão aqui assim que criarem conta.</p>
            </div>`;
        }
        if (chatForm) chatForm.style.display = 'none';
        return;
      }

      if (chatForm) chatForm.style.display = 'none';
      await renderContactList(daughters, user.id);

      // Abre automaticamente a conversa com a primeira filha
      loadChat(daughters[0].id);

    } else {
      // Filha: abre direto o chat com o pai
      const { data: pai, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('role', 'pai')
        .limit(1)
        .single();

      if (error) throw error;
      if (pai) loadChat(pai.id);
    }

  } catch (error) {
    console.error('Erro ao carregar seletor de chat:', error);
  }
};

// Exportar para uso global
window.loadChat                = loadChat;
window.subscribeToChatMessages = subscribeToChatMessages;
window.updateUnreadCount       = updateUnreadCount;
window.loadChatSelector        = loadChatSelector;