# Proje İlerleme Durumu

## Tamamlanan Özellikler
- [x] Proje iskeletinin kurulumu: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- [x] `src/index.ts`: Stdio MCP sunucu iskeleti, `ListTools` handler (tek tool: `review_code`) ve placeholder `CallTool` handler
- [x] **Adım 2:** zod ile katı girdi doğrulaması (`code_snippet` min/max, `intent` min/max)
- [x] **Adım 2:** `src/prompt.ts` — "Acımasız Kod Denetmeni" sistem promptu (SQLi/XSS/yetki yükseltme, edge-case, N+1 direktifleri; Türkçe report formatı)
- [x] **Adım 2:** `src/llm.ts` — `CRITIC_PROVIDER` ile provider seçimi (gemini | openai | deepseek), `CRITIC_TIMEOUT_MS` zaman aşımı koruması, eksik API anahtarı ve API hatalarının normalizasyonu
- [x] **Adım 2:** Hata yönetimi — doğrulama ve LLM hataları `isError: true` ile JSON-RPC standardında döner (smoke test doğruladı)
- [x] **Adım 3:** `README.md` — kurulum, `.env` tablosu, komutlar ve **Cursor / OpenCode / Cline / Continue.dev** entegrasyon konfigürasyonları (resmi formatlar doğrulanarak yazıldı)
- [x] **Adım 3:** `examples/bad_code.js` (SQLi + XSS + N+1 + yetkilendirme yok) ve `examples/intent.txt` — manuel test senaryosu
- [x] **Adım 4:** Vitest kuruldu (`test`, `test:watch` betikleri), refactor: zod şeması `src/schema.ts`'ye taşındı, `withTimeout` export edildi
- [x] **Adım 4:** `tests/validation.test.ts` — 10 test (boş/uzun/eksik/tip hatası/sınır durumları)
- [x] **Adım 4:** `tests/llm.test.ts` — 14 test (mock SDK'lar ile başarılı akışlar, zaman aşımı, provider seçimi, hata normalizasyonu)
- [x] **Adım 4:** Tüm testler yeşil: **24/24 geçti**; build + smoke test doğrulandı
- [x] **Adım 5:** `src/chunker.ts` — satır-sonu bazlı parçalama (`DEFAULT_CHUNK_SIZE = 30.000`), greedy birleştirme, tek parça garanti, minified kod için zorla bölme; orijinal kod birebir yeniden kurulabiliyor (test buldu: boş satır kaybı düzeltildi)
- [x] **Adım 5:** `src/prompt.ts` — `buildMapUserPrompt` (parça numarası + satır aralığı) ve `REDUCE_SYSTEM_PROMPT` + `buildReduceUserPrompt` (önceki bulguları zayıflatmama, deduplikasyon ve tek parça KRITIK bulguda ONAY vermeme kuralları)
- [x] **Adım 5:** `src/llm.ts` — `reviewCode()` orkestrasyonu: tek parça → doğrudan analiz, çok parça → map (concurrency limitli) + reduce; tek parça hatası tüm akışı öldürmez
- [x] **Adım 5:** `.env.example` güncellendi: `CHUNK_SIZE`, `CRITIC_CONCURRENCY` (varsayılan 3, rate limit koruması)
- [x] **Adım 5:** `tests/chunking.test.ts` (12 test) + `llm.test.ts`'ye `mapWithConcurrency` testleri (3 test) eklendi
- [x] **Adım 6:** `.github/workflows/ci.yml` — GitHub Actions CI: main'e push + tüm pull_request'larda çalışır; sıralı adımlar: checkout → Node 22 → npm ci → typecheck → build → test; yaml parse ile doğrulandı; concurrency grubu ile eski işler iptal edilir
- [x] **Adım 7:** `LICENSE` (MIT) ve `CONTRIBUTING.md` (kurulum, test akışı, Zod şema kuralları, PR standartları, güvenlik bildirimi) eklendi
- [x] **Adım 7:** Git başlatıldı — dal `main`, 21 dosya sahnelendi, ilk commit: `37f48bf "feat: initial commit for Critic-MCP"`; `67459a4 docs: Adim 7 ilerleme notlari` (hassas dosya yok: `dist/` ve `.env` git'e girmedi)
- [x] **Adım 8:** Global CLI yetkilendirme sistemi
  - `src/config.ts` — `~/.critic-mcp.json` okuma/yazma (0600 izni), `resolveCredentials()`/`resolveProvider()`: önce `process.env` → sonra yapılandırma dosyası; anahtar yoksa `npx critic-mcp auth` yönlendirmeli hata
  - `src/cli.ts` — interaktif `auth` akışı (satır kuyruğu tabanlı stdio; piped girdide readline race koşulu canlı yakalandı ve düzeltildi)
  - `src/index.ts` — `auth` argv yönlendirmesi (MCP sunucusu başlatılmaz); `llm.ts` anahtar çözümlemesini config katmanından alır
  - Testler: `config.test.ts` (+19), `cli.test.ts` (+6), `llm.test.ts` güncellendi → **5 dosya, 64 test, tamamı yeşil**
  - Canlı doğrulama: `| node dist/index.js auth` → config dosyası yazıldı (exit 0); anahtarsız MCP çağrısı → "npx critic-mcp auth" hatası
  - README/CONTRIBUTING/`.env.example`: IDE config'lerden anahtarlar kaldırıldı, kurulum iki adıma indirildi; env değişkenleri tümüyle isteğe bağlı
- [x] **Adım 9:** İngilizce lokali̇zasyon (i18n)
  - `src/prompt.ts` — sistem promptu ("ruthless, read-only Senior Security and Performance Architect"), rapor formatı `Verdict: APPROVED | MODIFICATION_REQUIRED | REJECTED`, section başlıkları ve severity etiketleri (CRITICAL/HIGH/MEDIUM/LOW) İngilizce
  - Runtime mesajları tamamı İngilizce: CLI auth soruları/success mesajları, `AUTH_HINT`, provider hataları, timeout, chunk hata log'ları (`[Chunk N/M could not be analyzed: ...]`), MCP tool hataları
  - Tüm testler (5 dosya) İngilizce assertion'larla yeniden yazıldı → **64/64 yeşil**
  - `README.md` + `CONTRIBUTING.md` profesyonel İngilizce tam çeviri; `package.json` description güncellendi; `.env.example` ve `examples/` İngilizce
  - Canlı doğrulama: `npx critic-mcp auth` benzeri piped akış İngilizce çıktı; anahtar çözümleme → gerçek Gemini API çağrısı → Google 400 hatasının temiz normalizasyonu (tüm yığın çalışıyor)

## Mevcut Hatalar
- (Bilinen hata yok)

## Sıradaki Görevler
- [ ] Adım 9 commit + push (`git push -u origin main`) → CI'nin yeşil olduğunu gözlemle
- [ ] Gerçek geçerli LLM anahtarı ile uçtan uca test (`npm run inspect`)
- [ ] npm yayını (bin hazır: `critic-mcp` → `dist/index.js`, `files: ["dist"]`)
