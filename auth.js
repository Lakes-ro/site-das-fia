// ============================================
// SISTEMA DE AUTENTICAÇÃO
// Regra de segurança: role NUNCA é enviada pelo cliente.
// O trigger no PostgreSQL define a role com base no e-mail.
// ============================================

const loginForm      = document.getElementById('loginForm');
const signupForm     = document.getElementById('signupForm');
const showSignupLink = document.getElementById('showSignup');
const showLoginLink  = document.getElementById('showLogin');
const loginSection   = document.getElementById('loginSection');
const signupSection  = document.getElementById('signupSection');
const authMessage    = document.getElementById('authMessage');

// ---- Helpers de UI ----

const showMessage = (text, type) => {
  if (!authMessage) return;
  authMessage.textContent = text;
  authMessage.className = `auth-message ${type}`;
};

const setLoading = (form, isLoading) => {
  const btn = form?.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Aguarde...' : (form.id === 'loginForm' ? 'Entrar' : 'Criar Conta');
};

// ---- Toggle entre login e signup ----

showSignupLink?.addEventListener('click', (e) => {
  e.preventDefault();
  loginSection.style.display = 'none';
  signupSection.style.display = 'block';
  authMessage.className = 'auth-message';
  authMessage.textContent = '';
});

showLoginLink?.addEventListener('click', (e) => {
  e.preventDefault();
  signupSection.style.display = 'none';
  loginSection.style.display = 'block';
  authMessage.className = 'auth-message';
  authMessage.textContent = '';
});

// ---- Login ----

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showMessage('❌ Preencha todos os campos.', 'error');
    return;
  }

  setLoading(loginForm, true);

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.user) throw new Error('Falha na autenticação. Tente novamente.');

    showMessage('✅ Login realizado! Redirecionando...', 'success');
    setTimeout(() => { window.location.href = 'app.html'; }, 800);
  } catch (error) {
    console.error('Erro no login:', error);
    const friendlyErrors = {
      'Invalid login credentials': 'E-mail ou senha incorretos.',
      'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
      'Too many requests': 'Muitas tentativas. Aguarde alguns minutos.'
    };
    const msg = friendlyErrors[error.message] || error.message;
    showMessage(`❌ ${msg}`, 'error');
    setLoading(loginForm, false);
  }
});

// ---- Signup ----

signupForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('signupName').value.trim();
  const username = document.getElementById('signupUsername').value.trim().replace(/^@/, '').toLowerCase();
  const email    = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;

  if (!fullName || !username || !email || !password) {
    showMessage('❌ Preencha todos os campos.', 'error');
    return;
  }

  if (password.length < 6) {
    showMessage('❌ A senha deve ter pelo menos 6 caracteres.', 'error');
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showMessage('❌ Nome de usuário: use apenas letras, números e _.', 'error');
    return;
  }

  setLoading(signupForm, true);

  try {
    // Verificar username duplicado ANTES de criar a conta
    const { data: existing, error: checkError } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) {
      showMessage('❌ Este nome de usuário já está em uso.', 'error');
      setLoading(signupForm, false);
      return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username
          // NOTA DE SEGURANÇA: "role" NÃO é enviado aqui.
          // O trigger handle_new_user() no PostgreSQL define a role
          // automaticamente: rogerhugosantos@gmail.com → 'pai', demais → 'filha'.
        }
      }
    });

    if (error) throw error;

    // Se confirmação de e-mail está desabilitada, Supabase retorna sessão imediata
    if (data?.session) {
      showMessage('✅ Conta criada! Entrando...', 'success');
      setTimeout(() => { window.location.href = 'app.html'; }, 800);
    } else {
      showMessage('✅ Conta criada! Você já pode fazer login.', 'success');
      setTimeout(() => {
        signupSection.style.display = 'none';
        loginSection.style.display = 'block';
        signupForm.reset();
        authMessage.className = 'auth-message';
        authMessage.textContent = '';
      }, 2500);
    }

  } catch (error) {
    console.error('Erro no signup:', error);
    const friendlyErrors = {
      'User already registered': 'Este e-mail já está cadastrado.',
      'Password should be at least 6 characters': 'Senha muito curta (mínimo 6 caracteres).',
    };
    const msg = friendlyErrors[error.message] || error.message;
    showMessage(`❌ ${msg}`, 'error');
    setLoading(signupForm, false);
  }
});

// ---- Guard: redireciona se já estiver logado ----

(async () => {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) window.location.href = 'app.html';
  } catch (_) {
    // Não autenticado — permanece na página de login
  }
})();
