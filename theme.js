// ============================================
// THE CHAMELEON ENGINE - SISTEMA DE TEMAS
// ============================================

const DEFAULT_THEME = {
  primary_color: '#8B5CF6',
  bg_color: '#0F172A',
  text_color: '#F8FAFC',
  font_family: 'Inter'
};

let currentTheme = { ...DEFAULT_THEME };

let currentUserId = null;

// Aplicar tema nas CSS variables
const applyTheme = (theme) => {
  const root = document.documentElement;
  root.style.setProperty('--primary-color', theme.primary_color);
  root.style.setProperty('--bg-color', theme.bg_color);
  root.style.setProperty('--text-color', theme.text_color);
  root.style.setProperty('--font-family', theme.font_family + ', sans-serif');

  // Cor secundária derivada do bg
  const rgb = hexToRgb(theme.bg_color);
  if (rgb) {
    const clamp = (v) => Math.min(255, Math.max(0, v));
    root.style.setProperty(
      '--bg-secondary',
      `rgb(${clamp(rgb.r + 20)}, ${clamp(rgb.g + 20)}, ${clamp(rgb.b + 20)})`
    );
  }

  currentTheme = { ...theme };
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// Carregar tema do banco
const loadUserTheme = async (userId) => {
  try {
    currentUserId = userId;
    const profile = await getProfile(userId);
    if (profile?.theme_settings) {
      // Merge com defaults para garantir todos os campos
      applyTheme({ ...DEFAULT_THEME, ...profile.theme_settings });
    }
  } catch (error) {
    console.error('Erro ao carregar tema:', error);
  }
};

// Salvar tema no banco
const saveTheme = async (theme) => {
  if (!currentUserId) return;
  const { error } = await supabaseClient
    .from('profiles')
    .update({ theme_settings: theme })
    .eq('id', currentUserId);
  if (error) throw error;
  applyTheme(theme);
};

// ---- UI do Modal ----
const themeModal = document.getElementById('themeModal');
const navSettings = document.getElementById('navSettings');
const primaryColorInput = document.getElementById('primaryColor');
const bgColorInput = document.getElementById('bgColor');
const textColorInput = document.getElementById('textColor');
const fontFamilySelect = document.getElementById('fontFamily');
const btnSaveTheme = document.getElementById('btnSaveTheme');
const btnResetTheme = document.getElementById('btnResetTheme');

navSettings?.addEventListener('click', () => {
  if (!themeModal) return;
  primaryColorInput.value = currentTheme.primary_color;
  bgColorInput.value = currentTheme.bg_color;
  textColorInput.value = currentTheme.text_color;
  fontFamilySelect.value = currentTheme.font_family;
  themeModal.classList.add('active');
});

themeModal?.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => themeModal.classList.remove('active'));
});

// Preview ao vivo
[primaryColorInput, bgColorInput, textColorInput, fontFamilySelect].forEach(input => {
  input?.addEventListener('input', () => {
    applyTheme({
      primary_color: primaryColorInput.value,
      bg_color: bgColorInput.value,
      text_color: textColorInput.value,
      font_family: fontFamilySelect.value
    });
  });
});

btnSaveTheme?.addEventListener('click', async () => {
  const newTheme = {
    primary_color: primaryColorInput.value,
    bg_color: bgColorInput.value,
    text_color: textColorInput.value,
    font_family: fontFamilySelect.value
  };
  try {
    await saveTheme(newTheme);
    alert('✅ Tema salvo!');
    themeModal.classList.remove('active');
  } catch (error) {
    alert('❌ Erro ao salvar tema: ' + error.message);
  }
});

btnResetTheme?.addEventListener('click', () => {
  const def = { ...DEFAULT_THEME };
  primaryColorInput.value = def.primary_color;
  bgColorInput.value = def.bg_color;
  textColorInput.value = def.text_color;
  fontFamilySelect.value = def.font_family;
  applyTheme(def);
});

// Exportar
window.loadUserTheme = loadUserTheme;
window.applyTheme = applyTheme;
window.saveTheme = saveTheme;