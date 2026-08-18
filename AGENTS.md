# Critic-MCP — Proje Anayasası

## Amaç
Diğer AI kodlama asistanlarının (Cursor, OpenCode vb.) yazdığı kodu salt okunur olarak denetleyen, "İkinci Göz / Eleştirmen" rolünde açık kaynak bir MCP sunucusu. Tek tool: `review_code`. Kesinlikle dosyaya yazma yetkisi yoktur.

## Teknoloji Yığını
- Node.js >= 20 (ESM, `"type": "module"`) ve TypeScript (NodeNext çözünürlük)
- `@modelcontextprotocol/sdk` — tek tool: `review_code` (stdio transport)
- `zod` — girdi şema doğrulaması (sonraki aşamada handler'a eklenecek)
- LLM: `@google/genai` (Gemini) veya `openai` paketleri (OpenAI / DeepSeek uyumlu)
- Yetkilendirme: `critic-mcp auth` CLI akışı → `~/.critic-mcp.json` (0600); env anahtarları dosyaya önceliklidir, asla hardcode değil

## Klasör Yapısı
```
src/index.ts   -> MCP sunucu (tools/list + tools/call), zod doğrulama, hata yönetimi, `auth` argv yönlendirmesi
src/schema.ts  -> review_code zod girdi şeması (tek geçerli kaynak)
src/prompt.ts  -> Kritic sistem promptu ve kullanıcı promptu birleştirici
src/llm.ts     -> LLM istemci katmanı (gemini | openai | deepseek), zaman aşımı koruması
src/chunker.ts -> Satır-sonu bazlı kod parçalama (chunking) — varsayılan sınır 30.000 karakter
src/config.ts  -> Global yapılandırma (~/.critic-mcp.json) + kimlik çözümleme (env → dosya)
src/cli.ts     -> İnteraktif yetkilendirme akışı (`critic-mcp auth`)
tests/         -> Vitest birim testleri (validation.test.ts, llm.test.ts, chunking.test.ts, config.test.ts, cli.test.ts)
dist/          -> Derleme çıktısı (git'e girmiyor)
examples/      -> Manuel test: bad_code.js (SQLi+XSS+N+1) ve intent.txt
.env.example   -> Çevresel değişken şablonu (tümü isteğe bağlı)
```

## Standartlar
- Değişken/fonksiyon/dosya adları İngilizce; açıklama ve yorumlar Türkçe.
- Yalnızca istenen işlevi yaz (YAGNI); gereksiz soyutlamadan kaçın.
- Read-only prensibi: Sunucu hiçbir dosyaya yazamaz, sadece string rapor döner. Tek istisna: `auth` komutunun `~/.critic-mcp.json`'a yazması (0600 izni, MCP sunucusu başlatılmadan).
- LLM çıktısı standart metin olarak MCP istemcisine geri döner.
- Her derleme/değişiklik öncesi `npm run typecheck` çalıştırılmalıdır.

## Komutlar
- `npm run build` — TypeScript derlemesi (tsc)
- `npm run typecheck` — Tipleri kontrol et
- `npm test` — Vitest birim testlerini çalıştır
- `npm run test:watch` — Vitest izleme modunda
- `npm start` — Sunucuyu başlat (stdio)
- `node dist/index.js auth` — İnteraktif yetkilendirme (yayındayken: `npx critic-mcp auth`)
- `npm run inspect` — MCP Inspector ile manuel test
