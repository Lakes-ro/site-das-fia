// ============================================
// CLIENTE SUPABASE + HELPERS GLOBAIS
// ============================================

let supabaseClient = null;

(function initSupabase() {
  try {
    const { createClient } = supabase;
    supabaseClient = createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );
    console.log('✅ Cliente Supabase inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar Supabase:', error);
  }
})();

// ============================================
// SANITIZAÇÃO — PROTEÇÃO CONTRA XSS
// Escapa caracteres HTML antes de qualquer
// inserção via innerHTML. Usar em TODOS os
// dados vindos do banco ou do usuário.
// ============================================

const sanitize = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// ============================================
// CACHE DE PERFIL — EVITA ROUND-TRIPS
// Armazena perfis já buscados na sessão.
// Invalidado no logout via clearProfileCache().
// ============================================

const _profileCache = new Map();

const getProfile = async (userId) => {
  if (_profileCache.has(userId)) return _profileCache.get(userId);

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  _profileCache.set(userId, data);
  return data;
};

const clearProfileCache = () => _profileCache.clear();

// Invalida entrada específica do cache (ex: após atualizar tema)
const invalidateProfile = (userId) => _profileCache.delete(userId);

// ============================================
// HELPERS DE AUTH
// ============================================

const getUser = async () => {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Usuário não autenticado');
  return user;
};

// ============================================
// UPLOAD DE MÍDIA
// ============================================

const uploadMedia = async (file) => {
  const fileExt = file.name.split('.').pop().toLowerCase();
  const fileName = `${crypto.randomUUID()}_${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabaseClient.storage
    .from('family-media')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabaseClient.storage
    .from('family-media')
    .getPublicUrl(fileName);

  return publicUrl;
};

// ============================================
// EXPORTAR PARA USO GLOBAL
// ============================================

window.supabaseClient    = supabaseClient;
window.sanitize          = sanitize;
window.getUser           = getUser;
window.getProfile        = getProfile;
window.clearProfileCache = clearProfileCache;
window.invalidateProfile = invalidateProfile;
window.uploadMedia       = uploadMedia;
