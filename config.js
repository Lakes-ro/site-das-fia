// ============================================
// CONFIGURAÇÃO DO SUPABASE
// Substitua apenas se trocar de projeto.
// ============================================

const SUPABASE_URL     = 'https://mbdqwvwnukevpbkojaxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZHF3dndudWtldnBia29qYXh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5ODUyMTAsImV4cCI6MjA4NTU2MTIxMH0.2AuVVPpPPeiMzWUsxtCm8dWHq64_FIBUrPwhrNhblyY';

// Validação mínima — avisa só se os campos estiverem em branco
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_URL ou SUPABASE_ANON_KEY estão vazios em js/config.js');
}

window.SUPABASE_CONFIG = {
  url:     SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY
};