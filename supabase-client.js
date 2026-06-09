// ============================================
// CLIENTE SUPABASE
// ============================================

let supabaseClient = null;

(function initSupabase() {
  try {
    // supabase é o objeto global exposto pelo unpkg build
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

// ---- Helpers globais ----

const getUser = async () => {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Usuário não autenticado');
  return user;
};

const getProfile = async (userId) => {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

const uploadMedia = async (file) => {
  const fileExt = file.name.split('.').pop();
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

// Exportar para uso global
window.supabaseClient = supabaseClient;
window.getUser = getUser;
window.getProfile = getProfile;
window.uploadMedia = uploadMedia;